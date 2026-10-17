import { beforeEach, describe, expect, it, vi } from "vitest";
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

async function checkout(countryCode: string, planId = "plan-pro") {
  const { POST } = await import("@/app/api/billing/checkout/route");
  return POST(new NextRequest("https://gym-a.example/api/billing/checkout", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://gym-a.example" },
    body: JSON.stringify({ planId, countryCode }),
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
      providerRef: "cs_existing",
    });
    retrieveCheckout.mockResolvedValue({
      status: "open",
      url: "https://checkout.stripe.com/c/pay/cs_existing",
      metadata: { planId: "plan-pro", countryCode: "US" },
    });
    const response = await checkout("US");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ paymentUrl: "https://checkout.stripe.com/c/pay/cs_existing" });
    expect(saasPaymentCreate).not.toHaveBeenCalled();
    expect(createStripeCheckout).not.toHaveBeenCalled();
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
});
