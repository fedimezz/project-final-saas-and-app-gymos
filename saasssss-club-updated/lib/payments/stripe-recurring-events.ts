// lib/payments/stripe-recurring-events.ts — signed Stripe events for AUTO-RENEWING club plans
// (STRIPE_RECURRING_ENABLED). Called by the webhook AFTER signature verification.
//
//  invoice.paid (renewal)            → one PAID ledger row per invoice (idempotent), next period starts,
//                                      a club suspended for lateness is re-opened.
//  invoice.payment_failed (renewal)  → subscription PAST_DUE; the existing renewal cron suspends it after
//                                      its grace, and paid-period expiry (lib/subscription-expiry) still applies.
//  customer.subscription.deleted     → renewal stops (cancelAtPeriodEnd); access continues to the end of the
//                                      period already paid, never cut early, never extended.
// The FIRST invoice of a subscription ("subscription_create") is settled by checkout.session.completed
// (webhook / onboarding-complete), so it is ignored here — no double activation.
import type Stripe from "stripe";
import type { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { addBillingPeriod, periodStartFor } from "@/lib/billing-period";
import { fromStripeMinorUnits } from "@/lib/payments/stripe";

export const RECURRING_EVENT_TYPES = ["invoice.paid", "invoice.payment_failed", "customer.subscription.deleted"] as const;

function idOf(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && typeof (value as { id?: unknown }).id === "string") return (value as { id: string }).id;
  return null;
}

/** Subscription id of an invoice, across Stripe API versions (top-level field, or parent.subscription_details). */
export function invoiceSubscriptionId(invoice: unknown): string | null {
  const inv = invoice as { subscription?: unknown; parent?: { subscription_details?: { subscription?: unknown } } };
  return idOf(inv.subscription) ?? idOf(inv.parent?.subscription_details?.subscription);
}

export async function handleSaasRecurringEvent(event: Stripe.Event): Promise<void> {
  if (event.type === "customer.subscription.deleted") {
    const stripeSub = event.data.object as Stripe.Subscription;
    await prisma.clubSubscription.updateMany({
      where: { providerSubscriptionId: stripeSub.id },
      data: { cancelAtPeriodEnd: true, canceledAt: new Date() },
    });
    return;
  }

  const invoice = event.data.object as Stripe.Invoice;
  const stripeSubId = invoiceSubscriptionId(invoice);
  if (!stripeSubId || invoice.billing_reason !== "subscription_cycle") return;

  const sub = await prisma.clubSubscription.findFirst({
    where: { providerSubscriptionId: stripeSubId },
    select: {
      id: true, clubId: true, planId: true, billingPeriod: true, status: true, currentPeriodEnd: true,
      plan: { select: { currency: true } },
    },
  });
  if (!sub) {
    console.warn("Stripe renewal event for an unknown subscription", { stripeSubId, eventId: event.id });
    return;
  }

  if (event.type === "invoice.payment_failed") {
    await prisma.clubSubscription.updateMany({ where: { id: sub.id, status: "ACTIVE" }, data: { status: "PAST_DUE" } });
    return;
  }

  // invoice.paid
  if (!invoice.id) return;
  const currency = (invoice.currency || "").toLowerCase();
  if (currency !== sub.plan.currency.toLowerCase()) {
    console.error("Stripe renewal invoice currency does not match the plan", { invoiceId: invoice.id, currency });
    throw new Error("Renewal invoice currency mismatch");
  }
  const now = new Date();
  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    // Same invoice delivered twice (retries, replays) → exactly one ledger row and one period.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`saas-invoice:${invoice.id}`}))`;
    const already = await tx.saasPayment.findFirst({ where: { clubId: sub.clubId, providerRef: invoice.id }, select: { id: true } });
    if (already) return;
    await tx.saasPayment.create({
      data: {
        clubId: sub.clubId,
        subscriptionId: sub.id,
        amount: fromStripeMinorUnits(invoice.amount_paid, currency),
        currency: sub.plan.currency,
        status: "PAID",
        paymentProvider: "STRIPE",
        providerRef: invoice.id,
        billingPeriod: sub.billingPeriod,
        paidAt: now,
      },
    });
    const start = periodStartFor({ planId: sub.planId, status: "ACTIVE", currentPeriodEnd: sub.currentPeriodEnd }, sub.planId, now);
    await tx.clubSubscription.update({
      where: { id: sub.id },
      data: {
        status: "ACTIVE",
        currentPeriodStart: now,
        currentPeriodEnd: addBillingPeriod(start, sub.billingPeriod),
        cancelAtPeriodEnd: false,
        canceledAt: null,
      },
    });
    // A club suspended for lateness is re-opened by the late payment; a banned (CANCELLED) club never is.
    await tx.club.updateMany({
      where: { id: sub.clubId, status: { in: ["TRIAL", "SUSPENDED"] } },
      data: { status: "ACTIVE", suspendedAt: null, suspendedReason: null },
    });
  });
}
