import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const constructEvent = vi.fn();
const paymentFindFirst = vi.fn();
const saasPaymentFindFirst = vi.fn();
const paymentUpdateMany = vi.fn();
const subscriptionUpdateMany = vi.fn();
const saasPaymentUpdateMany = vi.fn();
const clubSubscriptionUpdateMany = vi.fn();
const clubUpdateMany = vi.fn();
const userDeleteMany = vi.fn();
const clubDeleteMany = vi.fn();
const transaction = vi.fn();

vi.mock("@/lib/payments/stripe", () => ({
  getStripe: () => ({ webhooks: { constructEvent: (...args: unknown[]) => constructEvent(...args) } }),
  getStripeWebhookSecret: () => "whsec_test",
  toStripeMinorUnits: (amount: number) => Math.round(amount * 100),
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
  clubUpdateMany.mockResolvedValue({ count: 1 });
  userDeleteMany.mockResolvedValue({ count: 1 });
  clubDeleteMany.mockResolvedValue({ count: 1 });
  transaction.mockImplementation((callback: (tx: unknown) => Promise<unknown>) =>
    callback({
      payment: { updateMany: paymentUpdateMany },
      subscription: { updateMany: subscriptionUpdateMany },
      saasPayment: { updateMany: saasPaymentUpdateMany },
      clubSubscription: { updateMany: clubSubscriptionUpdateMany },
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
