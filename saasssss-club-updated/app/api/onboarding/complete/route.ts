import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import crypto from "crypto";
import prisma from "@/lib/prisma";
import { generateBridgeToken, hashBridgeNonce } from "@/lib/auth";
import { buildAuthCookieOptions } from "@/lib/auth-cookie";
import { BRIDGE_NONCE_COOKIE } from "@/lib/bridge-nonce";
import { getStripe, toStripeMinorUnits } from "@/lib/payments/stripe";

function localHost(hostname: string) {
  return hostname === "localhost" || hostname.endsWith(".localhost");
}

function getBridgeUrl(request: NextRequest, clubSlug: string, token: string): URL {
  const base = new URL(process.env.APP_URL || request.nextUrl.origin);
  const target = new URL("/api/auth/bridge", base);
  if (localHost(base.hostname)) {
    target.searchParams.set("club", clubSlug);
  } else {
    target.hostname = `${clubSlug}.${base.hostname.replace(/^www\./, "")}`;
  }
  target.searchParams.set("token", token);
  target.searchParams.set("redirect", "/admin/get-started");
  return target;
}

export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get("session_id");
  if (!sessionId || !sessionId.startsWith("cs_")) {
    return NextResponse.json({ error: "Session de paiement invalide." }, { status: 400 });
  }

  try {
    const session = await getStripe().checkout.sessions.retrieve(sessionId);
    const metadata = session.metadata ?? {};
    if (
      session.status !== "complete" ||
      session.payment_status !== "paid" ||
      metadata.kind !== "SAAS_SIGNUP" ||
      !metadata.saasPaymentId ||
      !metadata.subscriptionId ||
      !metadata.clubId ||
      !metadata.planId ||
      !metadata.ownerId ||
      !metadata.countryCode ||
      session.amount_total === null ||
      !session.currency
    ) {
      return NextResponse.json({ error: "Le paiement n'est pas confirmé." }, { status: 402 });
    }

    const payment = await prisma.saasPayment.findFirst({
      where: {
        id: metadata.saasPaymentId,
        subscriptionId: metadata.subscriptionId,
        clubId: metadata.clubId,
        paymentProvider: "STRIPE",
        countryCode: metadata.countryCode,
        OR: [{ providerRef: session.id }, { providerRef: null }],
      },
      include: {
        club: { select: { id: true, slug: true, name: true, status: true } },
        subscription: { select: { id: true, planId: true, status: true } },
      },
    });
    if (!payment || session.client_reference_id !== payment.id) {
      return NextResponse.json({ error: "Le paiement ne correspond pas au club créé." }, { status: 400 });
    }
    if (
      payment.subscription.planId !== metadata.planId ||
      payment.currency.toLowerCase() !== session.currency ||
      toStripeMinorUnits(payment.amount, payment.currency) !== session.amount_total ||
      !["PENDING", "PAID"].includes(payment.status)
    ) {
      return NextResponse.json({ error: "Les détails du paiement ne correspondent pas." }, { status: 400 });
    }

    if (payment.status === "PENDING") {
      const now = new Date();
      const periodEnd = new Date(now);
      periodEnd.setMonth(periodEnd.getMonth() + 1);
      await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const settled = await tx.saasPayment.updateMany({
          where: { id: payment.id, status: "PENDING", OR: [{ providerRef: session.id }, { providerRef: null }] },
          data: { status: "PAID", providerRef: session.id, paidAt: now },
        });
        if (settled.count === 0) {
          const latest = await tx.saasPayment.findUnique({ where: { id: payment.id }, select: { status: true } });
          if (latest?.status !== "PAID") throw new Error("Signup payment could not be settled");
          return;
        }

        const activated = await tx.clubSubscription.updateMany({
          where: { id: payment.subscriptionId, clubId: payment.clubId, planId: metadata.planId, status: "SUSPENDED" },
          data: { status: "ACTIVE", currentPeriodStart: now, currentPeriodEnd: periodEnd, trialEndsAt: null },
        });
        if (activated.count !== 1) throw new Error("Paid signup subscription could not be activated");
        const clubActivated = await tx.club.updateMany({
          where: { id: payment.clubId, status: "SUSPENDED" },
          data: { status: "ACTIVE" },
        });
        if (clubActivated.count !== 1) throw new Error("Paid signup club could not be activated");
      });
    }

    const [owner, activeClub] = await Promise.all([
      prisma.user.findFirst({
        where: { id: metadata.ownerId, clubId: payment.clubId, role: "OWNER", isActive: true },
        select: { id: true, name: true, email: true, role: true, clubId: true },
      }),
      prisma.club.findFirst({
        where: { id: payment.clubId, status: "ACTIVE", subscription: { is: { status: "ACTIVE" } } },
        select: { id: true, slug: true, name: true },
      }),
    ]);
    if (!owner || !activeClub) {
      return NextResponse.json({ error: "Le club n'est pas encore activé. Contactez le support." }, { status: 409 });
    }

    const nonce = crypto.randomBytes(16).toString("hex");
    const bridgeToken = generateBridgeToken({
      id: owner.id,
      clubId: activeClub.id,
      nonceHash: hashBridgeNonce(nonce),
    });
    const response = NextResponse.redirect(getBridgeUrl(request, activeClub.slug, bridgeToken));
    response.cookies.set(BRIDGE_NONCE_COOKIE, nonce, { ...buildAuthCookieOptions(request.url), maxAge: 120 });
    return response;
  } catch (error) {
    console.error("Onboarding payment completion error:", error);
    return NextResponse.json({ error: "Impossible de confirmer le paiement. Contactez le support si le montant a été débité." }, { status: 500 });
  }
}
