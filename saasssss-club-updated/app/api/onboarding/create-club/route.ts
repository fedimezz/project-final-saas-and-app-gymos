import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { PUBLIC_PLAN_WHERE } from "@/lib/saas-plan-access";
import { billingPeriodSchema, planPrice, BILLING_PERIOD_LABEL } from "@/lib/billing-period";
import { emailMailbox } from "@/lib/trial";
import { Prisma } from "@prisma/client";
import { hashPassword } from "@/lib/bcrypt";
import { hashSecret } from "@/lib/otp";
import { slugSchema } from "@/lib/slug";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { createStripeCheckoutSession, getStripe, toStripeMinorUnits } from "@/lib/payments/stripe";
import { isSupportedPaymentCountry } from "@/lib/payment-country";
import { isStripeConfigured } from "@/lib/payments/availability";
import crypto from "crypto";
import { generateBridgeToken, hashBridgeNonce } from "@/lib/auth";
import { buildAuthCookieOptions } from "@/lib/auth-cookie";
import { BRIDGE_NONCE_COOKIE } from "@/lib/bridge-nonce";
import { DEFAULT_TRIAL_DAYS } from "@/lib/platform-clubs";
import { isSelectableThemeId } from "@/lib/website-themes";
import { phoneSchema } from "@/lib/validation";
import { isRecurringEnabled, stripeIntervalFor } from "@/lib/saas-recurring";
import { MANUAL_METHODS, AWAITING_MANUAL_PAYMENT_REASON } from "@/lib/manual-payment-shared";
import { alertPlatformOfManualRequest, manualPaymentInstructions } from "@/lib/manual-payment";

const schema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().email("Email invalide").toLowerCase(),
  password: z.string().min(8, "Mot de passe trop court (8 car. min.)").max(100),
  phone: z.string().trim().optional(),
  clubName: z.string().trim().min(2, "Nom du club trop court").max(100),
  slug: z.string().trim().regex(/^[a-z0-9-]+$/, "Slug : minuscules, chiffres, tirets uniquement").pipe(slugSchema),
  planId: z.string().min(1, "Plan obligatoire"),
  verificationToken: z.string().min(32).max(200),
  countryCode: z.string().trim().length(2).transform((value) => value.toUpperCase()).optional(),
  // Default: free 14-day trial, no card, any country. `false` = pay (Stripe) right away.
  startTrial: z.boolean().optional(),
  // Only used when paying now (startTrial:false). The trial itself has no period.
  billingPeriod: billingPeriodSchema.default("MONTHLY"),
  // Paying now WITHOUT a card (transfer / D17 / Flouci / cash): the club is created suspended with a PENDING
  // request; nothing is activated until SUPER_ADMIN approves it and verifies the payment.
  payWith: z.enum(["STRIPE", "MANUAL"]).optional(),
  method: z.enum(MANUAL_METHODS).optional(),
  contactPhone: phoneSchema.optional(),
  manualNote: z.string().trim().max(500).optional(),
  themeId: z.string().trim().min(1).max(40).refine(isSelectableThemeId, "Thème inconnu ou retiré.").optional(),
  primaryColor: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
  secondaryColor: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
  heroTitle: z.string().trim().max(200).optional(),
  heroSubtitle: z.string().trim().max(500).optional(),
  address: z.string().trim().max(200).optional(),
});

class UnverifiedOnboardingEmailError extends Error {}

async function deletePendingClub(clubId: string, ownerId: string) {
  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.user.deleteMany({ where: { id: ownerId, clubId, role: "OWNER" } });
    await tx.club.deleteMany({ where: { id: clubId, status: "SUSPENDED" } });
  });
}

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  const rateLimit = await checkRateLimit(`onboarding:${ip}`, 5, 60 * 60 * 1000);
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Trop de tentatives. Réessayez dans une heure." }, { status: 429 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Données invalides" }, { status: 400 });
  }

  const {
    name, email, password, phone, clubName, slug, planId, verificationToken, countryCode, startTrial, billingPeriod, payWith, method, contactPhone, manualNote,
    themeId, primaryColor, secondaryColor, heroTitle, heroSubtitle, address,
  } = parsed.data;

  // Server-side: a withdrawn (non-public) plan cannot be chosen by posting its id.
  const plan = await prisma.saasPlan.findFirst({
    where: { id: planId, ...PUBLIC_PLAN_WHERE },
    select: { id: true, name: true, priceMonthly: true, priceYearly: true, currency: true },
  });
  if (!plan) return NextResponse.json({ error: "Plan SaaS introuvable ou indisponible" }, { status: 400 });

  if (plan.priceMonthly <= 0) {
    return NextResponse.json({ error: "La création d'un club nécessite un plan payant." }, { status: 400 });
  }
  const trialSignup = startTrial !== false;
  const manualSignup = !trialSignup && payWith === "MANUAL";
  if (manualSignup && (!method || !contactPhone)) {
    return NextResponse.json({ error: "Choisissez un moyen de paiement et indiquez un numéro de téléphone pour être contacté." }, { status: 400 });
  }
  if (!trialSignup && !manualSignup) {
    if (!countryCode || !isSupportedPaymentCountry(countryCode)) {
      return NextResponse.json({ error: "Sélectionnez un pays valide pour vérifier les moyens de paiement." }, { status: 400 });
    }
    if (countryCode === "TN") {
      return NextResponse.json({
        error: "Le paiement Stripe pour créer un club n'est pas disponible en Tunisie. Démarrez l'essai gratuit puis payez par virement / D17 / Flouci.",
      }, { status: 400 });
    }
    // Stripe not configured on this deployment: refuse BEFORE creating anything, and tell the client to
    // fall back to the contact / pay-without-card route (or the free trial).
    if (!isStripeConfigured()) {
      return NextResponse.json({
        error: "Le paiement par carte n'est pas disponible pour le moment. Choisissez « Nous contacter / payer sans carte » ou démarrez l'essai gratuit.",
        code: "STRIPE_UNAVAILABLE",
      }, { status: 400 });
    }
  }

  const [slugTaken, emailTaken] = await Promise.all([
    prisma.club.findUnique({ where: { slug }, select: { id: true } }),
    prisma.user.findFirst({ where: { email }, select: { id: true } }),
  ]);
  if (slugTaken) return NextResponse.json({ error: "Ce sous-domaine est déjà utilisé.", field: "slug" }, { status: 409 });
  if (emailTaken) return NextResponse.json({ error: "Cet email est déjà associé à un compte.", field: "email" }, { status: 409 });

  if (trialSignup) {
    // Anti-abuse (one free trial per person): the same mailbox written with a "+tag" alias, or the same
    // phone number as an existing club owner, is refused. Paying clubs (startTrial:false) are unaffected.
    const { local, domain } = emailMailbox(email);
    const repeatTrial = await prisma.user.findFirst({
      where: {
        role: "OWNER",
        OR: [
          { email: `${local}@${domain}` },
          { email: { startsWith: `${local}+`, endsWith: `@${domain}`, mode: "insensitive" } },
          ...(phone ? [{ phone }] : []),
        ],
      },
      select: { id: true },
    });
    if (repeatTrial) {
      return NextResponse.json(
        { error: "Un essai gratuit a déjà été utilisé avec cet email ou ce numéro. Choisissez un plan pour créer un nouveau club.", field: "email", code: "TRIAL_ALREADY_USED" },
        { status: 409 }
      );
    }
    try {
      const hashedTrialPassword = await hashPassword(password);
      const trialNow = new Date();
      const trialEndsAt = new Date(trialNow.getTime() + DEFAULT_TRIAL_DAYS * 86_400_000);
      const created = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const consumed = await tx.onboardingEmailVerification.updateMany({
          where: {
            email,
            verificationTokenHash: hashSecret(verificationToken),
            verifiedAt: { not: null },
            expiresAt: { gt: trialNow },
            consumedAt: null,
          },
          data: { consumedAt: trialNow },
        });
        if (consumed.count !== 1) throw new UnverifiedOnboardingEmailError("Founder email verification is missing, expired, or already used");

        const club = await tx.club.create({ data: { slug, name: clubName, status: "TRIAL", trialEndsAt } });
        const owner = await tx.user.create({
          data: {
            clubId: club.id, name, email, phone: phone || null, password: hashedTrialPassword,
            role: "OWNER", isActive: true, emailVerified: trialNow,
          },
          select: { id: true, clubId: true },
        });
        await tx.clubSubscription.create({
          data: {
            clubId: club.id, planId: plan.id, status: "TRIALING", trialEndsAt,
            currentPeriodStart: trialNow, currentPeriodEnd: trialEndsAt,
          },
        });
        await tx.gymSettings.create({
          data: {
            clubId: club.id,
            name: clubName,
            address: address || null,
            themeId: themeId || "classic",
            primaryColor: primaryColor || "#4f46e5",
            secondaryColor: secondaryColor || "#3b82f6",
            heroTitle: heroTitle || null,
            heroSubtitle: heroSubtitle || null,
            enabledPages: { coaching: true, offres: true, actualites: true, gallery: true },
          },
        });
        return { club, owner };
      }, { maxWait: 15_000, timeout: 30_000 });

      const nonce = crypto.randomBytes(16).toString("hex");
      const bridgeToken = generateBridgeToken({ id: created.owner.id, clubId: created.club.id, nonceHash: hashBridgeNonce(nonce) });
      const response = NextResponse.json({
        ok: true,
        trial: true,
        trialEndsAt: trialEndsAt.toISOString(),
        bridgeToken,
        club: { id: created.club.id, slug: created.club.slug, name: created.club.name },
      });
      response.cookies.set(BRIDGE_NONCE_COOKIE, nonce, { ...buildAuthCookieOptions(request.url), maxAge: 120 });
      return response;
    } catch (error) {
      if (error instanceof UnverifiedOnboardingEmailError) {
        return NextResponse.json({ error: "Vérifiez votre adresse email avant de créer le club.", field: "email" }, { status: 403 });
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return NextResponse.json({ error: "Ce sous-domaine ou cet email est déjà utilisé.", field: "slug" }, { status: 409 });
      }
      console.error("create-club trial error:", error);
      return NextResponse.json({ error: "Erreur lors de la création du club. Réessayez." }, { status: 500 });
    }
  }

  const price = planPrice(plan, billingPeriod);
  if (price === null) {
    return NextResponse.json({ error: `Ce plan n'est pas disponible en facturation ${BILLING_PERIOD_LABEL[billingPeriod].toLowerCase()}.` }, { status: 400 });
  }

  if (manualSignup && method && contactPhone) {
    try {
      const hashedManualPassword = await hashPassword(password);
      const manualNow = new Date();
      const created = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const consumed = await tx.onboardingEmailVerification.updateMany({
          where: {
            email,
            verificationTokenHash: hashSecret(verificationToken),
            verifiedAt: { not: null },
            expiresAt: { gt: manualNow },
            consumedAt: null,
          },
          data: { consumedAt: manualNow },
        });
        if (consumed.count !== 1) throw new UnverifiedOnboardingEmailError("Founder email verification is missing, expired, or already used");

        // SUSPENDED until a human approves AND verifies the payment: no access, no session.
        const club = await tx.club.create({
          data: { slug, name: clubName, status: "SUSPENDED", suspendedAt: manualNow, suspendedReason: AWAITING_MANUAL_PAYMENT_REASON },
        });
        const owner = await tx.user.create({
          data: { clubId: club.id, name, email, phone: phone || null, password: hashedManualPassword, role: "OWNER", isActive: true, emailVerified: manualNow },
          select: { id: true },
        });
        await tx.clubSubscription.create({
          data: { clubId: club.id, planId: plan.id, status: "SUSPENDED", currentPeriodStart: manualNow, currentPeriodEnd: null, billingPeriod },
        });
        await tx.gymSettings.create({
          data: {
            clubId: club.id,
            name: clubName,
            address: address || null,
            themeId: themeId || "classic",
            primaryColor: primaryColor || "#4f46e5",
            secondaryColor: secondaryColor || "#3b82f6",
            heroTitle: heroTitle || null,
            heroSubtitle: heroSubtitle || null,
            enabledPages: { coaching: true, offres: true, actualites: true, gallery: true },
          },
        });
        // Amount = the plan's price for that period, read from the DB above (never from the request).
        const request = await tx.manualPaymentRequest.create({
          data: {
            clubId: club.id, planId: plan.id, billingPeriod, requestedBy: owner.id, method,
            contactPhone, note: manualNote || null, amount: price, currency: plan.currency,
          },
        });
        return { club, request };
      }, { maxWait: 15_000, timeout: 30_000 });

      alertPlatformOfManualRequest({
        clubName: clubName, clubSlug: slug, planName: plan.name, price, currency: plan.currency,
        billingPeriod, method, contactPhone, note: manualNote, newClub: true,
      });
      return NextResponse.json({
        ok: true,
        pendingManualPayment: true,
        instructions: manualPaymentInstructions(),
        amount: price,
        currency: plan.currency,
        billingPeriod,
        club: { id: created.club.id, slug: created.club.slug, name: created.club.name },
      });
    } catch (error) {
      if (error instanceof UnverifiedOnboardingEmailError) {
        return NextResponse.json({ error: "Vérifiez votre adresse email avant de créer le club.", field: "email" }, { status: 403 });
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return NextResponse.json({ error: "Ce sous-domaine ou cet email est déjà utilisé.", field: "slug" }, { status: 409 });
      }
      console.error("create-club manual error:", error);
      return NextResponse.json({ error: "Erreur lors de la création du club. Réessayez." }, { status: 500 });
    }
  }

  try {
    toStripeMinorUnits(price, plan.currency);
  } catch {
    return NextResponse.json({ error: "Le tarif de ce plan n'est pas compatible avec un paiement Stripe." }, { status: 400 });
  }

  if (!countryCode) return NextResponse.json({ error: "Pays requis." }, { status: 400 });
  const hashedPassword = await hashPassword(password);
  const now = new Date();
  let createdClubId: string | null = null;
  let createdOwnerId: string | null = null;
  let checkoutSessionId: string | null = null;

  try {
    const created = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const consumedVerification = await tx.onboardingEmailVerification.updateMany({
        where: {
          email,
          verificationTokenHash: hashSecret(verificationToken),
          verifiedAt: { not: null },
          expiresAt: { gt: now },
          consumedAt: null,
        },
        data: { consumedAt: now },
      });
      if (consumedVerification.count !== 1) {
        throw new UnverifiedOnboardingEmailError("Founder email verification is missing, expired, or already used");
      }

      const club = await tx.club.create({
        data: { slug, name: clubName, status: "SUSPENDED" },
      });

      const owner = await tx.user.create({
        data: {
          clubId: club.id,
          name,
          email,
          phone: phone || null,
          password: hashedPassword,
          role: "OWNER",
          isActive: true,
          emailVerified: new Date(),
        },
        select: { id: true, name: true, email: true, role: true, clubId: true },
      });

      const subscription = await tx.clubSubscription.create({
        data: {
          clubId: club.id,
          planId: plan.id,
          status: "SUSPENDED",
          currentPeriodStart: now,
          currentPeriodEnd: null,
          billingPeriod,
        },
      });

      await tx.gymSettings.create({
        data: {
          clubId: club.id,
          name: clubName,
          address: address || null,
          themeId: themeId || "classic",
          primaryColor: primaryColor || "#4f46e5",
          secondaryColor: secondaryColor || "#3b82f6",
          heroTitle: heroTitle || null,
          heroSubtitle: heroSubtitle || null,
          enabledPages: { coaching: true, offres: true, actualites: true, gallery: true },
        },
      });

      const payment = await tx.saasPayment.create({
        data: {
          clubId: club.id,
          subscriptionId: subscription.id,
          amount: price,
          currency: plan.currency,
          status: "PENDING",
          paymentProvider: "STRIPE",
          countryCode,
          billingPeriod,
        },
      });

      return { club, owner, subscription, payment };
    }, {
      // Default is 5s. With a remote database (high latency per query) these 6 writes
      // can exceed it and the whole signup fails with P2028 "Transaction already closed".
      maxWait: 15_000,
      timeout: 30_000,
    });
    createdClubId = created.club.id;
    createdOwnerId = created.owner.id;

    const platformOrigin = process.env.APP_URL || request.nextUrl.origin;
    // A signup is always a first payment: auto-renewing when STRIPE_RECURRING_ENABLED (default off).
    const recurring = isRecurringEnabled();
    const checkout = await createStripeCheckoutSession({
      amount: created.payment.amount,
      currency: created.payment.currency,
      productName: `${plan.name} — abonnement ClubX ${billingPeriod === "YEARLY" ? "annuel" : "mensuel"}`,
      customerEmail: created.owner.email,
      clientReferenceId: created.payment.id,
      metadata: {
        kind: "SAAS_SIGNUP",
        saasPaymentId: created.payment.id,
        subscriptionId: created.subscription.id,
        clubId: created.club.id,
        planId: plan.id,
        countryCode,
        billingPeriod,
        recurring: recurring ? "true" : "false",
        ownerId: created.owner.id,
      },
      ...(recurring ? { recurring: { interval: stripeIntervalFor(billingPeriod) } } : {}),
      successUrl: `${platformOrigin.replace(/\/$/, "")}/api/onboarding/complete?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${platformOrigin.replace(/\/$/, "")}/api/onboarding/cancel?session_id={CHECKOUT_SESSION_ID}`,
    });
    checkoutSessionId = checkout.id;

    await prisma.saasPayment.update({
      where: { id: created.payment.id },
      data: { providerRef: checkout.id },
    });

    return NextResponse.json({
      ok: true,
      pendingPayment: true,
      paymentUrl: checkout.url,
      club: { id: created.club.id, slug: created.club.slug, name: created.club.name },
    });
  } catch (error) {
    if (error instanceof UnverifiedOnboardingEmailError) {
      return NextResponse.json({ error: "Vérifiez votre adresse email avant de créer le club.", field: "email" }, { status: 403 });
    }
    console.error("create-club error:", error);
    let safelyExpired = !checkoutSessionId;
    if (checkoutSessionId) {
      try {
        await getStripe().checkout.sessions.expire(checkoutSessionId);
        safelyExpired = true;
      } catch (expireError) {
        console.error("Could not expire signup checkout after initialization failure", { checkoutSessionId, expireError });
      }
    }
    if (safelyExpired && createdClubId && createdOwnerId) {
      try {
        await deletePendingClub(createdClubId, createdOwnerId);
      } catch (cleanupError) {
        console.error("Could not remove unpaid pending club after checkout failure", { createdClubId, cleanupError });
      }
    }
    return NextResponse.json({ error: "Erreur lors de la préparation du paiement. Réessayez ou contactez le support." }, { status: 500 });
  }
}
