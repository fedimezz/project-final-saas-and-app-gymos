// GET /api/billing/status — requireAdmin (ADMIN or OWNER). Current club
// subscription/plan + real usage (via lib/plan-limits.ts's getFullUsage,
// Phase 7) + recent SaaS payment history (SaasPayment, Phase 9) for the
// /admin/billing page. Upgrade/downgrade stays OWNER-only
// (POST /api/billing/upgrade), but any staff member can view billing status.

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { getFullUsage } from "@/lib/plan-limits";
import { isFeatureAllowed } from "@/lib/plan-feature-guard";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.ok) return NextResponse.json({ error: "Accès refusé" }, { status: auth.status });
    const admin = auth.user;
    if (!admin.clubId) return NextResponse.json({ error: "Aucun club associé" }, { status: 400 });

    const [club, subscription, usage, recentPayments, openRequest, customHeroModel] = await Promise.all([
      prisma.club.findUnique({
        where: { id: admin.clubId },
        select: { status: true, trialEndsAt: true },
      }),
      prisma.clubSubscription.findUnique({
        where: { clubId: admin.clubId },
        include: { plan: true },
      }),
      getFullUsage(admin.clubId),
      prisma.saasPayment.findMany({
        where: { clubId: admin.clubId },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: { id: true, amount: true, currency: true, status: true, billingPeriod: true, paidAt: true, createdAt: true },
      }),
      // The club's own pending / approved non-Stripe request, if any (always scoped by clubId).
      prisma.manualPaymentRequest.findFirst({
        where: { clubId: admin.clubId, status: { in: ["PENDING", "APPROVED"] } },
        orderBy: { createdAt: "desc" },
        select: { id: true, planId: true, billingPeriod: true, amount: true, currency: true, status: true, createdAt: true },
      }),
      isFeatureAllowed(admin.clubId, "customHeroModel"),
    ]);

    return NextResponse.json({
      club,
      subscription: subscription
        ? {
            status: subscription.status,
            trialEndsAt: subscription.trialEndsAt,
            trialStartedAt: subscription.status === "TRIALING" ? subscription.currentPeriodStart : null,
            currentPeriodEnd: subscription.currentPeriodEnd,
            billingPeriod: subscription.billingPeriod,
            // Auto-renewing Stripe subscription (never exposes the Stripe ids themselves)
            autoRenew: !!subscription.providerSubscriptionId && !subscription.cancelAtPeriodEnd,
            cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
            plan: {
              id: subscription.plan.id,
              tier: subscription.plan.tier,
              name: subscription.plan.name,
              priceMonthly: subscription.plan.priceMonthly,
              priceYearly: subscription.plan.priceYearly,
              currency: subscription.plan.currency,
              limits: subscription.plan.limits,
            },
          }
        : null,
      usage: usage.usage,
      limits: usage.limits,
      recentPayments,
      openRequest,
      features: { customHeroModel },
    });
  } catch (error) {
    console.error("Billing status GET error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
