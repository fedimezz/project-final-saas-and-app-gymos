import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireOwner } from "@/lib/auth";
import { verifyOrigin } from "@/lib/csrf";
import { createStripeCheckoutSession, getStripe } from "@/lib/payments/stripe";
import { isSupportedPaymentCountry, isTunisia } from "@/lib/payment-country";
import { buildTenantOrigin } from "@/lib/tenant-url";

const checkoutSchema = z.object({
  planId: z.string().min(1),
  countryCode: z.string().trim().length(2).transform((code) => code.toUpperCase()),
});

export async function POST(request: NextRequest) {
  const csrfError = verifyOrigin(request);
  if (csrfError) return csrfError;

  const auth = await requireOwner(request);
  if (!auth.ok) return NextResponse.json({ error: "Accès refusé" }, { status: auth.status });
  const clubId = auth.user.clubId;
  if (!clubId) return NextResponse.json({ error: "Aucun club associé" }, { status: 400 });

  const rawBody = await request.json().catch(() => null);
  const parsed = checkoutSchema.safeParse(rawBody);
  if (!parsed.success || !isSupportedPaymentCountry(parsed.data?.countryCode)) {
    return NextResponse.json({ error: "Pays ou plan invalide" }, { status: 400 });
  }
  const { planId, countryCode } = parsed.data;

  if (isTunisia(countryCode)) {
    return NextResponse.json(
      { error: "La facturation SaaS en ligne n'est pas disponible en Tunisie. Contactez le support." },
      { status: 409 }
    );
  }

  try {
    const [plan, subscription, club] = await Promise.all([
      prisma.saasPlan.findFirst({ where: { id: planId, isActive: true } }),
      prisma.clubSubscription.findUnique({
        where: { clubId },
        include: { plan: true },
      }),
      prisma.club.findUnique({
        where: { id: clubId },
        select: { slug: true, customDomain: true },
      }),
    ]);
    if (!plan) return NextResponse.json({ error: "Plan introuvable ou inactif" }, { status: 404 });
    if (!subscription || !club) return NextResponse.json({ error: "Abonnement ou club introuvable" }, { status: 404 });
    if (subscription.planId === plan.id) return NextResponse.json({ error: "Vous êtes déjà sur ce plan" }, { status: 400 });
    if (!Number.isFinite(plan.priceMonthly) || plan.priceMonthly <= 0) {
      return NextResponse.json({ error: "Ce plan ne possède pas de prix mensuel payable." }, { status: 400 });
    }
    if (plan.currency.toUpperCase() !== "USD") {
      return NextResponse.json({ error: "Les plans SaaS doivent être configurés en USD pour les paiements Stripe." }, { status: 400 });
    }

    const { pendingPayment, payment } = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`saas-checkout:${subscription.id}`}))`;
      const pendingPayment = await tx.saasPayment.findFirst({
        where: {
          clubId,
          subscriptionId: subscription.id,
          status: "PENDING",
          paymentProvider: "STRIPE",
        },
        orderBy: { createdAt: "desc" },
      });
      if (pendingPayment) return { pendingPayment, payment: null };
      const payment = await tx.saasPayment.create({
        data: {
          clubId,
          subscriptionId: subscription.id,
          amount: plan.priceMonthly,
          currency: plan.currency,
          status: "PENDING",
          paymentProvider: "STRIPE",
          countryCode,
        },
      });
      return { pendingPayment: null, payment };
    });
    if (pendingPayment) {
      if (!pendingPayment.providerRef) {
        return NextResponse.json({ error: "Une session de paiement est en cours de préparation. Réessayez dans un instant." }, { status: 409 });
      }
      const existing = await getStripe().checkout.sessions.retrieve(pendingPayment.providerRef);
      if (existing.status === "open" && existing.url) {
        const samePlan = existing.metadata?.planId === plan.id;
        const sameCountry = existing.metadata?.countryCode === countryCode;
        const sameAmount = pendingPayment.amount === plan.priceMonthly && pendingPayment.currency === plan.currency;
        if (samePlan && sameCountry && sameAmount) return NextResponse.json({ paymentUrl: existing.url });
        return NextResponse.json({ error: "Un autre paiement est déjà en cours pour ce club." }, { status: 409 });
      }
      if (existing.status === "complete") {
        return NextResponse.json({ error: "Le paiement est en cours de confirmation. Actualisez dans un instant." }, { status: 409 });
      }
      await prisma.saasPayment.update({
        where: { id: pendingPayment.id, clubId },
        data: { status: "FAILED" },
      });
      return NextResponse.json({ error: "La session précédente a expiré. Relancez le changement de plan." }, { status: 409 });
    }

    if (!payment) return NextResponse.json({ error: "Impossible de préparer le paiement." }, { status: 409 });
    let stripeSessionId: string | null = null;
    try {
      const origin = buildTenantOrigin(club, process.env.APP_URL || request.nextUrl.origin);
      const checkout = await createStripeCheckoutSession({
        amount: payment.amount,
        currency: payment.currency,
        productName: `GymOS ${plan.name} — abonnement mensuel`,
        customerEmail: auth.user.email,
        clientReferenceId: payment.id,
        metadata: {
          kind: "SAAS_PLAN",
          saasPaymentId: payment.id,
          subscriptionId: subscription.id,
          clubId,
          planId: plan.id,
          countryCode,
        },
        successUrl: `${origin}/admin/billing?payment=success&session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: `${origin}/admin/billing?payment=cancelled`,
      });
      stripeSessionId = checkout.id;
      await prisma.saasPayment.update({
        where: { id: payment.id, clubId },
        data: { providerRef: checkout.id },
      });
      return NextResponse.json({ paymentUrl: checkout.url });
    } catch (error) {
      console.error("Stripe SaaS checkout init error:", error);
      if (stripeSessionId) {
        try {
          await getStripe().checkout.sessions.expire(stripeSessionId);
        } catch (expireError) {
          console.error("Failed to expire untracked SaaS Checkout session:", expireError);
        }
      }
      try {
        await prisma.saasPayment.delete({ where: { id: payment.id, clubId } });
      } catch (rollbackError) {
        console.error("Failed to remove unpayable SaaS payment record:", rollbackError);
      }
      return NextResponse.json({ error: "Impossible de créer la session de paiement. Réessayez." }, { status: 502 });
    }
  } catch (error) {
    console.error("Billing checkout POST error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
