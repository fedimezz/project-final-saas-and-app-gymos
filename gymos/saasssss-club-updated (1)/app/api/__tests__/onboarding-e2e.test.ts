/**
 * Phase 11 — Onboarding E2E test
 * Full POST /api/onboarding/create-club flow.
 *
 * Run: npx vitest run app/api/__tests__/onboarding-e2e.test.ts
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 4, resetAt: 0 }),
  getClientIp:    vi.fn().mockReturnValue("127.0.0.1"),
}));
vi.mock("@/lib/bcrypt", () => ({
  hashPassword: vi.fn().mockResolvedValue("hashed-pw"),
}));

// Keep generateToken real, mock buildAuthCookieOptions so it returns something benign
vi.mock("@/lib/auth", async (orig) => {
  const real = await orig<typeof import("@/lib/auth")>();
  return {
    ...real,
    buildAuthCookieOptions: vi.fn().mockReturnValue({ httpOnly: true, path: "/", secure: false }),
  };
});

const mockPlanFindFirst  = vi.fn();
const mockClubFindUnique = vi.fn();
const mockUserFindFirst  = vi.fn();
const mockTx             = vi.fn();
const mockClubCreate = vi.fn();
const mockSubscriptionCreate = vi.fn();
const mockSaasPaymentCreate = vi.fn();
const mockSaasPaymentUpdate = vi.fn();
const mockVerificationConsume = vi.fn();
const mockStripeCheckout = vi.fn();

vi.mock("@/lib/prisma", () => ({
  default: {
    saasPlan: { findFirst:  (...a: unknown[]) => mockPlanFindFirst(...a) },
    club:     { findUnique: (...a: unknown[]) => mockClubFindUnique(...a) },
    user:     { findFirst:  (...a: unknown[]) => mockUserFindFirst(...a) },
    saasPayment: { update: (...a: unknown[]) => mockSaasPaymentUpdate(...a) },
    $transaction: (...a: unknown[]) => mockTx(...a),
  },
}));
vi.mock("@/lib/payments/stripe", () => ({
  createStripeCheckoutSession: (...args: unknown[]) => mockStripeCheckout(...args),
  getStripe: () => ({ checkout: { sessions: { expire: vi.fn() } } }),
  toStripeMinorUnits: (amount: number) => Math.round(amount * 100),
}));

beforeAll(() => {
  process.env.JWT_SECRET = "test-secret-minimum-32-chars-xxxxxxxxx";
  process.env.APP_URL    = "https://yoursaas.test";
});

const VALID_PLAN  = { id: "plan-pro-id", tier: "PRO", name: "Pro", priceMonthly: 29, currency: "USD", isActive: true };
const NEW_CLUB    = { id: "new-club-id", slug: "my-gym", name: "My Gym" };
const NEW_OWNER   = { id: "new-owner-id", name: "Jean", email: "jean@my-gym.test", role: "OWNER", clubId: NEW_CLUB.id };

const VALID_BODY = {
  name: "Jean Dupont", email: "jean@my-gym.test", password: "Secure123!",
  clubName: "My Gym", slug: "my-gym", planId: VALID_PLAN.id, countryCode: "US",
  verificationToken: "valid-onboarding-verification-token",
};

function makeReq(body: unknown): NextRequest {
  return new NextRequest("https://yoursaas.test/api/onboarding/create-club", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockClubCreate.mockResolvedValue(NEW_CLUB);
  mockSubscriptionCreate.mockResolvedValue({});
  mockSaasPaymentCreate.mockImplementation(async ({ data }: { data: { amount: number; currency: string } }) => ({
    id: "signup-payment", ...data,
  }));
  mockSaasPaymentUpdate.mockResolvedValue({});
  mockVerificationConsume.mockResolvedValue({ count: 1 });
  mockStripeCheckout.mockResolvedValue({ id: "cs_signup_test", url: "https://checkout.stripe.com/signup" });
  mockTx.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
    fn({
      onboardingEmailVerification: { updateMany: (...args: unknown[]) => mockVerificationConsume(...args) },
      club:             { create: (...args: unknown[]) => mockClubCreate(...args) },
      user:             { create: vi.fn().mockResolvedValue(NEW_OWNER) },
      clubSubscription: { create: (...args: unknown[]) => mockSubscriptionCreate(...args) },
      gymSettings:      { create: vi.fn().mockResolvedValue({}) },
      saasPayment:      { create: (...args: unknown[]) => mockSaasPaymentCreate(...args) },
    })
  );
});

describe("POST /api/onboarding/create-club", () => {
  it("creates a suspended paid club and returns Stripe checkout without auth cookies", async () => {
    mockPlanFindFirst.mockResolvedValue(VALID_PLAN);
    mockClubFindUnique.mockResolvedValue(null);
    mockUserFindFirst.mockResolvedValue(null);

    const { POST } = await import("@/app/api/onboarding/create-club/route");
    const res  = await POST(makeReq(VALID_BODY));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.club.slug).toBe("my-gym");
    expect(json.pendingPayment).toBe(true);
    expect(json.paymentUrl).toBe("https://checkout.stripe.com/signup");
    expect(json.bridgeToken).toBeUndefined();
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(mockClubCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ status: "SUSPENDED" }) });
    expect(mockVerificationConsume).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ email: VALID_BODY.email, consumedAt: null }),
      data: expect.objectContaining({ consumedAt: expect.any(Date) }),
    }));
    expect(mockSubscriptionCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ status: "SUSPENDED", currentPeriodEnd: null }) });
    expect(mockSaasPaymentCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ status: "PENDING", amount: 29, currency: "USD" }) });
    expect(mockStripeCheckout).toHaveBeenCalledWith(expect.objectContaining({
      amount: 29,
      currency: "USD",
      metadata: expect.objectContaining({ kind: "SAAS_SIGNUP" }),
    }));
    // Transaction ran exactly once (atomic club+user+sub+settings)
    expect(mockTx).toHaveBeenCalledTimes(1);
  });

  it("rejects a signup when the verified email proof is missing or already consumed", async () => {
    mockPlanFindFirst.mockResolvedValue(VALID_PLAN);
    mockClubFindUnique.mockResolvedValue(null);
    mockUserFindFirst.mockResolvedValue(null);
    mockVerificationConsume.mockResolvedValue({ count: 0 });

    const { POST } = await import("@/app/api/onboarding/create-club/route");
    const response = await POST(makeReq(VALID_BODY));
    const json = await response.json();

    expect(response.status).toBe(403);
    expect(json.field).toBe("email");
    expect(mockClubCreate).not.toHaveBeenCalled();
    expect(mockStripeCheckout).not.toHaveBeenCalled();
  });

  it("409 when slug is already taken", async () => {
    mockPlanFindFirst.mockResolvedValue(VALID_PLAN);
    mockClubFindUnique.mockResolvedValue({ id: "existing-club" });
    mockUserFindFirst.mockResolvedValue(null);

    const { POST } = await import("@/app/api/onboarding/create-club/route");
    const res  = await POST(makeReq(VALID_BODY));
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.field).toBe("slug");
    expect(mockTx).not.toHaveBeenCalled();
  });

  it("409 when email is already registered", async () => {
    mockPlanFindFirst.mockResolvedValue(VALID_PLAN);
    mockClubFindUnique.mockResolvedValue(null);
    mockUserFindFirst.mockResolvedValue({ id: "existing-user" });

    const { POST } = await import("@/app/api/onboarding/create-club/route");
    const res  = await POST(makeReq(VALID_BODY));
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.field).toBe("email");
    expect(mockTx).not.toHaveBeenCalled();
  });

  it("400 when planId is invalid / inactive", async () => {
    mockPlanFindFirst.mockResolvedValue(null);
    mockClubFindUnique.mockResolvedValue(null);
    mockUserFindFirst.mockResolvedValue(null);

    const { POST } = await import("@/app/api/onboarding/create-club/route");
    const res  = await POST(makeReq(VALID_BODY));
    expect(res.status).toBe(400);
  });

  it("does not create a paid Tunisia club when Stripe signup checkout is unavailable", async () => {
    mockPlanFindFirst.mockResolvedValue({ ...VALID_PLAN, priceMonthly: 29 });

    const { POST } = await import("@/app/api/onboarding/create-club/route");
    const res = await POST(makeReq({ ...VALID_BODY, countryCode: "TN" }));

    expect(res.status).toBe(400);
    expect(mockTx).not.toHaveBeenCalled();
    expect(mockStripeCheckout).not.toHaveBeenCalled();
  });

  it("does not allow a free plan to bypass immediate signup payment", async () => {
    mockPlanFindFirst.mockResolvedValue({ ...VALID_PLAN, priceMonthly: 0 });

    const { POST } = await import("@/app/api/onboarding/create-club/route");
    const res = await POST(makeReq(VALID_BODY));

    expect(res.status).toBe(400);
    expect(mockTx).not.toHaveBeenCalled();
    expect(mockStripeCheckout).not.toHaveBeenCalled();
  });

  it("400 when slug contains uppercase letters", async () => {
    const { POST } = await import("@/app/api/onboarding/create-club/route");
    const res = await POST(makeReq({ ...VALID_BODY, slug: "My-Gym" }));
    expect(res.status).toBe(400);
  });

  it("400 when slug starts with a hyphen", async () => {
    const { POST } = await import("@/app/api/onboarding/create-club/route");
    const res = await POST(makeReq({ ...VALID_BODY, slug: "-mygym" }));
    expect(res.status).toBe(400);
  });

  it("400 when password is too short", async () => {
    const { POST } = await import("@/app/api/onboarding/create-club/route");
    const res = await POST(makeReq({ ...VALID_BODY, password: "short" }));
    expect(res.status).toBe(400);
  });

  it("429 when rate limit is exceeded", async () => {
    const { checkRateLimit } = await import("@/lib/rate-limit");
    vi.mocked(checkRateLimit).mockResolvedValueOnce({ allowed: false, remaining: 0, resetAt: Date.now() + 3600000 });

    const { POST } = await import("@/app/api/onboarding/create-club/route");
    const res = await POST(makeReq(VALID_BODY));
    expect(res.status).toBe(429);
  });
});
