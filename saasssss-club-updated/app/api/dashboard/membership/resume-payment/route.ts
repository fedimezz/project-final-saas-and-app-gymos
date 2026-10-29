import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireUser, isAuthResponse } from "@/lib/auth-server";
import { createStripeCheckoutSession, getStripe } from "@/lib/payments/stripe";
import { canStripeChargeMembershipCurrency } from "@/lib/payment-currencies";
import { buildTenantOrigin } from "@/lib/tenant-url";

// Reuses an open Stripe checkout session or replaces an expired one for the
// same pending payment record. Payment activation is webhook-only.
export async function POST(request: NextRequest) {
  let newSessionId: string | null = null;
  try {
    const auth = await requireUser(request);
    if (isAuthResponse(auth)) return auth;
    const userId = auth.id;
    const clubId = auth.clubId;

    if (!clubId) {
      return NextResponse.json({ error: "Club introuvable" }, { status: 400 });
    }

    const subscription = await prisma.subscription.findFirst({
      where: { userId, clubId, status: "PENDING" },
      include: {
        plan: true,
        payments: { orderBy: { createdAt: "desc" }, take: 1 },
      },
      orderBy: { createdAt: "desc" },
    });

    if (!subscription) {
      return NextResponse.json(
        { error: "Aucune souscription en attente à relancer" },
        { status: 404 }
      );
    }

    const payment = subscription.payments[0];

    if (!payment || payment.paymentMethod !== "ONLINE") {
      return NextResponse.json(
        { error: "Cette souscription n'a pas de paiement en ligne à relancer" },
        { status: 400 }
      );
    }

    if (payment.status === "PAID") {
      return NextResponse.json(
        { error: "Ce paiement a déjà été validé" },
        { status: 409 }
      );
    }

    if (
      payment.paymentProvider !== "STRIPE" ||
      !canStripeChargeMembershipCurrency(payment.currency) ||
      !payment.countryCode ||
      payment.countryCode === "TN"
    ) {
      return NextResponse.json(
        { error: "Cette demande ne possède pas de paiement Stripe relançable. Contactez l'accueil du club." },
        { status: 409 }
      );
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    const club = await prisma.club.findUnique({
      where: { id: clubId },
      select: { slug: true, customDomain: true },
    });
    if (!club) return NextResponse.json({ error: "Club introuvable" }, { status: 404 });
    const origin = buildTenantOrigin(club, process.env.APP_URL || request.nextUrl.origin);

    try {
      if (payment.transactionId) {
        const existingSession = await getStripe().checkout.sessions.retrieve(payment.transactionId);
        if (existingSession.status === "open" && existingSession.url) {
          return NextResponse.json({ paymentUrl: existingSession.url });
        }
        if (
          existingSession.status === "complete" &&
          (existingSession.payment_status === "paid" || payment.status === "PENDING")
        ) {
          return NextResponse.json(
            { error: "Le paiement est en cours de confirmation. Actualisez dans un instant." },
            { status: 409 }
          );
        }
      }
      const checkout = await createStripeCheckoutSession({
        amount: payment.amount,
        currency: payment.currency,
        productName: `Abonnement ${subscription.plan.name}`,
        customerEmail: user?.email,
        clientReferenceId: payment.id,
        metadata: {
          kind: "MEMBER_SUBSCRIPTION",
          paymentId: payment.id,
          subscriptionId: subscription.id,
          clubId,
          userId,
          planId: subscription.plan.id,
          countryCode: payment.countryCode,
        },
        successUrl: `${origin}/dashboard/membership?payment=success&session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: `${origin}/dashboard/membership?payment=cancelled`,
      });
      newSessionId = checkout.id;

      await prisma.payment.update({
        where: { id: payment.id },
        data: { transactionId: checkout.id, status: "PENDING" },
      });

      return NextResponse.json({ paymentUrl: checkout.url });
    } catch (err) {
      console.error("Stripe resume-payment init error:", err);
      if (newSessionId) {
        try {
          await getStripe().checkout.sessions.expire(newSessionId);
        } catch (expireError) {
          console.error("Failed to expire untracked resumed Checkout session:", expireError);
        }
      }
      return NextResponse.json(
        { error: "Impossible de relancer le paiement en ligne. Réessayez ou payez à l'accueil." },
        { status: 502 }
      );
    }
  } catch (error) {
    console.error("Membership resume-payment POST error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
