import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireUser, isAuthResponse } from "@/lib/auth-server";
import { withSubscriptionExpiry } from "@/lib/membership-card";

// GET /api/dashboard/membership
//
// Powers the member-facing "Adhésion" page: the member's card, their
// current (active or pending) subscription, the list of purchasable
// plans, and a short history of past subscriptions.
//
// NOTE: this route previously didn't exist even though the frontend
// (app/dashboard/membership/page.tsx) has always called it on load —
// every visit to /dashboard/membership 404'd on its first fetch and the
// page could never render past the loading state. Added here.
export async function GET(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if (isAuthResponse(auth)) return auth;
    const userId = auth.id;

    const now = new Date();

    const [card, activeSubscription, plans, history] = await Promise.all([
      prisma.membershipCard.findUnique({
        where: { userId },
        select: { cardNumber: true, isActive: true, expiresAt: true },
      }),

      // "Current" subscription from the member's point of view: either a
      // still-valid ACTIVE one, or a PENDING one awaiting payment/approval.
      // Mirrors the exact condition used in the subscribe route so the UI
      // and the write path never disagree about what "already has one" means.
      prisma.subscription.findFirst({
        where: {
          userId,
          OR: [{ status: "ACTIVE", endDate: { gt: now } }, { status: "PENDING" }],
        },
        include: {
          plan: { select: { id: true, name: true, price: true, currency: true } },
          payments: {
            orderBy: { createdAt: "desc" },
            select: { status: true, paymentMethod: true, amount: true, currency: true },
          },
        },
        orderBy: { createdAt: "desc" },
      }),

      prisma.membershipPlan.findMany({
        where: { clubId: auth.clubId as string, isActive: true },
        orderBy: { price: "asc" },
        select: {
          id: true,
          name: true,
          description: true,
          price: true,
          currency: true,
          durationDays: true,
          features: true,
        },
      }),

      prisma.subscription.findMany({
        where: {
          userId,
          status: { in: ["EXPIRED", "CANCELLED"] },
        },
        include: {
          plan: { select: { name: true, price: true, currency: true } },
          payments: { select: { status: true, paymentMethod: true, paidAt: true } },
        },
        orderBy: { endDate: "desc" },
        take: 10,
      }),
    ]);

    // Card expiry = the member's own active subscription end date (a PENDING
    // subscription doesn't make the card valid yet).
    const validSubscription =
      activeSubscription && activeSubscription.status === "ACTIVE" && activeSubscription.endDate > now
        ? activeSubscription
        : null;

    return NextResponse.json({
      card: withSubscriptionExpiry(card, validSubscription),
      activeSubscription,
      plans,
      history,
    });
  } catch (error) {
    console.error("Membership GET error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
