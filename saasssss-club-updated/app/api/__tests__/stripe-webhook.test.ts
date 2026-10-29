import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const constructEvent = vi.fn();
const paymentFindFirst = vi.fn();
const saasPaymentFindFirst = vi.fn();
const paymentUpdateMany = vi.fn();
const subscriptionUpdateMany = vi.fn();
const saasPaymentUpdateMany = vi.fn();
const clubSubscriptionUpdateMany = vi.fn();
const clubSubscriptionFindUnique = vi.fn();
const cancelStripeSubscription = vi.fn();
const clubUpdateMany = vi.fn();
const userDeleteMany = vi.fn();
const clubDeleteMany = vi.fn();
const transaction = vi.fn();

vi.mock("@/lib/payments/stripe", () => ({
  getStripe: () => ({ webhooks: { constructEvent: (...args: unknown[]) => constructEvent(...args) } }),
  getStripeWebhookSecret: () => "whsec_test",
  toStripeMinorUnits: (amount: number) => Math.round(amount * 100),
  fromStripeMinorUnits: (minor: number) => minor / 100,
  cancelStripeSubscription: (...args: unknown[]) => cancelStripeSubscription(...args),
}));

vi.mock("@/lib/prisma", () => ({
  default: {
    payment: {
      findFirst: (...args: unknown[]) => paymentFindFirst(...args),
      updateMany: (...args: unknown[]) => paymentUpdateMany(...args),
    },
    saasPayment: { findFirst: (...args: unknown[]) => saasPaymentFindFirst(...args) },
    $transaction: (...args: unknown[]) => transaction(...args),
  },
}));

const memberSession = {
  id: "cs_member",
  payment_status: "paid",
  amount_total: 1200,
  currency: "usd",
  client_reference_id: "pay-1",
  metadata: {
    kind: "MEMBER_SUBSCRIPTION",
    paymentId: "pay-1",
    subscriptionId: "sub-1",
    clubId: "club-1",
    userId: "user-1",
    planId: "plan-1",
    countryCode: "US",
  },
};

const memberPayment = {
  id: "pay-1",
  subscriptionId: "sub-1",
  clubId: "club-1",
  amount: 12,
  currency: "USD",
  status: "PENDING",
  paymentProvider: "STRIPE",
  countryCode: "US",
  transactionId: "cs_member",
  subscription: { userId: "user-1", planId: "plan-1" },
};

beforeEach(() => {
  vi.clearAllMocks();
  constructEvent.mockReturnValue({
    type: "checkout.session.completed",
    data: { object: memberSession },
  });
  paymentFindFirst.mockResolvedValue(memberPayment);
  saasPaymentFindFirst.mockResolvedValue(null);
  paymentUpdateMany.mockResolvedValue({ count: 1 });
  subscriptionUpdateMany.mockResolvedValue({ count: 1 });
  saasPaymentUpdateMany.mockResolvedValue({ count: 1 });
  clubSubscriptionUpdateMany.mockResolvedValue({ count: 1 });
  clubSubscriptionFindUnique.mockResolvedValue(null); // no running paid period unless a test says so
  clubUpdateMany.mockResolvedValue({ count: 1 });
  userDeleteMany.mockResolvedValue({ count: 1 });
  clubDeleteMany.mockResolvedValue({ count: 1 });
  transaction.mockImplementation((callback: (tx: unknown) => Promise<unknown>) =>
    callback({
      payment: { updateMany: paymentUpdateMany },
      subscription: { updateMany: subscriptionUpdateMany },
      saasPayment: { updateMany: saasPaymentUpdateMany },
      clubSubscription: { updateMany: clubSubscriptionUpdateMany, findUnique: clubSubscriptionFindUnique },
      club: { updateMany: clubUpdateMany, deleteMany: clubDeleteMany },
      user: { deleteMany: userDeleteMany },
    })
  );
});

function makeRequest(signature = "t=timestamp,v1=signature") {
  return new NextRequest("https://gym.example/api/payments/stripe/webhook", {
    method: "POST",
    headers: { "stripe-signature": signature, "content-type": "application/json" },
    body: '{"raw":"payload"}',
  });
}

async function call(request = makeRequest()) {
  const { POST } = await import("@/app/api/payments/stripe/webhook/route");
  return POST(request);
}

describe("Stripe webhook settlement", () => {
  it("verifies the raw body and activates a matching pending member payment", async () => {
    const response = await call();
    expect(response.status).toBe(200);
    expect(constructEvent).toHaveBeenCalledWith('{"raw":"payload"}', "t=timestamp,v1=signature", "whsec_test");
    expect(paymentUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "pay-1", clubId: "club-1", status: "PENDING", transactionId: "cs_member" },
      data: expect.objectContaining({ status: "PAID" }),
    }));
    expect(subscriptionUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "sub-1", clubId: "club-1", userId: "user-1", planId: "plan-1", status: "PENDING" },
      data: { status: "ACTIVE" },
    }));
  });

  it("rejects a session whose amount differs from the stored ledger row", async () => {
    constructEvent.mockReturnValue({
      type: "checkout.session.completed",
      data: { object: { ...memberSession, amount_total: 1 } },
    });
    const response = await call();
    expect(response.status).toBe(400);
    expect(transaction).not.toHaveBeenCalled();
  });

  it("waits for asynchronous payment settlement instead of activating an unpaid checkout", async () => {
    constructEvent.mockReturnValue({
      type: "checkout.session.completed",
      data: { object: { ...memberSession, payment_status: "unpaid" } },
    });
    const response = await call();
    expect(response.status).toBe(200);
    expect(transaction).not.toHaveBeenCalled();
  });

  it("marks a failed asynchronous member checkout failed without activating it", async () => {
    constructEvent.mockReturnValue({
      type: "checkout.session.async_payment_failed",
      data: { object: memberSession },
    });
    const response = await call();
    expect(response.status).toBe(200);
    expect(paymentUpdateMany).toHaveBeenCalledWith({
      where: {
        id: "pay-1",
        subscriptionId: "sub-1",
        clubId: "club-1",
        transactionId: "cs_member",
        paymentProvider: "STRIPE",
        status: "PENDING",
      },
      data: { status: "FAILED" },
    });
    expect(transaction).not.toHaveBeenCalled();
  });

  it("settles a matching SaaS plan payment and activates the club subscription", async () => {
    constructEvent.mockReturnValue({
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_saas",
          payment_status: "paid",
          amount_total: 4900,
          currency: "usd",
          client_reference_id: "saas-pay-1",
          metadata: {
            kind: "SAAS_PLAN",
            saasPaymentId: "saas-pay-1",
            subscriptionId: "club-sub-1",
            clubId: "club-1",
            planId: "saas-plan-2",
            countryCode: "US",
          },
        },
      },
    });
    saasPaymentFindFirst.mockResolvedValue({
      id: "saas-pay-1",
      subscriptionId: "club-sub-1",
      clubId: "club-1",
      amount: 49,
      currency: "USD",
      status: "PENDING",
      providerRef: "cs_saas",
      paymentProvider: "STRIPE",
      countryCode: "US",
    });

    const response = await call();
    expect(response.status).toBe(200);
    expect(saasPaymentUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "saas-pay-1", clubId: "club-1", status: "PENDING", OR: [{ providerRef: "cs_saas" }, { providerRef: null }] },
      data: expect.objectContaining({ status: "PAID", providerRef: "cs_saas" }),
    }));

    expect(clubSubscriptionUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "club-sub-1", clubId: "club-1" },
      data: expect.objectContaining({ planId: "saas-plan-2", status: "ACTIVE", trialEndsAt: null }),
    }));
  });

  it("activates a suspended new club only after the signed signup checkout is paid", async () => {
    constructEvent.mockReturnValue({
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_signup",
          payment_status: "paid",
          amount_total: 2900,
          currency: "usd",
          client_reference_id: "signup-payment",
          metadata: {
            kind: "SAAS_SIGNUP",
            saasPaymentId: "signup-payment",
            subscriptionId: "new-sub",
            clubId: "new-club",
            planId: "starter-plan",
            countryCode: "US",
            ownerId: "owner-1",
          },
        },
      },
    });
    saasPaymentFindFirst.mockResolvedValue({
      id: "signup-payment",
      subscriptionId: "new-sub",
      clubId: "new-club",
      amount: 29,
      currency: "USD",
      status: "PENDING",
      providerRef: "cs_signup",
      paymentProvider: "STRIPE",
      countryCode: "US",
    });

    const response = await call();
    expect(response.status).toBe(200);
    expect(clubSubscriptionUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "new-sub", clubId: "new-club" },
      data: expect.objectContaining({ status: "ACTIVE", planId: "starter-plan", trialEndsAt: null }),
    }));
    expect(clubUpdateMany).toHaveBeenCalledWith({
      where: { id: "new-club", status: { in: ["TRIAL", "SUSPENDED"] } },
      data: { status: "ACTIVE" },
    });
  });

  it("removes an unpaid suspended signup when its Stripe checkout expires", async () => {
    constructEvent.mockReturnValue({
      type: "checkout.session.expired",
      data: {
        object: {
          id: "cs_signup_expired",
          payment_status: "unpaid",
          metadata: {
            kind: "SAAS_SIGNUP",
            saasPaymentId: "signup-payment",
            subscriptionId: "new-sub",
            clubId: "new-club",
            ownerId: "owner-1",
          },
        },
      },
    });

    const response = await call();
    expect(response.status).toBe(200);
    expect(userDeleteMany).toHaveBeenCalledWith({
      where: { id: "owner-1", clubId: "new-club", role: "OWNER" },
    });
    expect(clubDeleteMany).toHaveBeenCalledWith({
      where: { id: "new-club", status: "SUSPENDED" },
    });
  });

  it("rejects unsigned webhook requests before parsing or looking up payment data", async () => {
    const response = await call(makeRequest(""));
    expect(response.status).toBe(400);
    expect(constructEvent).not.toHaveBeenCalled();
    expect(paymentFindFirst).not.toHaveBeenCalled();
  });

  it("does not settle when Stripe signature verification fails", async () => {
    constructEvent.mockImplementation(() => { throw new Error("bad signature"); });
    const response = await call();
    expect(response.status).toBe(400);
    expect(paymentFindFirst).not.toHaveBeenCalled();
  });
});

describe("Stripe webhook — monthly / yearly SaaS periods", () => {
  const saasSession = (billingPeriod?: string) => ({
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_saas",
        payment_status: "paid",
        amount_total: 49000,
        currency: "usd",
        client_reference_id: "saas-pay-1",
        metadata: {
          kind: "SAAS_PLAN",
          saasPaymentId: "saas-pay-1",
          subscriptionId: "club-sub-1",
          clubId: "club-1",
          planId: "saas-plan-2",
          countryCode: "US",
          ...(billingPeriod ? { billingPeriod } : {}),
        },
      },
    },
  });
  const ledger = (billingPeriod: string) => ({
    id: "saas-pay-1", subscriptionId: "club-sub-1", clubId: "club-1", amount: 490, currency: "USD",
    status: "PENDING", providerRef: "cs_saas", paymentProvider: "STRIPE", countryCode: "US", billingPeriod,
  });

  it("a verified YEARLY payment activates the subscription for one year and stores the period", async () => {
    constructEvent.mockReturnValue(saasSession("YEARLY"));
    saasPaymentFindFirst.mockResolvedValue(ledger("YEARLY"));
    const before = Date.now();
    const response = await call();
    expect(response.status).toBe(200);
    const data = clubSubscriptionUpdateMany.mock.calls[0][0].data;
    expect(data).toMatchObject({ planId: "saas-plan-2", status: "ACTIVE", billingPeriod: "YEARLY", trialEndsAt: null });
    const days = (data.currentPeriodEnd.getTime() - before) / 86_400_000;
    expect(days).toBeGreaterThan(364);
    expect(days).toBeLessThan(367);
  });

  it("a verified MONTHLY payment activates it for one month", async () => {
    constructEvent.mockReturnValue(saasSession("MONTHLY"));
    saasPaymentFindFirst.mockResolvedValue({ ...ledger("MONTHLY"), amount: 490 });
    await call();
    const data = clubSubscriptionUpdateMany.mock.calls[0][0].data;
    expect(data.billingPeriod).toBe("MONTHLY");
    const days = (data.currentPeriodEnd.getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(27);
    expect(days).toBeLessThan(32);
  });

  it("does not trust event metadata over the ledger: a period mismatch activates nothing", async () => {
    constructEvent.mockReturnValue(saasSession("YEARLY")); // metadata says YEARLY …
    saasPaymentFindFirst.mockResolvedValue(ledger("MONTHLY")); // … our own record says MONTHLY
    const response = await call();
    expect(response.status).toBe(400);
    expect(transaction).not.toHaveBeenCalled();
    expect(clubSubscriptionUpdateMany).not.toHaveBeenCalled();
  });

  it("an unsigned / badly signed event activates nothing", async () => {
    constructEvent.mockImplementation(() => { throw new Error("bad signature"); });
    const response = await call();
    expect(response.status).toBe(400);
    expect(transaction).not.toHaveBeenCalled();
  });

  it("a replayed event for an already PAID ledger row does not activate a second time", async () => {
    constructEvent.mockReturnValue(saasSession("YEARLY"));
    saasPaymentFindFirst.mockResolvedValue({ ...ledger("YEARLY"), status: "PAID" });
    const response = await call();
    expect(response.status).toBe(200);
    expect(clubSubscriptionUpdateMany).not.toHaveBeenCalled();
  });

  it("renewing the SAME plan early continues from the end of the running period (no paid day lost)", async () => {
    constructEvent.mockReturnValue(saasSession("MONTHLY"));
    saasPaymentFindFirst.mockResolvedValue(ledger("MONTHLY"));
    const runningEnd = new Date(Date.now() + 10 * 86_400_000); // 10 days left
    clubSubscriptionFindUnique.mockResolvedValue({ planId: "saas-plan-2", status: "ACTIVE", currentPeriodEnd: runningEnd });
    await call();
    const data = clubSubscriptionUpdateMany.mock.calls[0][0].data;
    const days = (data.currentPeriodEnd.getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(36); // ~10 left + ~1 month
    expect(days).toBeLessThan(42);
  });

  it("a plan CHANGE, an expired period or a trial start the new period now (no leftover days carried over)", async () => {
    constructEvent.mockReturnValue(saasSession("MONTHLY"));
    saasPaymentFindFirst.mockResolvedValue(ledger("MONTHLY"));
    for (const existing of [
      { planId: "other-plan", status: "ACTIVE", currentPeriodEnd: new Date(Date.now() + 10 * 86_400_000) },
      { planId: "saas-plan-2", status: "ACTIVE", currentPeriodEnd: new Date(Date.now() - 2 * 86_400_000) },
      { planId: "saas-plan-2", status: "TRIALING", currentPeriodEnd: new Date(Date.now() + 5 * 86_400_000) },
    ]) {
      clubSubscriptionUpdateMany.mockClear();
      clubSubscriptionFindUnique.mockResolvedValue(existing);
      await call();
      const days = (clubSubscriptionUpdateMany.mock.calls[0][0].data.currentPeriodEnd.getTime() - Date.now()) / 86_400_000;
      expect(days).toBeGreaterThan(27);
      expect(days).toBeLessThan(32);
    }
  });
});

describe("Stripe webhook — auto-renewing subscription checkout", () => {
  const subSession = (over: Record<string, unknown> = {}) => ({
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_sub", mode: "subscription", subscription: "sub_new", customer: "cus_1",
        payment_status: "paid", amount_total: 49000, currency: "usd", client_reference_id: "saas-pay-1",
        metadata: { kind: "SAAS_PLAN", saasPaymentId: "saas-pay-1", subscriptionId: "club-sub-1", clubId: "club-1", planId: "saas-plan-2", countryCode: "US", billingPeriod: "YEARLY", recurring: "true" },
        ...over,
      },
    },
  });
  const ledger = { id: "saas-pay-1", subscriptionId: "club-sub-1", clubId: "club-1", amount: 490, currency: "USD", status: "PENDING", providerRef: "cs_sub", paymentProvider: "STRIPE", countryCode: "US", billingPeriod: "YEARLY" };

  it("stores the Stripe subscription + customer ids and clears any cancellation", async () => {
    constructEvent.mockReturnValue(subSession());
    saasPaymentFindFirst.mockResolvedValue(ledger);
    expect((await call()).status).toBe(200);
    expect(clubSubscriptionUpdateMany.mock.calls[0][0].data).toMatchObject({
      status: "ACTIVE", billingPeriod: "YEARLY", providerSubscriptionId: "sub_new", providerCustomerId: "cus_1", cancelAtPeriodEnd: false,
    });
  });

  it("a one-time payment never writes Stripe subscription ids", async () => {
    constructEvent.mockReturnValue(subSession({ mode: "payment", subscription: null, customer: null }));
    saasPaymentFindFirst.mockResolvedValue(ledger);
    await call();
    const data = clubSubscriptionUpdateMany.mock.calls[0][0].data;
    expect(data.providerSubscriptionId).toBeUndefined();
    expect(data.providerCustomerId).toBeUndefined();
  });

  it("switching to a new subscription cancels the previous Stripe one (no double billing) and starts the period now", async () => {
    constructEvent.mockReturnValue(subSession());
    saasPaymentFindFirst.mockResolvedValue(ledger);
    clubSubscriptionFindUnique.mockResolvedValue({ planId: "saas-plan-2", status: "ACTIVE", currentPeriodEnd: new Date(Date.now() + 10 * 86_400_000), providerSubscriptionId: "sub_old" });
    cancelStripeSubscription.mockResolvedValue(undefined);
    await call();
    expect(cancelStripeSubscription).toHaveBeenCalledWith("sub_old");
    const days = (clubSubscriptionUpdateMany.mock.calls[0][0].data.currentPeriodEnd.getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(364); // a fresh year, no carried-over days
    expect(days).toBeLessThan(367);
  });

  it("a failure to cancel the old subscription is logged but never fails the settled payment", async () => {
    constructEvent.mockReturnValue(subSession());
    saasPaymentFindFirst.mockResolvedValue(ledger);
    clubSubscriptionFindUnique.mockResolvedValue({ planId: "x", status: "ACTIVE", currentPeriodEnd: null, providerSubscriptionId: "sub_old" });
    cancelStripeSubscription.mockRejectedValue(new Error("stripe down"));
    expect((await call()).status).toBe(200);
  });

  it("does not cancel anything when the same subscription id is delivered again", async () => {
    constructEvent.mockReturnValue(subSession());
    saasPaymentFindFirst.mockResolvedValue(ledger);
    clubSubscriptionFindUnique.mockResolvedValue({ planId: "x", status: "ACTIVE", currentPeriodEnd: null, providerSubscriptionId: "sub_new" });
    await call();
    expect(cancelStripeSubscription).not.toHaveBeenCalled();
  });
});
