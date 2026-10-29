import { describe, expect, it } from "vitest";
import { isCardPaymentAvailable, isStripeConfigured } from "@/lib/payments/availability";

describe("isStripeConfigured", () => {
  it("needs both the secret key and the webhook secret", () => {
    expect(isStripeConfigured({ STRIPE_SECRET_KEY: "sk_test_x", STRIPE_WEBHOOK_SECRET: "whsec_x" })).toBe(true);
    expect(isStripeConfigured({ STRIPE_SECRET_KEY: "sk_test_x" })).toBe(false);
    expect(isStripeConfigured({ STRIPE_WEBHOOK_SECRET: "whsec_x" })).toBe(false);
    expect(isStripeConfigured({})).toBe(false);
  });

  it("ignores blank values", () => {
    expect(isStripeConfigured({ STRIPE_SECRET_KEY: "  ", STRIPE_WEBHOOK_SECRET: "whsec_x" })).toBe(false);
  });
});

describe("isCardPaymentAvailable", () => {
  const env = { STRIPE_SECRET_KEY: "sk_test_x", STRIPE_WEBHOOK_SECRET: "whsec_x" };
  it("is true outside Tunisia when Stripe is configured", () => {
    expect(isCardPaymentAvailable("FR", env)).toBe(true);
    expect(isCardPaymentAvailable(undefined, env)).toBe(true);
  });
  it("is never true for Tunisia", () => {
    expect(isCardPaymentAvailable("TN", env)).toBe(false);
    expect(isCardPaymentAvailable("tn", env)).toBe(false);
  });
  it("is false when Stripe is not configured", () => {
    expect(isCardPaymentAvailable("FR", {})).toBe(false);
  });
});
