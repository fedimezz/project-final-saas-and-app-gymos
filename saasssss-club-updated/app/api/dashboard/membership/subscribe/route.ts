import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { requireUser, isAuthResponse } from "@/lib/auth-server";
import { createStripeCheckoutSession, getStripe } from "@/lib/payments/stripe";
import { isSupportedPaymentCountry, isTunisia } from "@/lib/payment-country";
import { canStripeChargeMembershipCurrency } from "@/lib/payment-currencies";
import { buildTenantOrigin } from "@/lib/tenant-url";
import { formatZodError, subscribeSchema } from "@/lib/validation";

// POST /api/dashboard/membership/subscribe  { planId, paymentMethod: "ONLINE" | "ONSITE" }
//
//   - ONSITE  → subscription stays PENDING until an admin marks it ACTIVE
//               once cash/card payment is collected at the front desk.
//   - ONLINE  → available outside Tunisia through Stripe in the offer's
//               configured currency. Tunisia members pay at the front desk.
export async function POST(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if (isAuthResponse(auth)) return auth;
    const userId = auth.id;

    const rawBody = await request.json().catch(() => null);
    const parsed = subscribeSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 });
    }
    const { planId, paymentMethod, promoCode, countryCode } = parsed.data;
    if (!isSupportedPaymentCountry(countryCode)) {
      return NextResponse.json({ error: "Pays invalide" }, { status: 400 });
    }
    const tunisia = isTunisia(countryCode);
    if ((tunisia && paymentMethod === "ONLINE") || (!tunisia && paymentMethod === "ONSITE")) {
      return NextResponse.json({
        error: tunisia
          ? "Le paiement en ligne en Tunisie n'est pas encore disponible. Choisissez le paiement à l'accueil."
          : "Le paiement à l'accueil est réservé aux clubs en Tunisie. Choisissez le paiement Stripe.",
      }, { status: 400 });
    }

    const plan = await prisma.membershipPlan.findFirst({ where: { id: planId, clubId: auth.clubId as string } });

    if (!plan || !plan.isActive) {
      return NextResponse.json({ error: "Plan introuvable ou inactif" }, { status: 404 });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return NextResponse.json({ error: "Utilisateur introuvable" }, { status: 401 });
    }
    if (!user.isActive) {
      return NextResponse.json({ error: "Votre compte est suspendu. Contactez le club." }, { status: 403 });
    }
    if (!tunisia && !canStripeChargeMembershipCurrency(plan.currency)) {
      return NextResponse.json({
        error: `La devise ${plan.currency} n'est pas disponible pour Stripe. Modifiez cette offre en USD, EUR, GBP, CAD ou CHF.`,
      }, { status: 400 });
    }

    // Everything below runs in a single transaction. A transaction ALONE does
    // not stop a double-click from creating two PENDING subscriptions: under
    // Postgres' default READ COMMITTED both requests can run the "existing?"
    // check before either has inserted, see nothing, and both insert. The
    // per-user advisory lock serialises concurrent subscribes for the same
    // user — the second waits, then its check sees the first's row. (Held until
    // the transaction ends; keyed by user id, so other users are unaffected.)
    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`subscribe:${userId}`}))`;

      const existing = await tx.subscription.findFirst({
        where: {
          userId,
          OR: [{ status: "ACTIVE", endDate: { gt: new Date() } }, { status: "PENDING" }],
        },
      });

      if (existing) {
        throw new Error(existing.status === "PENDING" ? "ALREADY_PENDING" : "ALREADY_ACTIVE");
      }

      // Optional promo code: validate, apply the discount, and atomically
      // claim one use so two people redeeming the last slot at once can't
      // both succeed (updateMany's WHERE guard makes this a real check,
      // not a read-then-write race).
      const basePrice = plan.price;
      let finalPrice = basePrice;
      let appliedPromotionId: string | null = null;

      if (promoCode && String(promoCode).trim()) {
        const code = String(promoCode).trim().toUpperCase();
        const promo = await tx.promotion.findUnique({ where: { clubId_code: { clubId: auth.clubId as string, code } } });
        const now = new Date();

        if (
          !promo ||
          !promo.isActive ||
          promo.startDate > now ||
          (promo.endDate && promo.endDate < now) ||
          (promo.maxUses !== null && promo.usedCount >= promo.maxUses)
        ) {
          throw new Error("INVALID_PROMO");
        }
        if (promo.discountType === "FIXED" && plan.currency !== "TND") {
          throw new Error("UNSUPPORTED_PROMO_CURRENCY");
        }

        const claim = await tx.promotion.updateMany({
          where: {
            id: promo.id,
            ...(promo.maxUses !== null ? { usedCount: { lt: promo.maxUses } } : {}),
          },
          data: { usedCount: { increment: 1 } },
        });
        if (claim.count === 0) throw new Error("INVALID_PROMO"); // lost the race for the last slot

        finalPrice =
          promo.discountType === "PERCENT"
            ? Math.max(0, basePrice * (1 - promo.discountValue / 100))
            : Math.max(0, basePrice - promo.discountValue);
        const precision = plan.currency === "TND" ? 1000 : 100;
        finalPrice = Math.round(finalPrice * precision) / precision;
        appliedPromotionId = promo.id;
      }

      const startDate = new Date();
      const endDate = new Date(startDate.getTime() + plan.durationDays * 24 * 60 * 60 * 1000);

      const subscription = await tx.subscription.create({
        data: {
          clubId: auth.clubId as string,
          userId,
          planId: plan.id,
          startDate,
          endDate,
          status: "PENDING", // awaiting payment confirmation / admin approval
        },
      });

      const payment = await tx.payment.create({
        data: {
          clubId: auth.clubId as string,
          subscriptionId: subscription.id,
          amount: finalPrice,
          status: "PENDING",
          paymentMethod,
          paymentProvider: paymentMethod === "ONLINE" ? "STRIPE" : null,
          countryCode,
          currency: plan.currency,
          // NB: Payment has no promotionId column — this used to pass one, which
          // Prisma rejects at runtime, so every checkout WITH a promo code
          // failed with a 500. The claimed promotion is tracked here instead.
        },
      });

      return { subscription, payment, promotionId: appliedPromotionId };
    });

    // Tunisia members pay at the club and have staff confirm it as before.
    if (paymentMethod === "ONSITE") {
      return NextResponse.json({
        message: "Demande enregistrée. Finalisez le paiement à l'accueil pour activer votre abonnement.",
        subscription: result.subscription,
        payment: result.payment,
      });
    }

    // ONLINE outside Tunisia: a signed Stripe webhook is the only path that
    // activates the subscription; the browser return URL is not trusted.
    let stripeSessionId: string | null = null;
    try {
      const club = await prisma.club.findUnique({
        where: { id: auth.clubId as string },
        select: { slug: true, customDomain: true },
      });
      if (!club) throw new Error("Club not found for checkout return URLs");
      const origin = buildTenantOrigin(club, process.env.APP_URL || request.nextUrl.origin);
      const checkout = await createStripeCheckoutSession({
        amount: result.payment.amount,
        currency: result.payment.currency,
        productName: `Abonnement ${plan.name}`,
        customerEmail: user.email,
        clientReferenceId: result.payment.id,
        metadata: {
          kind: "MEMBER_SUBSCRIPTION",
          paymentId: result.payment.id,
          subscriptionId: result.subscription.id,
          clubId: auth.clubId as string,
          userId,
          planId: plan.id,
          countryCode,
        },
        successUrl: `${origin}/dashboard/membership?payment=success&session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: `${origin}/dashboard/membership?payment=cancelled`,
      });
      stripeSessionId = checkout.id;

      await prisma.payment.update({
        where: { id: result.payment.id },
        data: { transactionId: checkout.id },
      });

      return NextResponse.json({
        message: "Redirection vers le paiement en ligne...",
        subscription: result.subscription,
        payment: result.payment,
        paymentUrl: checkout.url,
      });
    } catch (err) {
      console.error("Stripe member checkout init error:", err);
      if (stripeSessionId) {
        try {
          await getStripe().checkout.sessions.expire(stripeSessionId);
        } catch (expireError) {
          console.error("Failed to expire untracked member Checkout session:", expireError);
        }
      }
      // Roll the subscription/payment back so the user isn't stuck with a
      // dangling PENDING request they can never pay for — and give back the
      // promo use the transaction claimed, or a gateway outage would burn a
      // limited-use code with nothing purchased.
      try {
        await prisma.$transaction([
          prisma.payment.delete({ where: { id: result.payment.id } }),
          prisma.subscription.delete({ where: { id: result.subscription.id } }),
        ]);
      } catch (rollbackError) {
        console.error("Failed to roll back member checkout records:", rollbackError);
      }
      if (result.promotionId) {
        try {
          await prisma.promotion.updateMany({
            where: { id: result.promotionId, clubId: auth.clubId as string, usedCount: { gt: 0 } },
            data: { usedCount: { decrement: 1 } },
          });
        } catch (rollbackError) {
          console.error("Failed to release promotion use after checkout error:", rollbackError);
        }
      }
      return NextResponse.json(
        { error: "Impossible d'initier le paiement en ligne. Réessayez ou payez à l'accueil." },
        { status: 502 }
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "ALREADY_ACTIVE") {
      return NextResponse.json({ error: "Vous avez déjà un abonnement actif" }, { status: 409 });
    }
    if (message === "ALREADY_PENDING") {
      return NextResponse.json(
        { error: "Une demande d'abonnement est déjà en attente" },
        { status: 409 }
      );
    }
    if (message === "INVALID_PROMO") {
      return NextResponse.json(
        { error: "Ce code promo est invalide, expiré ou épuisé" },
        { status: 400 }
      );
    }
    if (message === "UNSUPPORTED_PROMO_CURRENCY") {
      return NextResponse.json(
        { error: "Les codes promo à montant fixe sont uniquement valables sur les offres en TND." },
        { status: 400 }
      );
    }
    console.error("Membership subscribe POST error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
