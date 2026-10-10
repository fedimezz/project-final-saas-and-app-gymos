// GET /api/platform/overview — SUPER_ADMIN only, cross-tenant platform
// stats (never scoped by clubId — this is the one place in the codebase
// that's intentionally allowed to aggregate across every gym).
//
// Fixes vs. the previous version:
//   • clubs created during signup but not paid yet used to be counted as "suspended";
//     they are now reported separately as `pendingPayment`.
//   • MRR / revenue were summed across currencies and shown as "$"; they are now
//     returned per currency.
//   • 10 sequential-ish queries -> one parallel batch, cached for a few seconds
//     (the dashboard is polled/reopened often and the database can be far away).
//   • adds the work queue (open service / domain / website-change requests).

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/auth";
import { TtlCache } from "@/lib/ttl-cache";

const cache = new TtlCache<Record<string, unknown>>(15_000, 4);

function sumByCurrency(rows: { currency: string; amount: number }[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) out[r.currency] = (out[r.currency] ?? 0) + r.amount;
  return out;
}

async function load() {
  const now = new Date();
  const in3Days = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
  const since30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [
    byStatus, pendingPayment, totalMembers, activeSubs, recentClubs, trialEndingSoon,
    paid30d, openServiceRequests, openDomainRequests, openWebsiteRequests,
  ] = await Promise.all([
    prisma.club.groupBy({ by: ["status"], _count: { _all: true } }),
    // Signup created the club (SUSPENDED) and is still waiting for the Stripe payment.
    prisma.club.count({
      where: { status: "SUSPENDED", saasPayments: { some: { status: "PENDING" } }, suspendedAt: null },
    }),
    prisma.user.count({ where: { role: "MEMBER" } }),
    prisma.clubSubscription.findMany({
      where: { status: "ACTIVE" },
      select: { plan: { select: { priceMonthly: true, currency: true } } },
    }),
    prisma.club.findMany({
      orderBy: { createdAt: "desc" },
      take: 6,
      select: { id: true, name: true, slug: true, status: true, createdAt: true },
    }),
    prisma.club.count({ where: { status: "TRIAL", trialEndsAt: { gte: now, lte: in3Days } } }),
    prisma.saasPayment.findMany({
      where: { status: "PAID", paidAt: { gte: since30d } },
      select: { amount: true, currency: true },
    }),
    prisma.serviceRequest.count({ where: { status: { in: ["PENDING", "IN_PROGRESS"] } } }),
    prisma.domainRequest.count({ where: { status: { in: ["PENDING", "CONFIGURING"] } } }),
    prisma.websiteChangeRequest.count({ where: { status: "PENDING" } }),
  ]);

  const count = (s: string) => byStatus.find((r) => r.status === s)?._count._all ?? 0;
  const total = byStatus.reduce((sum, r) => sum + r._count._all, 0);

  return {
    clubs: {
      total,
      trial: count("TRIAL"),
      active: count("ACTIVE"),
      // Real suspensions only — unpaid signups are counted in pendingPayment.
      suspended: Math.max(0, count("SUSPENDED") - pendingPayment),
      cancelled: count("CANCELLED"),
      pendingPayment,
    },
    // { USD: 120, TND: 300 } — never add different currencies together.
    mrr: sumByCurrency(activeSubs.map((s) => ({ currency: s.plan.currency, amount: s.plan.priceMonthly }))),
    revenue30d: sumByCurrency(paid30d),
    totalMembers,
    trialEndingSoon,
    recentClubs,
    queue: {
      serviceRequests: openServiceRequests,
      domainRequests: openDomainRequests,
      websiteRequests: openWebsiteRequests,
    },
  };
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireSuperAdmin(request);
    if (!auth.ok) return NextResponse.json({ error: "Accès réservé à la plateforme" }, { status: auth.status });

    const refresh = new URL(request.url).searchParams.get("refresh") === "1";
    if (refresh) cache.clear();
    const data = await cache.get("overview", load);
    return NextResponse.json(data);
  } catch (error) {
    console.error("Platform overview GET error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
