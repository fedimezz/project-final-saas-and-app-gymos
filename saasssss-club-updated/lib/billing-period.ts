// lib/billing-period.ts — monthly / yearly billing rules in one pure, client-safe place.
// Used by onboarding, checkout, reactivation, manual requests, the Stripe webhook and the UIs so
// that "what does this period cost" and "when does it end" can never disagree.
import { z } from "zod";

export const BILLING_PERIODS = ["MONTHLY", "YEARLY"] as const;
export type BillingPeriod = (typeof BILLING_PERIODS)[number];
export const billingPeriodSchema = z.enum(BILLING_PERIODS);

export const BILLING_PERIOD_LABEL: Record<BillingPeriod, string> = {
  MONTHLY: "Mensuel",
  YEARLY: "Annuel",
};
/** "/ mois" or "/ an" — for price tags. */
export const BILLING_PERIOD_SUFFIX: Record<BillingPeriod, string> = {
  MONTHLY: "/ mois",
  YEARLY: "/ an",
};

export interface PricedPlan {
  priceMonthly: number;
  priceYearly?: number | null;
}

/** The price of one period, or null when this plan cannot be bought for that period. */
export function planPrice(plan: PricedPlan, period: BillingPeriod): number | null {
  const value = period === "YEARLY" ? plan.priceYearly : plan.priceMonthly;
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

export function isPeriodAvailable(plan: PricedPlan, period: BillingPeriod): boolean {
  return planPrice(plan, period) !== null;
}

/** Percent saved by paying yearly instead of 12 monthly payments (0 when there is no saving). */
export function yearlySavingsPercent(plan: PricedPlan): number {
  const monthly = planPrice(plan, "MONTHLY");
  const yearly = planPrice(plan, "YEARLY");
  if (!monthly || !yearly) return 0;
  const pct = Math.round((1 - yearly / (monthly * 12)) * 100);
  return pct > 0 ? pct : 0;
}

/** End of a paid period that starts at `from` (calendar month / calendar year, never overflowing). */
export function addBillingPeriod(from: Date, period: BillingPeriod): Date {
  const end = new Date(from);
  const day = end.getUTCDate();
  end.setUTCDate(1);
  if (period === "YEARLY") end.setUTCFullYear(end.getUTCFullYear() + 1);
  else end.setUTCMonth(end.getUTCMonth() + 1);
  // Jan 31 + 1 month → Feb 28/29, not Mar 3.
  const lastDay = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0)).getUTCDate();
  end.setUTCDate(Math.min(day, lastDay));
  return end;
}

export function formatPlanPrice(plan: PricedPlan & { currency: string }, period: BillingPeriod): string {
  const price = planPrice(plan, period);
  return price === null ? "—" : `${price} ${plan.currency}`;
}

export interface ExistingSubscriptionPeriod {
  planId: string;
  status: string;
  currentPeriodEnd: Date | string | null;
}

/**
 * When a new paid period begins. Renewing the SAME plan while the current paid period is still running
 * continues from its end, so paying early never loses the days already paid for. Anything else (first
 * payment, expired / suspended / trialing club, a plan CHANGE) starts now — a plan change never carries
 * leftover days of a different plan over.
 */
export function periodStartFor(existing: ExistingSubscriptionPeriod | null | undefined, newPlanId: string, now: Date = new Date()): Date {
  if (!existing || existing.status !== "ACTIVE" || existing.planId !== newPlanId || !existing.currentPeriodEnd) return now;
  const end = new Date(existing.currentPeriodEnd);
  return end.getTime() > now.getTime() ? end : now;
}
