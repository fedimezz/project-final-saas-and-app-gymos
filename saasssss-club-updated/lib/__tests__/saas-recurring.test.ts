import { describe, it, expect } from "vitest";
import { decideRecurring, isRecurringEnabled, stripeIntervalFor, type RecurringContext } from "@/lib/saas-recurring";

const now = new Date("2026-10-21T12:00:00Z");
const future = new Date("2026-11-05T00:00:00Z");
const past = new Date("2026-10-01T00:00:00Z");
const sub = (o: Partial<RecurringContext> = {}): RecurringContext => ({
  planId: "pro", status: "TRIALING", billingPeriod: "MONTHLY", currentPeriodEnd: null, cancelAtPeriodEnd: false, providerSubscriptionId: null, ...o,
});

describe("flag", () => {
  it("is OFF unless STRIPE_RECURRING_ENABLED is exactly 'true'", () => {
    expect(isRecurringEnabled({})).toBe(false);
    for (const v of ["", "false", "1", "TRUE", "yes"]) expect(isRecurringEnabled({ STRIPE_RECURRING_ENABLED: v })).toBe(false);
    expect(isRecurringEnabled({ STRIPE_RECURRING_ENABLED: "true" })).toBe(true);
  });
  it("maps the billing period to the Stripe interval", () => {
    expect(stripeIntervalFor("MONTHLY")).toBe("month");
    expect(stripeIntervalFor("YEARLY")).toBe("year");
  });
});

describe("decideRecurring", () => {
  it("flag off → never recurring, never blocked", () => {
    expect(decideRecurring(false, sub(), "pro", "MONTHLY", now)).toEqual({ recurring: false });
    expect(decideRecurring(false, sub({ providerSubscriptionId: "s", status: "ACTIVE" }), "pro", "MONTHLY", now)).toEqual({ recurring: false });
  });
  it("first payment, trial, signup (no subscription row yet) → recurring", () => {
    expect(decideRecurring(true, null, "pro", "MONTHLY", now).recurring).toBe(true);
    expect(decideRecurring(true, sub(), "pro", "YEARLY", now).recurring).toBe(true);
  });
  it("lapsed / suspended club → recurring", () => {
    expect(decideRecurring(true, sub({ status: "ACTIVE", currentPeriodEnd: past }), "pro", "MONTHLY", now).recurring).toBe(true);
    expect(decideRecurring(true, sub({ status: "SUSPENDED", currentPeriodEnd: future }), "pro", "MONTHLY", now).recurring).toBe(true);
  });
  it("already auto-renewing the same plan + period → blocked (would double-bill)", () => {
    for (const status of ["ACTIVE", "PAST_DUE"]) {
      const d = decideRecurring(true, sub({ status, planId: "pro", billingPeriod: "MONTHLY", providerSubscriptionId: "sub_1", currentPeriodEnd: future }), "pro", "MONTHLY", now);
      expect(d.recurring).toBe(false);
      expect(d.blocked).toMatch(/renouvellement automatique/i);
    }
  });
  it("auto-renewal already cancelled → can subscribe again", () => {
    const d = decideRecurring(true, sub({ status: "ACTIVE", providerSubscriptionId: "sub_1", cancelAtPeriodEnd: true, currentPeriodEnd: future }), "pro", "MONTHLY", now);
    expect(d.blocked).toBeUndefined();
    expect(d.recurring).toBe(true);
  });
  it("auto-renewing but changing plan or period → allowed (old subscription is cancelled at settlement)", () => {
    const base = { status: "ACTIVE", providerSubscriptionId: "sub_1", currentPeriodEnd: future };
    expect(decideRecurring(true, sub({ ...base, planId: "basic" }), "pro", "MONTHLY", now).recurring).toBe(true);
    expect(decideRecurring(true, sub({ ...base, billingPeriod: "MONTHLY" }), "pro", "YEARLY", now).recurring).toBe(true);
  });
  it("a one-time period still running on the SAME plan stays one-time (keeps the unused days)", () => {
    expect(decideRecurring(true, sub({ status: "ACTIVE", currentPeriodEnd: future }), "pro", "MONTHLY", now)).toEqual({ recurring: false });
  });
  it("a one-time period running on ANOTHER plan → plan change → recurring", () => {
    expect(decideRecurring(true, sub({ status: "ACTIVE", planId: "basic", currentPeriodEnd: future }), "pro", "MONTHLY", now).recurring).toBe(true);
  });
});
