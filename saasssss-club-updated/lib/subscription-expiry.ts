// lib/subscription-expiry.ts — when a PAID period (monthly / yearly) has run out.
//
// Same idea as lib/trial.ts: pure functions, enforced on EVERY request in lib/tenant.ts
// isClubUsable (the cron /api/cron/subscription-renewal only tidies up: flips the stored status,
// e-mails the owner, writes the audit entry).
//
//  - A club whose ClubSubscription.currentPeriodEnd is null is "platform-managed" (legacy / created
//    by SUPER_ADMIN) and never expires by date.
//  - After currentPeriodEnd there is a short grace window (PAID_PERIOD_GRACE_DAYS, default 3) so a
//    transfer that lands a day late does not lock a gym out; after it the club is not usable.
//  - Data is never deleted. Paying again (Stripe webhook, or SUPER_ADMIN activating an approved
//    manual request) starts a new period and re-opens the club.
export const SUBSCRIPTION_EXPIRED_REASON = "Subscription expired"; // must match the cron
export const PAID_GRACE_DAYS_FALLBACK = 3;
export const MAX_PAID_GRACE_DAYS = 30;
const DAY_MS = 86_400_000;

export function paidGraceDays(env: Record<string, string | undefined> = process.env): number {
  const raw = env.PAID_PERIOD_GRACE_DAYS;
  if (raw === undefined || raw.trim() === "") return PAID_GRACE_DAYS_FALLBACK;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 && n <= MAX_PAID_GRACE_DAYS ? n : PAID_GRACE_DAYS_FALLBACK;
}

export interface PaidClub {
  status: string;
  /** ClubSubscription.currentPeriodEnd of an ACTIVE club. */
  paidUntil?: Date | string | null;
}

/** The instant after which an ACTIVE club stops being usable, or null when it never expires. */
export function paidAccessEndsAt(paidUntil: Date | string | null | undefined, graceDays = paidGraceDays()): Date | null {
  if (!paidUntil) return null;
  return new Date(new Date(paidUntil).getTime() + graceDays * DAY_MS);
}

export function isPaidPeriodExpired(club: PaidClub, now: Date = new Date(), graceDays = paidGraceDays()): boolean {
  if (club.status !== "ACTIVE") return false;
  const end = paidAccessEndsAt(club.paidUntil, graceDays);
  return end !== null && end.getTime() <= now.getTime();
}
