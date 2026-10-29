/**
 * New customers can only pick plans that are active AND public (the Starter plan is withdrawn from
 * offers). Existing subscriptions keep working: nothing here deletes or rewrites a subscription.
 */
import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { NextRequest } from "next/server";

const planFindMany = vi.fn();
const planFindFirst = vi.fn();
const userFindFirst = vi.fn();
const clubFindUnique = vi.fn();
const subFindUnique = vi.fn();

vi.mock("@/lib/prisma", () => ({
  default: {
    saasPlan: { findMany: (...a: unknown[]) => planFindMany(...a), findFirst: (...a: unknown[]) => planFindFirst(...a) },
    user: { findFirst: (...a: unknown[]) => userFindFirst(...a) },
    club: { findUnique: (...a: unknown[]) => clubFindUnique(...a) },
    clubSubscription: { findUnique: (...a: unknown[]) => subFindUnique(...a) },
    $transaction: vi.fn(),
  },
}));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 4, resetAt: 0 }),
  getClientIp: () => "127.0.0.1",
}));

beforeAll(() => {
  process.env.JWT_SECRET = "test-secret-minimum-32-chars-xxxxxxxxx";
});
beforeEach(() => {
  vi.clearAllMocks();
  planFindMany.mockResolvedValue([]);
  planFindFirst.mockResolvedValue(null);
});

describe("public plan catalogue", () => {
  it("GET /api/saas-plans lists only active + public plans", async () => {
    const { GET } = await import("@/app/api/saas-plans/route");
    await GET();
    expect(planFindMany.mock.calls[0][0].where).toEqual({ isActive: true, isPublic: true });
  });
});

describe("onboarding cannot pick a withdrawn plan by posting its id", () => {
  it("POST /api/onboarding/create-club looks the plan up with isPublic:true and answers 400 when it is not offered", async () => {
    const { POST } = await import("@/app/api/onboarding/create-club/route");
    const res = await POST(
      new NextRequest("https://yoursaas.test/api/onboarding/create-club", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "Jean Dupont", email: "jean@my-gym.test", password: "Secure123!", clubName: "My Gym", slug: "my-gym",
          planId: "starter-plan-id", verificationToken: "valid-onboarding-verification-token",
        }),
      })
    );
    expect(res.status).toBe(400);
    expect(planFindFirst.mock.calls[0][0].where).toMatchObject({ id: "starter-plan-id", isActive: true, isPublic: true });
    expect(userFindFirst).not.toHaveBeenCalled(); // never got as far as creating anything
  });
});

describe("existing clubs", () => {
  it("findPlanForClub accepts a public plan OR the plan the club is already on, never another hidden plan", async () => {
    const { findPlanForClub } = await import("@/lib/saas-plan-access");
    await findPlanForClub("p-hidden", "p-current");
    const where = planFindFirst.mock.calls[0][0].where;
    expect(where.isActive).toBe(true);
    expect(where.OR).toEqual([{ isPublic: true }, { id: "p-current" }]);
    expect(where.id).toBe("p-hidden");
  });

  it("findPlanForClub without a current plan only allows public plans", async () => {
    const { findPlanForClub } = await import("@/lib/saas-plan-access");
    await findPlanForClub("p-hidden", null);
    expect(planFindFirst.mock.calls[0][0].where.OR).toEqual([{ isPublic: true }]);
  });
});
