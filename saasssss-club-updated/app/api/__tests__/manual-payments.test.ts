import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockOwnerFind = vi.fn();
const mockPlanFind = vi.fn();
const mockPendingFind = vi.fn();
const mockReqCreate = vi.fn();
const mockVerify = vi.fn();

vi.mock("@/lib/prisma", () => ({
  default: {
    user: { findFirst: (...a: unknown[]) => mockOwnerFind(...a) },
    saasPlan: { findFirst: (...a: unknown[]) => mockPlanFind(...a) },
    club: { findUnique: vi.fn().mockResolvedValue({ name: "My Gym", slug: "my-gym" }) },
    manualPaymentRequest: {
      findFirst: (...a: unknown[]) => mockPendingFind(...a),
      create: (...a: unknown[]) => mockReqCreate(...a),
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

const PLAN = { id: "plan1", name: "Pro", priceMonthly: 29, currency: "USD", isActive: true };
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

  it("returns the existing pending request instead of creating a duplicate", async () => {
    mockPendingFind.mockResolvedValue({ id: "r0", amount: 29, currency: "USD", method: "D17", status: "PENDING" });
    const { POST } = await import("@/app/api/billing/reactivate/route");
    const json = await (await POST(req(BODY))).json();
    expect(json.duplicate).toBe(true);
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
