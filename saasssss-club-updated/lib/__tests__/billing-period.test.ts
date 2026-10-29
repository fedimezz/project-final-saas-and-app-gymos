import { describe, it, expect } from "vitest";
import { addBillingPeriod, periodStartFor, planPrice, isPeriodAvailable, yearlySavingsPercent, billingPeriodSchema } from "@/lib/billing-period";

describe("planPrice", () => {
  const plan = { priceMonthly: 29, priceYearly: 290 };
  it("returns the price of the requested period", () => {
    expect(planPrice(plan, "MONTHLY")).toBe(29);
    expect(planPrice(plan, "YEARLY")).toBe(290);
  });
  it("returns null when a period is not offered (null / 0 / negative / NaN)", () => {
    expect(planPrice({ priceMonthly: 29, priceYearly: null }, "YEARLY")).toBeNull();
    expect(planPrice({ priceMonthly: 29 }, "YEARLY")).toBeNull();
    expect(planPrice({ priceMonthly: 0, priceYearly: 10 }, "MONTHLY")).toBeNull();
    expect(planPrice({ priceMonthly: 29, priceYearly: -5 }, "YEARLY")).toBeNull();
    expect(planPrice({ priceMonthly: 29, priceYearly: Number.NaN }, "YEARLY")).toBeNull();
    expect(isPeriodAvailable({ priceMonthly: 29, priceYearly: null }, "YEARLY")).toBe(false);
  });
  it("computes the yearly saving versus 12 monthly payments", () => {
    expect(yearlySavingsPercent({ priceMonthly: 30, priceYearly: 300 })).toBe(17);
    expect(yearlySavingsPercent({ priceMonthly: 30, priceYearly: 360 })).toBe(0);
    expect(yearlySavingsPercent({ priceMonthly: 30, priceYearly: null })).toBe(0);
  });
});

describe("addBillingPeriod", () => {
  it("adds one calendar month / one calendar year", () => {
    expect(addBillingPeriod(new Date("2026-10-21T10:00:00Z"), "MONTHLY").toISOString()).toBe("2026-11-21T10:00:00.000Z");
    expect(addBillingPeriod(new Date("2026-10-21T10:00:00Z"), "YEARLY").toISOString()).toBe("2027-10-21T10:00:00.000Z");
  });
  it("never overflows into the next month (Jan 31 + 1 month = last day of February)", () => {
    expect(addBillingPeriod(new Date("2027-01-31T00:00:00Z"), "MONTHLY").toISOString()).toBe("2027-02-28T00:00:00.000Z");
    expect(addBillingPeriod(new Date("2028-01-31T00:00:00Z"), "MONTHLY").toISOString()).toBe("2028-02-29T00:00:00.000Z");
  });
  it("handles Feb 29 + 1 year and the December rollover", () => {
    expect(addBillingPeriod(new Date("2028-02-29T00:00:00Z"), "YEARLY").toISOString()).toBe("2029-02-28T00:00:00.000Z");
    expect(addBillingPeriod(new Date("2026-12-15T00:00:00Z"), "MONTHLY").toISOString()).toBe("2027-01-15T00:00:00.000Z");
  });
  it("does not mutate its input", () => {
    const d = new Date("2026-10-21T10:00:00Z");
    addBillingPeriod(d, "YEARLY");
    expect(d.toISOString()).toBe("2026-10-21T10:00:00.000Z");
  });
});

describe("billingPeriodSchema", () => {
  it("accepts only MONTHLY / YEARLY", () => {
    expect(billingPeriodSchema.safeParse("YEARLY").success).toBe(true);
    for (const bad of ["WEEKLY", "monthly", "", null, 12]) expect(billingPeriodSchema.safeParse(bad).success).toBe(false);
  });
});

describe("periodStartFor (early renewal)", () => {
  const now = new Date("2026-10-21T12:00:00Z");
  const end = new Date("2026-10-31T12:00:00Z");
  it("continues from the running period's end for the same plan", () => {
    expect(periodStartFor({ planId: "p", status: "ACTIVE", currentPeriodEnd: end }, "p", now)).toEqual(end);
  });
  it("starts now for a first payment, a plan change, a trial, a lapsed or suspended club, or no period end", () => {
    expect(periodStartFor(null, "p", now)).toEqual(now);
    expect(periodStartFor({ planId: "other", status: "ACTIVE", currentPeriodEnd: end }, "p", now)).toEqual(now);
    expect(periodStartFor({ planId: "p", status: "TRIALING", currentPeriodEnd: end }, "p", now)).toEqual(now);
    expect(periodStartFor({ planId: "p", status: "SUSPENDED", currentPeriodEnd: end }, "p", now)).toEqual(now);
    expect(periodStartFor({ planId: "p", status: "ACTIVE", currentPeriodEnd: new Date("2026-10-01T00:00:00Z") }, "p", now)).toEqual(now);
    expect(periodStartFor({ planId: "p", status: "ACTIVE", currentPeriodEnd: null }, "p", now)).toEqual(now);
  });
});
