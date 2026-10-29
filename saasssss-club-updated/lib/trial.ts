// Free-trial rules in one place. Pure functions (no I/O) so the tenant check, the cron, the API
// and the tests all agree.
//
// What "expired" means, server-side: a club in TRIAL whose trialEndsAt has passed is treated as
// NOT usable on every request (lib/tenant.ts isClubUsable) — even if the daily cron
// (/api/cron/trial-check) has not run yet or failed. The cron only flips the stored status to
// SUSPENDED, e-mails the owner and records the audit entry.
//
// After expiry (club data is kept, nothing is deleted):
//   available   → the public /reactivate page (identity = owner e-mail + password → choose a plan,
//                 pay by card or manual transfer), the platform-wide public pages (landing, pricing,
//                 /download), the SUPER_ADMIN console and support contact.
//   unavailable → sign-in to the club, the club's public site and APIs, member app access.
// Paying (Stripe webhook / SUPER_ADMIN confirming a manual payment) sets the club ACTIVE again.
export const TRIAL_DAYS_FALLBACK = 14;
export const MAX_TRIAL_DAYS = 90;
const DAY_MS = 86_400_000;

/** Default trial length: env DEFAULT_TRIAL_DAYS (1–90) if valid, else 14. */
export function defaultTrialDays(env: Record<string, string | undefined> = process.env): number {
  const raw = Number(env.DEFAULT_TRIAL_DAYS);
  return Number.isInteger(raw) && raw >= 1 && raw <= MAX_TRIAL_DAYS ? raw : TRIAL_DAYS_FALLBACK;
}

export interface TrialClub {
  status: string;
  trialEndsAt?: Date | string | null;
}

export type TrialState = "NONE" | "ACTIVE" | "EXPIRED";

export function trialState(club: TrialClub, now: Date = new Date()): TrialState {
  if (club.status === "TRIAL") {
    if (!club.trialEndsAt) return "ACTIVE"; // no end date recorded: never expire a club by guesswork
    return new Date(club.trialEndsAt).getTime() <= now.getTime() ? "EXPIRED" : "ACTIVE";
  }
  return "NONE";
}

export function isTrialExpired(club: TrialClub, now: Date = new Date()): boolean {
  return trialState(club, now) === "EXPIRED";
}

/** Whole days left, rounded up (23h left = 1 day); 0 once expired. */
export function trialDaysLeft(trialEndsAt: Date | string | null | undefined, now: Date = new Date()): number {
  if (!trialEndsAt) return 0;
  const ms = new Date(trialEndsAt).getTime() - now.getTime();
  return ms <= 0 ? 0 : Math.ceil(ms / DAY_MS);
}

/**
 * Anti-abuse: "owner+promo1@gmail.com" and "owner@gmail.com" are one mailbox. Returns the
 * canonical local part and domain so signup can refuse a second free trial for the same mailbox.
 */
export function emailMailbox(email: string): { local: string; domain: string } {
  const [rawLocal = "", domain = ""] = email.trim().toLowerCase().split("@");
  return { local: rawLocal.split("+")[0], domain };
}
