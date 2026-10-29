import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const requireOwner = vi.fn();
const createStripeCheckout = vi.fn();
const saasPaymentFindFirst = vi.fn();
const saasPaymentCreate = vi.fn();
const saasPaymentUpdate = vi.fn();
const saasPaymentDelete = vi.fn();
const executeRaw = vi.fn();
const retrieveCheckout = vi.fn();
const planFindFirst = vi.fn();
const clubSubscriptionFindUnique = vi.fn();
const clubFindUnique = vi.fn();

vi.mock("@/lib/auth", () => ({ requireOwner: (...args: unknown[]) => requireOwner(...args) }));
vi.mock("@/lib/csrf", () => ({ verifyOrigin: () => null }));
vi.mock("@/lib/payments/stripe", () => ({
  createStripeCheckoutSession: (...args: unknown[]) => createStripeCheckout(...args),
  getStripe: () => ({ checkout: { sessions: { retrieve: (...args: unknown[]) => retrieveCheckout(...args) } } }),
}));
vi.mock("@/lib/prisma", () => ({
  default: {
    saasPayment: {
      findFirst: (...args: unknown[]) => saasPaymentFindFirst(...args),
      create: (...args: unknown[]) => saasPaymentCreate(...args),
      update: (...args: unknown[]) => saasPaymentUpdate(...args),
      delete: (...args: unknown[]) => saasPaymentDelete(...args),
    },
    saasPlan: { findFirst: (...args: unknown[]) => planFindFirst(...args) },
    clubSubscription: { findUnique: (...args: unknown[]) => clubSubscriptionFindUnique(...args) },
    club: { findUnique: (...args: unknown[]) => clubFindUnique(...args) },
    $transaction: (callback: (tx: unknown) => Promise<unknown>) => callback({
      $executeRaw: executeRaw,
      saasPayment: {
        findFirst: (...args: unknown[]) => saasPaymentFindFirst(...args),
        create: (...args: unknown[]) => saasPaymentCreate(...args),
      },
    }),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  requireOwner.mockResolvedValue({ ok: true, user: { id: "owner-1", clubId: "club-1", email: "owner@example.test" } });
  planFindFirst.mockResolvedValue({ id: "plan-pro", name: "Pro", currency: "USD", priceMonthly: 49, isActive: true });
  clubSubscriptionFindUnique.mockResolvedValue({ id: "club-sub-1", planId: "plan-basic", plan: { tier: "BASIC" } });
  clubFindUnique.mockResolvedValue({ slug: "gym-a", customDomain: null });
  saasPaymentFindFirst.mockResolvedValue(null);
  saasPaymentCreate.mockResolvedValue({
    id: "saas-pay-1",
    amount: 49,
    currency: "USD",
    status: "PENDING",
  });
  saasPaymentUpdate.mockResolvedValue({});
  saasPaymentDelete.mockResolvedValue({});
  executeRaw.mockResolvedValue(1);
  retrieveCheckout.mockResolvedValue({ status: "expired", url: null, metadata: null });
  createStripeCheckout.mockResolvedValue({
    id: "cs_saas",
    url: "https://checkout.stripe.com/c/pay/cs_saas",
  });
});

async function checkout(countryCode: string, planId = "plan-pro", billingPeriod?: string) {
  const { POST } = await import("@/app/api/billing/checkout/route");
  return POST(new NextRequest("https://gym-a.example/api/billing/checkout", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://gym-a.example" },
    body: JSON.stringify({ planId, countryCode, ...(billingPeriod ? { billingPeriod } : {}) }),
  }));
}

describe("POST /api/billing/checkout", () => {
  it("does not create online Tunisian SaaS charges", async () => {
    const response = await checkout("TN");
    expect(response.status).toBe(409);
    expect(saasPaymentCreate).not.toHaveBeenCalled();
    expect(createStripeCheckout).not.toHaveBeenCalled();
  });

  it("creates a pending SaaS ledger row and returns the Stripe Checkout URL abroad", async () => {
    const response = await checkout("US");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ paymentUrl: "https://checkout.stripe.com/c/pay/cs_saas" });
    expect(saasPaymentCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        clubId: "club-1",
        subscriptionId: "club-sub-1",
        amount: 49,
        currency: "USD",
        status: "PENDING",
        paymentProvider: "STRIPE",
        countryCode: "US",
      }),
    });
    expect(createStripeCheckout).toHaveBeenCalledWith(expect.objectContaining({
      amount: 49,
      currency: "USD",
      clientReferenceId: "saas-pay-1",
      metadata: expect.objectContaining({ kind: "SAAS_PLAN", clubId: "club-1", planId: "plan-pro" }),
    }));
    expect(saasPaymentUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "saas-pay-1", clubId: "club-1" },
      data: { providerRef: "cs_saas" },
    }));
  });

  it("reuses the existing open Checkout session for the same plan and country", async () => {
    saasPaymentFindFirst.mockResolvedValue({
      id: "saas-pay-older",
      amount: 49,
      currency: "USD",
      billingPeriod: "MONTHLY",
      providerRef: "cs_existing",
    });
    retrieveCheckout.mockResolvedValue({
      status: "open",
      url: "https://checkout.stripe.com/c/pay/cs_existing",
      metadata: { planId: "plan-pro", countryCode: "US", billingPeriod: "MONTHLY" },
    });
    const response = await checkout("US");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ paymentUrl: "https://checkout.stripe.com/c/pay/cs_existing" });
    expect(saasPaymentCreate).not.toHaveBeenCalled();
    expect(createStripeCheckout).not.toHaveBeenCalled();
  });

  it("defaults to MONTHLY and records the period on the ledger row and in the Stripe metadata", async () => {
    await checkout("US");
    expect(saasPaymentCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ billingPeriod: "MONTHLY", amount: 49 }) });
    expect(createStripeCheckout).toHaveBeenCalledWith(expect.objectContaining({
      metadata: expect.objectContaining({ billingPeriod: "MONTHLY" }),
    }));
  });

  it("charges the YEARLY price read from the plan row (never from the request) for a yearly checkout", async () => {
    planFindFirst.mockResolvedValue({ id: "plan-pro", name: "Pro", currency: "USD", priceMonthly: 49, priceYearly: 490, isActive: true });
    saasPaymentCreate.mockResolvedValue({ id: "saas-pay-1", amount: 490, currency: "USD", status: "PENDING" });
    const { POST } = await import("@/app/api/billing/checkout/route");
    const response = await POST(new NextRequest("https://gym-a.example/api/billing/checkout", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://gym-a.example" },
      // a hostile client also sends its own amount: it must be ignored
      body: JSON.stringify({ planId: "plan-pro", countryCode: "US", billingPeriod: "YEARLY", amount: 1, priceYearly: 1 }),
    }));
    expect(response.status).toBe(200);
    expect(saasPaymentCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ billingPeriod: "YEARLY", amount: 490 }) });
    expect(createStripeCheckout).toHaveBeenCalledWith(expect.objectContaining({
      amount: 490,
      metadata: expect.objectContaining({ billingPeriod: "YEARLY" }),
    }));
  });

  it("refuses a yearly checkout for a plan that has no yearly price", async () => {
    planFindFirst.mockResolvedValue({ id: "plan-pro", name: "Pro", currency: "USD", priceMonthly: 49, priceYearly: null, isActive: true });
    const response = await checkout("US", "plan-pro", "YEARLY");
    expect(response.status).toBe(400);
    expect(saasPaymentCreate).not.toHaveBeenCalled();
    expect(createStripeCheckout).not.toHaveBeenCalled();
  });

  it("does not reuse an open monthly session for a yearly request", async () => {
    planFindFirst.mockResolvedValue({ id: "plan-pro", name: "Pro", currency: "USD", priceMonthly: 49, priceYearly: 490, isActive: true });
    saasPaymentFindFirst.mockResolvedValue({ id: "saas-pay-older", amount: 49, currency: "USD", billingPeriod: "MONTHLY", providerRef: "cs_existing" });
    retrieveCheckout.mockResolvedValue({ status: "open", url: "https://checkout.stripe.com/c/pay/cs_existing", metadata: { planId: "plan-pro", countryCode: "US", billingPeriod: "MONTHLY" } });
    const response = await checkout("US", "plan-pro", "YEARLY");
    expect(createStripeCheckout).not.toHaveBeenCalledWith(expect.objectContaining({ amount: 49 }));
    expect(response.status).not.toBe(500);
  });

  it("rejects plans not denominated in USD", async () => {
    planFindFirst.mockResolvedValue({ id: "plan-pro", name: "Pro", currency: "TND", priceMonthly: 49, isActive: true });
    const response = await checkout("FR");
    expect(response.status).toBe(400);
    expect(saasPaymentCreate).not.toHaveBeenCalled();
  });

  it("removes the pending ledger row if Stripe session creation fails", async () => {
    createStripeCheckout.mockRejectedValue(new Error("Stripe unavailable"));
    const response = await checkout("US");
    expect(response.status).toBe(502);
    expect(saasPaymentDelete).toHaveBeenCalledWith({ where: { id: "saas-pay-1", clubId: "club-1" } });
  });

  describe("auto-renewing subscriptions (STRIPE_RECURRING_ENABLED)", () => {
    const sub = (over: Record<string, unknown> = {}) => ({
      id: "club-sub-1", planId: "plan-basic", status: "TRIALING", billingPeriod: "MONTHLY",
      currentPeriodEnd: null, cancelAtPeriodEnd: false, providerSubscriptionId: null, plan: { tier: "BASIC" }, ...over,
    });
    beforeEach(() => {
      planFindFirst.mockResolvedValue({ id: "plan-pro", name: "Pro", currency: "USD", priceMonthly: 49, priceYearly: 490, isActive: true });
      process.env.STRIPE_RECURRING_ENABLED = "true";
    });
    afterEach(() => { delete process.env.STRIPE_RECURRING_ENABLED; });

    it("flag OFF (default): one-time payment, exactly as before", async () => {
      delete process.env.STRIPE_RECURRING_ENABLED;
      clubSubscriptionFindUnique.mockResolvedValue(sub());
      await checkout("US");
      expect(createStripeCheckout.mock.calls[0][0].recurring).toBeUndefined();
      expect(createStripeCheckout.mock.calls[0][0].metadata.recurring).toBe("false");
    });

    it("flag ON: a trial club subscribes to an auto-renewing YEARLY plan (year interval, yearly price)", async () => {
      clubSubscriptionFindUnique.mockResolvedValue(sub());
      saasPaymentCreate.mockResolvedValue({ id: "saas-pay-1", amount: 490, currency: "USD", status: "PENDING" });
      const res = await checkout("US", "plan-pro", "YEARLY");
      expect(res.status).toBe(200);
      expect(createStripeCheckout).toHaveBeenCalledWith(expect.objectContaining({
        amount: 490, recurring: { interval: "year" }, metadata: expect.objectContaining({ recurring: "true", billingPeriod: "YEARLY" }),
      }));
    });

    it("flag ON: monthly uses the month interval", async () => {
      clubSubscriptionFindUnique.mockResolvedValue(sub());
      await checkout("US");
      expect(createStripeCheckout).toHaveBeenCalledWith(expect.objectContaining({ recurring: { interval: "month" } }));
    });

    it("flag ON: refuses (409 + portal hint) a second subscription for a plan that already auto-renews", async () => {
      clubSubscriptionFindUnique.mockResolvedValue(sub({ planId: "plan-pro", status: "ACTIVE", providerSubscriptionId: "sub_123", currentPeriodEnd: new Date(Date.now() + 10 * 86_400_000) }));
      const res = await checkout("US", "plan-pro", "MONTHLY");
      expect(res.status).toBe(409);
      expect((await res.json()).portal).toBe(true);
      expect(createStripeCheckout).not.toHaveBeenCalled();
      expect(saasPaymentCreate).not.toHaveBeenCalled();
    });

    it("flag ON: a one-time period still running on the same plan stays one-time (unused days are kept)", async () => {
      clubSubscriptionFindUnique.mockResolvedValue(sub({ planId: "plan-pro", status: "ACTIVE", billingPeriod: "YEARLY", currentPeriodEnd: new Date(Date.now() + 10 * 86_400_000) }));
      await checkout("US", "plan-pro", "MONTHLY");
      expect(createStripeCheckout.mock.calls[0][0].recurring).toBeUndefined();
    });

    it("flag ON: switching plans while auto-renewing is allowed (the old Stripe subscription is cancelled at settlement)", async () => {
      clubSubscriptionFindUnique.mockResolvedValue(sub({ planId: "plan-basic", status: "ACTIVE", providerSubscriptionId: "sub_old", currentPeriodEnd: new Date(Date.now() + 10 * 86_400_000) }));
      const res = await checkout("US", "plan-pro", "MONTHLY");
      expect(res.status).toBe(200);
      expect(createStripeCheckout).toHaveBeenCalledWith(expect.objectContaining({ recurring: { interval: "month" } }));
    });
  });
});
