import { describe, expect, it } from "vitest";
import {
  canStripeChargeMembershipCurrency,
  formatMembershipPrice,
  isValidMembershipPrice,
} from "@/lib/payment-currencies";

describe("membership currency helpers", () => {
  it("formats offers using the selected currency and its precision", () => {
    expect(formatMembershipPrice(12.5, "USD", "en-US")).toBe("$12.50");
    expect(formatMembershipPrice(12.345, "TND", "en-US")).toContain("12.345");
  });

  it("enforces currency-specific decimal precision", () => {
    expect(isValidMembershipPrice(19.999, "TND")).toBe(true);
    expect(isValidMembershipPrice(19.9999, "TND")).toBe(false);
    expect(isValidMembershipPrice(19.99, "EUR")).toBe(true);
    expect(isValidMembershipPrice(19.999, "EUR")).toBe(false);
  });

  it("allows Stripe only for the configured online payment currencies", () => {
    expect(canStripeChargeMembershipCurrency("EUR")).toBe(true);
    expect(canStripeChargeMembershipCurrency("TND")).toBe(false);
  });
});
