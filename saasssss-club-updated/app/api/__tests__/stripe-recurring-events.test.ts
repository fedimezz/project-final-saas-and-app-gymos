/**
 * Auto-renewing club plans: invoice.paid / invoice.payment_failed / customer.subscription.deleted.
 * The webhook verifies the Stripe signature first (covered in stripe-webhook.test.ts); these tests cover what
 * the handler does with a verified event.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type Stripe from "stripe";

const subFindFirst = vi.fn();
const subUpdate = vi.fn();
const subUpdateMany = vi.fn();
const paymentFindFirst = vi.fn();
const paymentCreate = vi.fn();
const clubUpdateMany = vi.fn();
const executeRaw = vi.fn();
const constructEvent = vi.fn();

vi.mock("@/lib/payments/stripe", () => ({
  getStripe: () => ({ webhooks: { constructEvent: (...a: unknown[]) => constructEvent(...a) } }),
  getStripeWebhookSecret: () => "whsec_test",
  toStripeMinorUnits: (n: number) => Math.round(n * 100),
  fromStripeMinorUnits: (m: number) => m / 100,
  cancelStripeSubscription: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({
  default: {
    clubSubscription: { findFirst: (...a: unknown[]) => subFindFirst(...a), updateMany: (...a: unknown[]) => subUpdateMany(...a) },
    $transaction: (cb: (tx: unknown) => Promise<unknown>) =>
      cb({
        $executeRaw: executeRaw,
        saasPayment: { findFirst: (...a: unknown[]) => paymentFindFirst(...a), create: (...a: unknown[]) => paymentCreate(...a) },
        clubSubscription: { update: (...a: unknown[]) => subUpdate(...a) },
        club: { updateMany: (...a: unknown[]) => clubUpdateMany(...a) },
      }),
  },
}));

const DAY = 86_400_000;
const sub = (over: Record<string, unknown> = {}) => ({
  id: "club-sub-1", clubId: "club-1", planId: "plan-pro", billingPeriod: "MONTHLY", status: "ACTIVE",
  currentPeriodEnd: new Date(Date.now() + 0.2 * DAY), plan: { currency: "USD" }, ...over,
});
const invoice = (over: Record<string, unknown> = {}) => ({
  id: "in_1", subscription: "sub_1", billing_reason: "subscription_cycle", currency: "usd", amount_paid: 7900, ...over,
});
const event = (type: string, object: unknown) => ({ id: "evt_1", type, data: { object } });

async function deliver(type: string, object: unknown) {
  constructEvent.mockReturnValue(event(type, object));
  const { POST } = await import("@/app/api/payments/stripe/webhook/route");
  return POST(new NextRequest("https://yoursaas.test/api/payments/stripe/webhook", {
    method: "POST", headers: { "stripe-signature": "sig" }, body: "{}",
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
  subFindFirst.mockResolvedValue(sub());
  paymentFindFirst.mockResolvedValue(null);
  paymentCreate.mockResolvedValue({});
  subUpdate.mockResolvedValue({});
  subUpdateMany.mockResolvedValue({ count: 1 });
  clubUpdateMany.mockResolvedValue({ count: 0 });
  executeRaw.mockResolvedValue(1);
});

describe("invoice.paid (renewal)", () => {
  it("writes ONE paid ledger row for the invoice and starts the next period from the end of the current one", async () => {
    const res = await deliver("invoice.paid", invoice());
    expect(res.status).toBe(200);
    expect(subFindFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { providerSubscriptionId: "sub_1" } }));
    expect(paymentCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ clubId: "club-1", subscriptionId: "club-sub-1", amount: 79, currency: "USD", status: "PAID", paymentProvider: "STRIPE", providerRef: "in_1", billingPeriod: "MONTHLY" }),
    });
    const data = subUpdate.mock.calls[0][0].data;
    expect(data).toMatchObject({ status: "ACTIVE", cancelAtPeriodEnd: false, canceledAt: null });
    const days = (data.currentPeriodEnd.getTime() - Date.now()) / DAY;
    expect(days).toBeGreaterThan(29.9); // ~0.2 day left + 1 month
    expect(days).toBeLessThan(31.5);
  });

  it("a YEARLY subscription is extended by a year", async () => {
    subFindFirst.mockResolvedValue(sub({ billingPeriod: "YEARLY" }));
    await deliver("invoice.paid", invoice({ amount_paid: 79000 }));
    const days = (subUpdate.mock.calls[0][0].data.currentPeriodEnd.getTime() - Date.now()) / DAY;
    expect(days).toBeGreaterThan(364);
    expect(days).toBeLessThan(367);
    expect(paymentCreate.mock.calls[0][0].data).toMatchObject({ amount: 790, billingPeriod: "YEARLY" });
  });

  it("the same invoice delivered twice (retry / replay) activates once", async () => {
    paymentFindFirst.mockResolvedValue({ id: "already" });
    const res = await deliver("invoice.paid", invoice());
    expect(res.status).toBe(200);
    expect(paymentCreate).not.toHaveBeenCalled();
    expect(subUpdate).not.toHaveBeenCalled();
  });

  it("serialises concurrent deliveries of one invoice with an advisory lock", async () => {
    await deliver("invoice.paid", invoice());
    expect(executeRaw).toHaveBeenCalled();
  });

  it("ignores the FIRST invoice of a subscription (checkout settles it) and other billing reasons", async () => {
    for (const billing_reason of ["subscription_create", "subscription_update", "manual"]) {
      expect((await deliver("invoice.paid", invoice({ billing_reason }))).status).toBe(200);
    }
    expect(paymentCreate).not.toHaveBeenCalled();
    expect(subUpdate).not.toHaveBeenCalled();
  });

  it("reads the subscription id from either Stripe API shape (top-level or parent.subscription_details)", async () => {
    await deliver("invoice.paid", invoice({ subscription: undefined, parent: { subscription_details: { subscription: "sub_1" } } }));
    expect(paymentCreate).toHaveBeenCalledTimes(1);
    paymentCreate.mockClear();
    await deliver("invoice.paid", invoice({ subscription: { id: "sub_1" } }));
    expect(paymentCreate).toHaveBeenCalledTimes(1);
  });

  it("an invoice for a subscription we do not know is acknowledged and changes nothing", async () => {
    subFindFirst.mockResolvedValue(null);
    expect((await deliver("invoice.paid", invoice())).status).toBe(200);
    expect(paymentCreate).not.toHaveBeenCalled();
  });

  it("a currency that does not match the plan activates nothing (500 → Stripe retries, we alert via logs)", async () => {
    const res = await deliver("invoice.paid", invoice({ currency: "eur" }));
    expect(res.status).toBe(500);
    expect(paymentCreate).not.toHaveBeenCalled();
    expect(subUpdate).not.toHaveBeenCalled();
  });

  it("a late payment re-opens a club that was suspended for lateness — never a banned one", async () => {
    subFindFirst.mockResolvedValue(sub({ status: "PAST_DUE", currentPeriodEnd: new Date(Date.now() - 5 * DAY) }));
    await deliver("invoice.paid", invoice());
    expect(clubUpdateMany).toHaveBeenCalledWith({
      where: { id: "club-1", status: { in: ["TRIAL", "SUSPENDED"] } },
      data: { status: "ACTIVE", suspendedAt: null, suspendedReason: null },
    });
    const days = (subUpdate.mock.calls[0][0].data.currentPeriodEnd.getTime() - Date.now()) / DAY;
    expect(days).toBeGreaterThan(27); // the lapsed period is not "continued": a fresh month from now
    expect(days).toBeLessThan(32);
  });
});

describe("invoice.payment_failed (renewal)", () => {
  it("marks an ACTIVE subscription PAST_DUE (the renewal cron suspends it after its grace)", async () => {
    expect((await deliver("invoice.payment_failed", invoice())).status).toBe(200);
    expect(subUpdateMany).toHaveBeenCalledWith({ where: { id: "club-sub-1", status: "ACTIVE" }, data: { status: "PAST_DUE" } });
    expect(paymentCreate).not.toHaveBeenCalled();
  });
  it("ignores failures of the first invoice (checkout handles those)", async () => {
    await deliver("invoice.payment_failed", invoice({ billing_reason: "subscription_create" }));
    expect(subUpdateMany).not.toHaveBeenCalled();
  });
});

describe("customer.subscription.deleted", () => {
  it("stops renewal but never cuts access early or extends it", async () => {
    expect((await deliver("customer.subscription.deleted", { id: "sub_1" })).status).toBe(200);
    expect(subUpdateMany).toHaveBeenCalledWith({
      where: { providerSubscriptionId: "sub_1" },
      data: { cancelAtPeriodEnd: true, canceledAt: expect.any(Date) },
    });
    const data = subUpdateMany.mock.calls[0][0].data as Record<string, unknown>;
    expect(data.status).toBeUndefined();
    expect(data.currentPeriodEnd).toBeUndefined();
  });
});

describe("signature", () => {
  it("an unsigned / forged event is rejected before anything is read or written", async () => {
    constructEvent.mockImplementation(() => { throw new Error("bad signature"); });
    const { POST } = await import("@/app/api/payments/stripe/webhook/route");
    const res = await POST(new NextRequest("https://yoursaas.test/api/payments/stripe/webhook", { method: "POST", headers: { "stripe-signature": "x" }, body: "{}" }));
    expect(res.status).toBe(400);
    expect(subFindFirst).not.toHaveBeenCalled();
    expect(paymentCreate).not.toHaveBeenCalled();
  });
});
void ({} as Stripe.Event);
