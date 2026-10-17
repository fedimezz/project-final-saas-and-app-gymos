// lib/plan-limits.ts — centralised SaaS plan limit enforcement.
//
// ONE function to call before any resource-creating route:
//
//   const check = await checkLimit(clubId, "maxMembers");
//   if (!check.ok) return NextResponse.json({ error: check.reason }, { status: 402 });
//
// Never hardcode plan numbers in route handlers — everything reads from the
// SaasPlan.limits JSON column that the seed populates. Adding a new limit
// type is a one-line addition here + a DB column update; no route changes.

import prisma from "@/lib/prisma";

export type LimitKey =
  | "maxMembers"
  | "maxCoaches"
  | "maxAdmins"
  | "maxBookingsPerMonth"
  | "maxCustomPages"
  | "customDomain"
  | "advancedAnalytics"
  | "revenueAnalytics"
  | "apiAccess"
  | "whiteLabel";

export interface LimitCheckResult {
  ok: boolean;
  /** Human-readable reason when ok === false */
  reason?: string;
  /** Current value */
  current?: number;
  /** Maximum allowed (null = unlimited) */
  limit?: number | null;
  /** True when the club should be prompted to upgrade to continue */
  upgrade?: boolean;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

async function getPlanLimits(
  clubId: string
): Promise<Record<string, unknown> | null> {
  const sub = await prisma.clubSubscription.findUnique({
    where: { clubId },
    select: {
      status: true,
      plan: { select: { limits: true } },
    },
  });
  // A club with no subscription or in CANCELED/SUSPENDED state gets the
  // most restricted behaviour (null means "no plan loaded" → all numeric
  // limits return 0, all boolean features return false).
  if (!sub || sub.status === "CANCELED" || sub.status === "SUSPENDED") {
    return null;
  }
  return sub.plan.limits as Record<string, unknown>;
}

function numericLimit(limits: Record<string, unknown>, key: string): number | null {
  const v = limits[key];
  if (v === null || v === undefined) return null; // null = unlimited (Business tier)
  return typeof v === "number" ? v : null;
}

function booleanFeature(limits: Record<string, unknown>, key: string): boolean {
  return limits[key] === true;
}

// ── Current usage counters ────────────────────────────────────────────────────

async function countMembers(clubId: string): Promise<number> {
  return prisma.user.count({ where: { clubId, role: "MEMBER", isActive: true } });
}

async function countCoaches(clubId: string): Promise<number> {
  return prisma.coach.count({ where: { clubId } });
}

async function countAdmins(clubId: string): Promise<number> {
  // Counts OWNER too: "admin seats" is a staff-seat limit on the plan, and
  // counting only ADMIN meant a club could add unlimited staff by creating
  // them as OWNER instead — same dashboard access, uncounted.
  return prisma.user.count({ where: { clubId, role: { in: ["ADMIN", "OWNER"] } } });
}

async function countBookingsThisMonth(clubId: string): Promise<number> {
  const start = new Date();
  start.setDate(1);
  start.setHours(0, 0, 0, 0);
  return prisma.userSession.count({
    where: { clubId, isCancelled: false, bookedAt: { gte: start } },
  });
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Check whether the club is allowed to create one more resource of the
 * given type.  Always call this *before* the INSERT, never after.
 */
export async function checkLimit(
  clubId: string,
  key: LimitKey
): Promise<LimitCheckResult> {
  const limits = await getPlanLimits(clubId);

  // No active plan → treat as a zero-quota plan (fail closed).
  if (limits === null) {
    return {
      ok: false,
      reason:
        "Votre club n'a pas d'abonnement SaaS actif. Choisissez un plan pour continuer.",
    };
  }

  // Boolean feature flags
  if (
    key === "customDomain" ||
    key === "advancedAnalytics" ||
    key === "revenueAnalytics" ||
    key === "apiAccess" ||
    key === "whiteLabel"
  ) {
    const enabled = booleanFeature(limits, key);
    return enabled
      ? { ok: true }
      : {
          ok: false,
          reason: `Cette fonctionnalité n'est pas incluse dans votre plan actuel. Passez à un plan supérieur pour y accéder.`,
        };
  }

  // Numeric limits
  const limit = numericLimit(limits, key);

  // null = unlimited (Business tier)
  if (limit === null) return { ok: true, limit: null };

  let current: number;
  switch (key) {
    case "maxMembers":
      current = await countMembers(clubId);
      break;
    case "maxCoaches":
      current = await countCoaches(clubId);
      break;
    case "maxAdmins":
      current = await countAdmins(clubId);
      break;
    case "maxBookingsPerMonth":
      current = await countBookingsThisMonth(clubId);
      break;
    case "maxCustomPages":
      // TODO Phase 8: count custom pages once that feature is built
      current = 0;
      break;
    default:
      return { ok: true };
  }

  if (current >= limit) {
    const labels: Record<LimitKey, string> = {
      maxMembers: "membres actifs",
      maxCoaches: "coachs",
      maxAdmins: "admins",
      maxBookingsPerMonth: "réservations ce mois",
      maxCustomPages: "pages personnalisées",
      customDomain: "domaine personnalisé",
      advancedAnalytics: "analytiques avancées",
      revenueAnalytics: "analytiques de revenus",
      apiAccess: "accès API",
      whiteLabel: "white-label",
    };
    return {
      ok: false,
      current,
      limit,
      upgrade: true,
      reason: `Limite atteinte : votre plan autorise ${limit} ${labels[key]}. Passez à un plan supérieur pour en ajouter davantage.`,
    };
  }

  return { ok: true, current, limit };
}

/**
 * Lightweight variant: just check a boolean feature flag without counting DB rows.
 * Use for feature-gating pages/endpoints that don't involve creating a resource.
 */
export async function checkFeature(
  clubId: string,
  key: Extract<
    LimitKey,
    | "customDomain"
    | "advancedAnalytics"
    | "revenueAnalytics"
    | "apiAccess"
    | "whiteLabel"
  >
): Promise<LimitCheckResult> {
  return checkLimit(clubId, key);
}

/**
 * Returns all current usage + limits for a club in one DB round-trip.
 * Used by the dashboard's "Plan SaaS" widget.
 */
export async function getFullUsage(clubId: string): Promise<{
  limits: Record<string, unknown> | null;
  usage: {
    members: number;
    coaches: number;
    admins: number;
    bookingsThisMonth: number;
  };
}> {
  const [limits, members, coaches, admins, bookingsThisMonth] = await Promise.all([
    getPlanLimits(clubId),
    countMembers(clubId),
    countCoaches(clubId),
    countAdmins(clubId),
    countBookingsThisMonth(clubId),
  ]);

  return { limits, usage: { members, coaches, admins, bookingsThisMonth } };
}
