/**
 * Phase 11 — Tenant isolation tests
 * Proves Club B token on Club A subdomain always gets 403,
 * and every WHERE clause is scoped to the correct clubId.
 *
 * Run: npx vitest run app/api/__tests__/tenant-isolation.test.ts
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const CLUB_A = { id: "club-a-id", slug: "club-a", name: "Club A", status: "ACTIVE" };
const CLUB_B = { id: "club-b-id", slug: "club-b", name: "Club B", status: "ACTIVE" };

const USER_A: UserRow = { id: "user-a-id", email: "owner@a.test", role: "OWNER",  name: "Owner A",  isActive: true, clubId: CLUB_A.id };
const USER_B: UserRow = { id: "user-b-id", email: "owner@b.test", role: "OWNER",  name: "Owner B",  isActive: true, clubId: CLUB_B.id };

interface UserRow { id: string; email: string; role: string; name: string; isActive: boolean; clubId: string }

const mockUser   = { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), count: vi.fn(), create: vi.fn() };
const mockClub   = { findUnique: vi.fn() };
const mockCoach  = { findMany: vi.fn(), findFirst: vi.fn() };
const mockPost   = { findFirst: vi.fn(), findMany: vi.fn() };
const mockNotif  = { findFirst: vi.fn(), findMany: vi.fn(), deleteMany: vi.fn() };
const mockPromo  = { findMany: vi.fn(), findFirst: vi.fn() };
const mockReport = { findMany: vi.fn(), findFirst: vi.fn(), groupBy: vi.fn() };
const mockWPlan  = { findMany: vi.fn(), findFirst: vi.fn() };
const mockSub    = { findMany: vi.fn(), findFirst: vi.fn(), count: vi.fn() };
const mockPlan   = { findMany: vi.fn(), findFirst: vi.fn() };
const mockPay    = { findMany: vi.fn(), count: vi.fn() };

vi.mock("@/lib/prisma", () => ({
  default: {
    user: mockUser, club: mockClub, coach: mockCoach, post: mockPost,
    notification: mockNotif, promotion: mockPromo, memberReport: mockReport,
    weeklyPlan: mockWPlan, subscription: mockSub, membershipPlan: mockPlan, payment: mockPay,
  },
}));
vi.mock("@/lib/plan-limits",  () => ({ checkLimit: vi.fn().mockResolvedValue({ ok: true }), checkFeature: vi.fn().mockResolvedValue({ ok: true }), getFullUsage: vi.fn().mockResolvedValue({}) }));
vi.mock("@/lib/activity-log", () => ({ logAction: vi.fn() }));
vi.mock("@/lib/permissions",  () => ({ hasPermission: vi.fn().mockResolvedValue(true), hasAnyPermission: vi.fn().mockResolvedValue(true) }));
vi.mock("@/lib/notify",       () => ({ notifyAllMembers: vi.fn(), notifyUsers: vi.fn() }));

beforeAll(() => {
  process.env.JWT_SECRET = "test-secret-minimum-32-chars-xxxxxxxxx";
  process.env.APP_URL    = "https://yoursaas.test";
});

beforeEach(() => vi.clearAllMocks());

async function tokenFor(user: UserRow) {
  const { generateToken } = await import("@/lib/auth");
  return generateToken({ id: user.id, email: user.email, role: user.role, name: user.name, clubId: user.clubId });
}

function req(method: string, path: string, token: string, slug = "club-a", body?: unknown): NextRequest {
  return new NextRequest(`https://${slug}.yoursaas.test${path}`, {
    method,
    headers: {
      host: `${slug}.yoursaas.test`,
      cookie: `token=${token}`,
      "x-club-slug": slug,
      ...(body ? { "content-type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

// ── Cross-tenant 403 tests ────────────────────────────────────────────────────

describe("Cross-tenant rejection", () => {
  const scenarios = [
    { name: "members",      import: () => import("@/app/api/admin/members/route"),      method: "GET",    path: "/api/admin/members" },
    { name: "coaches",      import: () => import("@/app/api/admin/coaches/route"),      method: "GET",    path: "/api/admin/coaches" },
    { name: "promotions",   import: () => import("@/app/api/admin/promotions/route"),   method: "GET",    path: "/api/admin/promotions" },
    { name: "subscriptions",import: () => import("@/app/api/admin/subscriptions/route"),method: "GET",    path: "/api/admin/subscriptions" },
    { name: "payments",     import: () => import("@/app/api/admin/payments/route"),     method: "GET",    path: "/api/admin/payments" },
  ] as const;

  for (const s of scenarios) {
    it(`Club B token on Club A subdomain → 403 (${s.name})`, async () => {
      // DB returns Club B user but Club A's club record (subdomain mismatch)
      mockUser.findUnique.mockResolvedValue(USER_B);
      mockClub.findUnique.mockResolvedValue(CLUB_A);

      const mod = await s.import();
      const handler = (mod as Record<string, unknown>)["GET"] as (r: NextRequest) => Promise<Response>;
      const token = await tokenFor(USER_B);
      const res   = await handler(req("GET", s.path, token, "club-a"));
      expect(res.status).toBe(403);
    });
  }
});

// ── WHERE clause scope tests ──────────────────────────────────────────────────

describe("WHERE clause always scoped to caller's clubId", () => {
  it("GET /api/admin/members — clubId in findMany", async () => {
    mockUser.findUnique.mockResolvedValue(USER_A);
    mockClub.findUnique.mockResolvedValue(CLUB_A);
    mockUser.findMany.mockResolvedValue([]);
    mockUser.count.mockResolvedValue(0);

    const { GET } = await import("@/app/api/admin/members/route");
    await GET(req("GET", "/api/admin/members", await tokenFor(USER_A)));

    const callArgs = mockUser.findMany.mock.calls.at(-1)?.[0];
    expect(callArgs?.where?.clubId).toBe(CLUB_A.id);
  });

  it("GET /api/admin/coaches — clubId in findMany", async () => {
    mockUser.findUnique.mockResolvedValue(USER_A);
    mockClub.findUnique.mockResolvedValue(CLUB_A);
    mockCoach.findMany.mockResolvedValue([]);

    const { GET } = await import("@/app/api/admin/coaches/route");
    await GET(req("GET", "/api/admin/coaches", await tokenFor(USER_A)));

    const callArgs = mockCoach.findMany.mock.calls.at(-1)?.[0];
    expect(callArgs?.where?.clubId).toBe(CLUB_A.id);
  });

  it("DELETE /api/admin/notifications/clear-all — deleteMany scoped to clubId", async () => {
    mockUser.findUnique.mockResolvedValue(USER_A);
    mockClub.findUnique.mockResolvedValue(CLUB_A);
    mockNotif.deleteMany.mockResolvedValue({ count: 5 });

    const { DELETE } = await import("@/app/api/admin/notifications/clear-all/route");
    const res = await DELETE(req("DELETE", "/api/admin/notifications/clear-all", await tokenFor(USER_A)));
    expect(res.status).toBe(200);

    const callArgs = mockNotif.deleteMany.mock.calls.at(-1)?.[0];
    expect(callArgs?.where?.clubId).toBe(CLUB_A.id);
  });

  it("DELETE /api/posts/[id] — findFirst scoped to caller's clubId → 404 for Club B post", async () => {
    mockUser.findUnique.mockResolvedValue(USER_A);
    mockClub.findUnique.mockResolvedValue(CLUB_A);
    // Post belongs to Club B — findFirst with Club A's clubId returns null
    mockPost.findFirst.mockResolvedValue(null);

    const { DELETE } = await import("@/app/api/posts/[id]/route");
    const res = await DELETE(
      req("DELETE", "/api/posts/club-b-post", await tokenFor(USER_A)),
      { params: Promise.resolve({ id: "club-b-post" }) }
    );
    expect(res.status).toBe(404);
    const callArgs = mockPost.findFirst.mock.calls.at(-1)?.[0];
    expect(callArgs?.where?.clubId).toBe(CLUB_A.id);
  });

  it("GET /api/admin/promotions — findMany scoped to caller's clubId", async () => {
    mockUser.findUnique.mockResolvedValue(USER_A);
    mockClub.findUnique.mockResolvedValue(CLUB_A);
    mockPromo.findMany.mockResolvedValue([]);

    const { GET } = await import("@/app/api/admin/promotions/route");
    await GET(req("GET", "/api/admin/promotions", await tokenFor(USER_A)));

    const callArgs = mockPromo.findMany.mock.calls.at(-1)?.[0];
    expect(callArgs?.where?.clubId).toBe(CLUB_A.id);
  });
});
