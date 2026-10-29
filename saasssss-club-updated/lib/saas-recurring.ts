// lib/saas-recurring.ts — when a card checkout becomes an auto-renewing Stripe Subscription.
//
// OFF by default: set STRIPE_RECURRING_ENABLED=true to turn it on (until then every card payment stays a
// one-time payment for one period, exactly as before). Pure functions, shared by the 3 checkout routes.
import type { BillingPeriod } from "@/lib/billing-period";

export function isRecurringEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.STRIPE_RECURRING_ENABLED === "true";
}

export function stripeIntervalFor(period: BillingPeriod): "month" | "year" {
  return period === "YEARLY" ? "year" : "month";
}

export interface RecurringContext {
  planId: string;
  status: string;
  billingPeriod: string;
  currentPeriodEnd: Date | string | null;
  cancelAtPeriodEnd: boolean;
  providerSubscriptionId: string | null;
}

export type RecurringDecision =
  | { recurring: boolean; blocked?: undefined }
  | { recurring: false; blocked: string };

/**
 * - flag off                                   → one-time payment
 * - already auto-renewing the SAME plan+period → blocked (a second Stripe subscription would double-bill)
 * - paid period still running on the same plan, bought as a one-time payment → one-time (so the unused
 *   days are kept by the early-renewal rule instead of being lost)
 * - anything else (first payment, trial, signup, lapsed, plan change) → auto-renewing subscription
 */
export function decideRecurring(
  flag: boolean,
  sub: RecurringContext | null,
  planId: string,
  period: BillingPeriod,
  now: Date = new Date()
): RecurringDecision {
  if (!flag) return { recurring: false };
  if (!sub) return { recurring: true };
  const autoRenewing = !!sub.providerSubscriptionId && !sub.cancelAtPeriodEnd && ["ACTIVE", "PAST_DUE"].includes(sub.status);
  if (autoRenewing && sub.planId === planId && sub.billingPeriod === period) {
    return { recurring: false, blocked: "Le renouvellement automatique est déjà actif pour ce plan. Utilisez « Gérer l'abonnement » pour modifier votre carte ou l'annuler." };
  }
  const running = sub.status === "ACTIVE" && !!sub.currentPeriodEnd && new Date(sub.currentPeriodEnd).getTime() > now.getTime();
  if (running && sub.planId === planId && !sub.providerSubscriptionId) return { recurring: false };
  return { recurring: true };
}
