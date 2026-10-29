import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const retrieveSession = vi.fn();
const paymentFindFirst = vi.fn();
const transaction = vi.fn();
const subscriptionUpdateMany = vi.fn();
const clubUpdateMany = vi.fn();
const paymentUpdateMany = vi.fn();
const ownerFindFirst = vi.fn();
const activeClubFindFirst = vi.fn();

vi.mock("@/lib/payments/stripe", () => ({
  getStripe: () => ({ checkout: { sessions: { retrieve: (...args: unknown[]) => retrieveSession(...args) } } }),
  toStripeMinorUnits: (amount: number) => Math.round(amount * 100),
}));

const consumeOnce = vi.fn();
vi.mock("@/lib/one-time", () => ({ consumeOnce: (...args: unknown[]) => consumeOnce(...args) }));

vi.mock("@/lib/auth", () => ({
  generateBridgeToken: () => "bridge-token",
  hashBridgeNonce: () => "nonce-hash",
}));

vi.mock("@/lib/prisma", () => ({
  default: {
    saasPayment: { findFirst: (...args: unknown[]) => paymentFindFirst(...args) },
    user: { findFirst: (...args: unknown[]) => ownerFindFirst(...args) },
    club: { findFirst: (...args: unknown[]) => activeClubFindFirst(...args) },
    $transaction: (...args: unknown[]) => transaction(...args),
  },
}));

const checkoutSession = {
  id: "cs_signup",
  status: "complete",
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
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env.APP_URL = "https://yoursaas.test";
  retrieveSession.mockResolvedValue(checkoutSession);
  consumeOnce.mockResolvedValue(true);
  paymentFindFirst.mockResolvedValue({
    id: "signup-payment",
    subscriptionId: "new-sub",
    clubId: "new-club",
    amount: 29,
    currency: "USD",
    status: "PENDING",
    club: { id: "new-club", slug: "my-gym", name: "My Gym", status: "SUSPENDED" },
    subscription: { id: "new-sub", planId: "starter-plan", status: "SUSPENDED" },
  });
  paymentUpdateMany.mockResolvedValue({ count: 1 });
  subscriptionUpdateMany.mockResolvedValue({ count: 1 });
  clubUpdateMany.mockResolvedValue({ count: 1 });
  transaction.mockImplementation((callback: (tx: unknown) => Promise<unknown>) =>
    callback({
      saasPayment: { updateMany: paymentUpdateMany, findUnique: vi.fn() },
      clubSubscription: { updateMany: subscriptionUpdateMany },
      club: { updateMany: clubUpdateMany },
    })
  );
  ownerFindFirst.mockResolvedValue({
    id: "owner-1", name: "Jean", email: "jean@example.test", role: "OWNER", clubId: "new-club",
  });
  activeClubFindFirst.mockResolvedValue({ id: "new-club", slug: "my-gym", name: "My Gym" });
});

async function complete(sessionId = "cs_signup") {
  const { GET } = await import("@/app/api/onboarding/complete/route");
  return GET(new NextRequest(`https://yoursaas.test/api/onboarding/complete?session_id=${sessionId}`));
}

describe("onboarding Stripe completion", () => {
  it("settles the matching Stripe ledger and hands off the owner session", async () => {
    const response = await complete();

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("https://my-gym.yoursaas.test/api/auth/bridge");
    expect(paymentUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "signup-payment", status: "PENDING", OR: [{ providerRef: "cs_signup" }, { providerRef: null }] },
      data: expect.objectContaining({ status: "PAID", providerRef: "cs_signup" }),
    }));
    expect(subscriptionUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "new-sub", clubId: "new-club", planId: "starter-plan", status: "SUSPENDED" },
    }));
    expect(response.headers.get("set-cookie")).toContain("bridge_nonce=");
  });

  it("an auto-renewing signup stores the Stripe subscription + customer ids so renewals can be matched", async () => {
    retrieveSession.mockResolvedValue({ ...checkoutSession, mode: "subscription", subscription: "sub_signup", customer: "cus_signup" });
    expect((await complete()).status).toBe(307);
    expect(subscriptionUpdateMany.mock.calls[0][0].data).toMatchObject({
      status: "ACTIVE", providerSubscriptionId: "sub_signup", providerCustomerId: "cus_signup", cancelAtPeriodEnd: false,
    });
  });

  it("a one-time signup stores no Stripe subscription ids", async () => {
    expect((await complete()).status).toBe(307);
    const data = subscriptionUpdateMany.mock.calls[0][0].data;
    expect(data.providerSubscriptionId).toBeUndefined();
    expect(data.providerCustomerId).toBeUndefined();
  });

  it("the owner sign-in handoff is single-use: replaying the Stripe session id cannot mint another session", async () => {
    const first = await complete();
    expect(first.status).toBe(307);
    expect(consumeOnce).toHaveBeenCalledWith("signup-handoff:cs_signup", expect.any(Number));

    consumeOnce.mockResolvedValue(false); // already consumed
    const replay = await complete();
    expect(replay.status).toBe(410);
    expect(replay.headers.get("location")).toBeNull();
    expect(replay.headers.get("set-cookie")).toBeNull();
  });

  it("rejects a paid Stripe session whose amount does not match the signup ledger", async () => {
    retrieveSession.mockResolvedValue({ ...checkoutSession, amount_total: 1 });

    const response = await complete();

    expect(response.status).toBe(400);
    expect(transaction).not.toHaveBeenCalled();
    expect(ownerFindFirst).not.toHaveBeenCalled();
  });
});
