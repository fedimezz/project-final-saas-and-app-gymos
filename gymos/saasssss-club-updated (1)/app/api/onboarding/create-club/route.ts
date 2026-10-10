import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { hashPassword } from "@/lib/bcrypt";
import { hashSecret } from "@/lib/otp";
import { slugSchema } from "@/lib/slug";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { createStripeCheckoutSession, getStripe, toStripeMinorUnits } from "@/lib/payments/stripe";
import { isSupportedPaymentCountry } from "@/lib/payment-country";

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
  themeId: z.string().trim().min(1).max(40).optional(),
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
    name, email, password, phone, clubName, slug, planId, verificationToken, countryCode,
    themeId, primaryColor, secondaryColor, heroTitle, heroSubtitle, address,
  } = parsed.data;

  const plan = await prisma.saasPlan.findFirst({
    where: { id: planId, isActive: true },
    select: { id: true, name: true, priceMonthly: true, currency: true },
  });
  if (!plan) return NextResponse.json({ error: "Plan SaaS introuvable ou inactif" }, { status: 400 });

  if (plan.priceMonthly <= 0) {
    return NextResponse.json({ error: "La création d'un club nécessite un plan payant." }, { status: 400 });
  }
  if (!countryCode || !isSupportedPaymentCountry(countryCode)) {
    return NextResponse.json({ error: "Sélectionnez un pays valide pour vérifier les moyens de paiement." }, { status: 400 });
  }
  if (countryCode === "TN") {
    return NextResponse.json({
      error: "Le paiement Stripe pour créer un club n'est pas disponible en Tunisie. Contactez le support pour souscrire.",
    }, { status: 400 });
  }

  const [slugTaken, emailTaken] = await Promise.all([
    prisma.club.findUnique({ where: { slug }, select: { id: true } }),
    prisma.user.findFirst({ where: { email }, select: { id: true } }),
  ]);
  if (slugTaken) return NextResponse.json({ error: "Ce sous-domaine est déjà utilisé.", field: "slug" }, { status: 409 });
  if (emailTaken) return NextResponse.json({ error: "Cet email est déjà associé à un compte.", field: "email" }, { status: 409 });

  try {
    toStripeMinorUnits(plan.priceMonthly, plan.currency);
  } catch {
    return NextResponse.json({ error: "Le tarif de ce plan n'est pas compatible avec un paiement Stripe." }, { status: 400 });
  }

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
          amount: plan.priceMonthly,
          currency: plan.currency,
          status: "PENDING",
          paymentProvider: "STRIPE",
          countryCode,
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
    const checkout = await createStripeCheckoutSession({
      amount: created.payment.amount,
      currency: created.payment.currency,
      productName: `${plan.name} — abonnement GymOS`,
      customerEmail: created.owner.email,
      clientReferenceId: created.payment.id,
      metadata: {
        kind: "SAAS_SIGNUP",
        saasPaymentId: created.payment.id,
        subscriptionId: created.subscription.id,
        clubId: created.club.id,
        planId: plan.id,
        countryCode,
        ownerId: created.owner.id,
      },
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
