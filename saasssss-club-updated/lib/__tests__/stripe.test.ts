import { describe, expect, it } from "vitest";
import { toStripeMinorUnits } from "@/lib/payments/stripe";

describe("Stripe amount conversion", () => {
  it("converts two-decimal currencies to the integer amount Stripe requires", () => {
    expect(toStripeMinorUnits(12.34, "USD")).toBe(1234);
  });

  it("does not multiply zero-decimal currencies", () => {
    expect(toStripeMinorUnits(120, "JPY")).toBe(120);
  });

  it("rejects invalid and zero-value payments", () => {
    expect(() => toStripeMinorUnits(0, "USD")).toThrow();
    expect(() => toStripeMinorUnits(Number.NaN, "USD")).toThrow();
    expect(() => toStripeMinorUnits(1.001, "USD")).toThrow();
    expect(() => toStripeMinorUnits(1, "US")).toThrow();
  });
});
