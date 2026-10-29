import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { getStripe } from "@/lib/payments/stripe";

export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get("session_id");
  if (!sessionId || !sessionId.startsWith("cs_")) {
    return NextResponse.redirect(new URL("/onboarding?payment=cancelled", request.url));
  }

  try {
    const stripe = getStripe();
    let session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.payment_status === "paid") {
      return NextResponse.redirect(new URL(`/api/onboarding/complete?session_id=${encodeURIComponent(sessionId)}`, request.url));
    }
    if (session.status === "open") {
      await stripe.checkout.sessions.expire(sessionId);
      session = await stripe.checkout.sessions.retrieve(sessionId);
    }

    const metadata = session.metadata ?? {};
    if (
      session.status === "expired" &&
      session.payment_status !== "paid" &&
      metadata.kind === "SAAS_SIGNUP" &&
      metadata.saasPaymentId &&
      metadata.clubId &&
      metadata.ownerId
    ) {
      await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const payment = await tx.saasPayment.findFirst({
          where: {
            id: metadata.saasPaymentId,
            clubId: metadata.clubId,
            paymentProvider: "STRIPE",
            status: { in: ["PENDING", "FAILED"] },
            OR: [{ providerRef: sessionId }, { providerRef: null }],
          },
          select: { id: true },
        });
        if (!payment) return;
        await tx.user.deleteMany({ where: { id: metadata.ownerId, clubId: metadata.clubId, role: "OWNER" } });
        await tx.club.deleteMany({ where: { id: metadata.clubId, status: "SUSPENDED" } });
      });
    }

    return NextResponse.redirect(new URL("/onboarding?payment=cancelled", request.url));
  } catch (error) {
    console.error("Onboarding checkout cancellation error:", error);
    return NextResponse.json({ error: "Impossible de fermer cette session de paiement." }, { status: 500 });
  }
}
