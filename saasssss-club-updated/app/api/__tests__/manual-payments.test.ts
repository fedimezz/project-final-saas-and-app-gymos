import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockOwnerFind = vi.fn();
const mockPlanFind = vi.fn();
const mockPendingFind = vi.fn();
const mockReqCreate = vi.fn();
const mockReqUpdate = vi.fn();
const mockVerify = vi.fn();

vi.mock("@/lib/prisma", () => ({
  default: {
    user: { findFirst: (...a: unknown[]) => mockOwnerFind(...a) },
    saasPlan: { findFirst: (...a: unknown[]) => mockPlanFind(...a) },
    club: { findUnique: vi.fn().mockResolvedValue({ name: "My Gym", slug: "my-gym" }) },
    clubSubscription: { findUnique: vi.fn().mockResolvedValue({ planId: "plan1" }) },
    manualPaymentRequest: {
      findFirst: (...a: unknown[]) => mockPendingFind(...a),
      create: (...a: unknown[]) => mockReqCreate(...a),
      update: (...a: unknown[]) => mockReqUpdate(...a),
    },
  },
}));
vi.mock("@/lib/bcrypt", () => ({
  verifyPassword: (...a: unknown[]) => mockVerify(...a),
  dummyPasswordCheck: vi.fn().mockResolvedValue(false),
}));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 5, resetAt: 0 }),
  getClientIp: () => "1.2.3.4",
}));
vi.mock("@/lib/email", () => ({ sendEmail: vi.fn().mockResolvedValue(undefined), escapeHtml: (s: string) => s }));

const PLAN = { id: "plan1", name: "Pro", priceMonthly: 29, priceYearly: 290, currency: "USD", isActive: true };
const OWNER = { id: "u1", email: "o@gym.test", password: "hash", clubId: "c1", club: { id: "c1", slug: "my-gym", status: "SUSPENDED" } };
const BODY = {
  email: "o@gym.test", password: "pw", planId: "plan1", countryCode: "TN", payWith: "MANUAL",
  method: "D17", contactPhone: "+21620123456", note: "",
};

function req(body: unknown) {
  return new NextRequest("https://yoursaas.test/api/billing/reactivate", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://yoursaas.test", host: "yoursaas.test" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.APP_URL = "https://yoursaas.test";
  mockOwnerFind.mockResolvedValue(OWNER);
  mockVerify.mockResolvedValue(true);
  mockPlanFind.mockResolvedValue(PLAN);
  mockPendingFind.mockResolvedValue(null);
  mockReqCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "r1", status: "PENDING", ...data }));
});

describe("POST /api/billing/reactivate (manual payment for an expired trial)", () => {
  it("files a PENDING manual request for the suspended club's owner", async () => {
    const { POST } = await import("@/app/api/billing/reactivate/route");
    const res = await POST(req(BODY));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.manual).toBe(true);
    expect(mockReqCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ clubId: "c1", planId: "plan1", method: "D17", amount: 29 }) });
  });

  it("refuses to reactivate a club the PLATFORM suspended (abuse etc.): paying is not a way out", async () => {
    mockOwnerFind.mockResolvedValue({ ...OWNER, club: { ...OWNER.club, suspendedReason: "Fraud investigation" } });
    const { POST } = await import("@/app/api/billing/reactivate/route");
    const res = await POST(req(BODY));
    expect(res.status).toBe(403);
    expect(mockReqCreate).not.toHaveBeenCalled();
  });

  it("still lets a club that lapsed on its own (trial expired / payment past due) reactivate", async () => {
    mockOwnerFind.mockResolvedValue({ ...OWNER, club: { ...OWNER.club, suspendedReason: "Trial expired" } });
    const { POST } = await import("@/app/api/billing/reactivate/route");
    expect((await POST(req(BODY))).status).toBe(200);
  });

  it("a club created through 'pay without card' (awaiting approval) can update its request from /reactivate", async () => {
    mockOwnerFind.mockResolvedValue({ ...OWNER, club: { ...OWNER.club, suspendedReason: "Awaiting manual payment" } });
    const { POST } = await import("@/app/api/billing/reactivate/route");
    expect((await POST(req(BODY))).status).toBe(200);
  });

  it("only offers plans that are public (or the club's current plan): the lookup is filtered server-side", async () => {
    const { POST } = await import("@/app/api/billing/reactivate/route");
    await POST(req(BODY));
    const where = mockPlanFind.mock.calls[0][0].where;
    expect(where).toMatchObject({ id: "plan1", isActive: true });
    expect(where.OR).toEqual(expect.arrayContaining([{ isPublic: true }, { id: "plan1" }]));
  });

  it("401 with the generic message on a wrong password, and files nothing", async () => {
    mockVerify.mockResolvedValue(false);
    const { POST } = await import("@/app/api/billing/reactivate/route");
    const res = await POST(req(BODY));
    expect(res.status).toBe(401);
    expect(mockReqCreate).not.toHaveBeenCalled();
  });

  it("401 when the email is not an owner (no account enumeration)", async () => {
    mockOwnerFind.mockResolvedValue(null);
    const { POST } = await import("@/app/api/billing/reactivate/route");
    const res = await POST(req(BODY));
    expect(res.status).toBe(401);
  });

  it("never creates a second open request: a still-PENDING one is updated with the latest choice", async () => {
    mockPendingFind.mockResolvedValue({ id: "r0", amount: 29, currency: "USD", method: "D17", status: "PENDING", billingPeriod: "MONTHLY" });
    mockReqUpdate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "r0", status: "PENDING", currency: "USD", method: "D17", ...data }));
    const { POST } = await import("@/app/api/billing/reactivate/route");
    const json = await (await POST(req({ ...BODY, billingPeriod: "YEARLY" }))).json();
    expect(json.duplicate).toBe(true);
    expect(mockReqCreate).not.toHaveBeenCalled();
    expect(mockReqUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "r0", clubId: "c1", status: "PENDING" },
      data: expect.objectContaining({ billingPeriod: "YEARLY", amount: 290 }),
    }));
  });

  it("leaves an APPROVED request untouched (the team is waiting for the payment)", async () => {
    mockPendingFind.mockResolvedValue({ id: "r0", amount: 29, currency: "USD", method: "D17", status: "APPROVED", billingPeriod: "MONTHLY" });
    const { POST } = await import("@/app/api/billing/reactivate/route");
    const json = await (await POST(req({ ...BODY, billingPeriod: "YEARLY" }))).json();
    expect(json.duplicate).toBe(true);
    expect(mockReqUpdate).not.toHaveBeenCalled();
    expect(mockReqCreate).not.toHaveBeenCalled();
  });

  it("records the selected billing period and a server-computed amount (monthly by default, yearly on request)", async () => {
    const { POST } = await import("@/app/api/billing/reactivate/route");
    await POST(req(BODY));
    expect(mockReqCreate).toHaveBeenLastCalledWith({ data: expect.objectContaining({ billingPeriod: "MONTHLY", amount: 29 }) });
    // the client-sent amount is ignored
    await POST(req({ ...BODY, billingPeriod: "YEARLY", amount: 1 }));
    expect(mockReqCreate).toHaveBeenLastCalledWith({ data: expect.objectContaining({ billingPeriod: "YEARLY", amount: 290 }) });
  });

  it("refuses a yearly request for a plan without a yearly price", async () => {
    mockPlanFind.mockResolvedValue({ ...PLAN, priceYearly: null });
    const { POST } = await import("@/app/api/billing/reactivate/route");
    const res = await POST(req({ ...BODY, billingPeriod: "YEARLY" }));
    expect(res.status).toBe(400);
    expect(mockReqCreate).not.toHaveBeenCalled();
  });

  it("refuses card payment from Tunisia", async () => {
    const { POST } = await import("@/app/api/billing/reactivate/route");
    const res = await POST(req({ ...BODY, payWith: "STRIPE" }));
    expect(res.status).toBe(409);
  });

  it("refuses a cancelled club", async () => {
    mockOwnerFind.mockResolvedValue({ ...OWNER, club: { ...OWNER.club, status: "CANCELLED" } });
    const { POST } = await import("@/app/api/billing/reactivate/route");
    const res = await POST(req(BODY));
    expect(res.status).toBe(403);
  });
});
