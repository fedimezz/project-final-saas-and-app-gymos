/**
 * /api/dashboard/membership/subscribe
 *  - concurrent subscribes for one user are serialised (advisory lock, first in the tx)
 *  - a promo code no longer crashes checkout: payment.create only receives real Payment columns
 *  - a Stripe checkout failure gives the claimed promo use back
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";

const requireUser = vi.fn();
vi.mock("@/lib/auth-server", () => ({
  requireUser: (...a: unknown[]) => requireUser(...a),
  isAuthResponse: (v: unknown) => v instanceof Response,
}));
const createStripeCheckout = vi.fn();
vi.mock("@/lib/payments/stripe", () => ({ createStripeCheckoutSession: (...a: unknown[]) => createStripeCheckout(...a) }));

const callOrder: string[] = [];
const paymentCreate = vi.fn();
const promoUpdateMany = vi.fn();
const rootPromoUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
const paymentDelete = vi.fn().mockResolvedValue({});
const subDelete = vi.fn().mockResolvedValue({});

const PLAN = { id: "plan-1", name: "Mensuel", price: 120, currency: "USD", durationDays: 30, isActive: true };
const PROMO = {
  id: "promo-1", isActive: true, startDate: new Date(Date.now() - 1e6), endDate: null,
  maxUses: 10, usedCount: 1, discountType: "PERCENT", discountValue: 10,
};

const tx = {
  $executeRaw: vi.fn(async () => { callOrder.push("lock"); return 1; }),
  subscription: {
    findFirst: vi.fn(async () => { callOrder.push("existing-check"); return null; }),
    create: vi.fn(async () => ({ id: "sub-1" })),
  },
  promotion: { findUnique: vi.fn(async () => PROMO), updateMany: (...a: unknown[]) => promoUpdateMany(...a) },
  payment: { create: (...a: unknown[]) => paymentCreate(...a) },
};

vi.mock("@/lib/prisma", () => ({
  default: {
    membershipPlan: { findFirst: vi.fn(async () => PLAN) },
    user: { findUnique: vi.fn(async () => ({ id: "u1", name: "U Test", email: "u@x.test", phone: null, isActive: true })) },
    club: { findUnique: vi.fn(async () => ({ slug: "club-a", customDomain: null })) },
    $transaction: async (input: ((t: unknown) => Promise<unknown>) | Promise<unknown>[]) =>
      Array.isArray(input) ? Promise.all(input) : input(tx),
    payment: { update: vi.fn(), delete: (...a: unknown[]) => paymentDelete(...a) },
    subscription: { delete: (...a: unknown[]) => subDelete(...a) },
    promotion: { updateMany: (...a: unknown[]) => rootPromoUpdateMany(...a) },
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  callOrder.length = 0;
  requireUser.mockResolvedValue({ id: "u1", clubId: "club-1", role: "MEMBER" });
  promoUpdateMany.mockResolvedValue({ count: 1 });
  paymentCreate.mockImplementation(async ({ data }: { data: { amount: number; currency: string } }) => ({ id: "pay-1", amount: data.amount, currency: data.currency }));
  createStripeCheckout.mockResolvedValue({ id: "cs_test_123", url: "https://checkout.stripe.com/pay/test" });
});

async function subscribe(body: Record<string, unknown>) {
  const { POST } = await import("@/app/api/dashboard/membership/subscribe/route");
  return POST(
    new NextRequest("https://club-1.test/api/dashboard/membership/subscribe", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    })
  );
}

describe("subscribe", () => {
  it("takes the per-user advisory lock BEFORE the 'existing subscription?' check", async () => {
    await subscribe({ planId: "plan-1", paymentMethod: "ONSITE", countryCode: "TN" });
    expect(callOrder).toEqual(["lock", "existing-check"]);
  });

  it("with a promo code: payment.create only receives real Payment columns (used to 500)", async () => {
    const res = await subscribe({ planId: "plan-1", paymentMethod: "ONSITE", countryCode: "TN", promoCode: "SAVE10" });
    expect(res.status).toBe(200);

    const validFields = new Set(
      Prisma.dmmf.datamodel.models.find((m) => m.name === "Payment")!.fields.map((f) => f.name)
    );
    const sent = Object.keys(paymentCreate.mock.calls[0][0].data);
    const unknown = sent.filter((k) => !validFields.has(k));
    expect(unknown).toEqual([]);
    expect(paymentCreate.mock.calls[0][0].data.amount).toBe(108); // 10% off 120 USD
  });

  it("Stripe failure: rolls back AND gives the promo use back", async () => {
    createStripeCheckout.mockRejectedValue(new Error("gateway down"));
    const res = await subscribe({ planId: "plan-1", paymentMethod: "ONLINE", countryCode: "US", promoCode: "SAVE10" });

    expect(res.status).toBe(502);
    expect(paymentDelete).toHaveBeenCalled();
    expect(subDelete).toHaveBeenCalled();
    expect(createStripeCheckout).toHaveBeenCalledWith(expect.objectContaining({
      amount: 108,
      currency: "USD",
    }));
    expect(rootPromoUpdateMany).toHaveBeenCalledWith({
      where: { id: "promo-1", clubId: "club-1", usedCount: { gt: 0 } },
      data: { usedCount: { decrement: 1 } },
    });
  });

  it("Stripe failure without a promo doesn't touch promotions", async () => {
    createStripeCheckout.mockRejectedValue(new Error("gateway down"));
    await subscribe({ planId: "plan-1", paymentMethod: "ONLINE", countryCode: "US" });
    expect(rootPromoUpdateMany).not.toHaveBeenCalled();
  });

  it("does not apply a TND fixed-amount promotion to a non-TND offer", async () => {
    const fixedPromo = { ...PROMO, discountType: "FIXED" };
    tx.promotion.findUnique.mockResolvedValue(fixedPromo);
    const res = await subscribe({ planId: "plan-1", paymentMethod: "ONLINE", countryCode: "US", promoCode: "SAVE10" });
    expect(res.status).toBe(400);
    expect(promoUpdateMany).not.toHaveBeenCalled();
    expect(createStripeCheckout).not.toHaveBeenCalled();
  });
});
