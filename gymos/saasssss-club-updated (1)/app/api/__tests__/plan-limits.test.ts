/**
 * Phase 11 — Plan limit integration tests
 * maxMembers hit → 402 + upgrade:true
 * Below limit → 201 + member created
 *
 * Run: npx vitest run app/api/__tests__/plan-limits.test.ts
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const CLUB_A  = { id: "club-a-id", slug: "club-a", status: "ACTIVE" };
const ADMIN_A = { id: "adm-id", email: "admin@a.test", role: "ADMIN", name: "Admin A", isActive: true, clubId: CLUB_A.id };

const mockUser  = { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), count: vi.fn(), create: vi.fn() };
const mockClub  = { findUnique: vi.fn() };
const mockCoach = { create: vi.fn() };
const mockTransaction = vi.fn(async (callback: (tx: unknown) => unknown) => callback({ user: mockUser, coach: mockCoach }));
const checkLimitMock = vi.fn();

vi.mock("@/lib/prisma", () => ({ default: { user: mockUser, club: mockClub, $transaction: mockTransaction } }));
vi.mock("@/lib/plan-limits", () => ({
  checkLimit:   (...a: unknown[]) => checkLimitMock(...a),
  checkFeature: vi.fn().mockResolvedValue({ ok: true }),
  getFullUsage: vi.fn().mockResolvedValue({ usage: {}, limits: {} }),
}));
vi.mock("@/lib/bcrypt",       () => ({ hashPassword: vi.fn().mockResolvedValue("hashed") }));
vi.mock("@/lib/permissions",  () => ({ hasPermission: vi.fn().mockResolvedValue(true) }));
vi.mock("@/lib/activity-log", () => ({ logAction: vi.fn() }));
vi.mock("@/lib/notify",       () => ({ notifyAllMembers: vi.fn(), notifyUsers: vi.fn() }));

beforeAll(() => {
  process.env.JWT_SECRET = "test-secret-minimum-32-chars-xxxxxxxxx";
  process.env.APP_URL    = "https://yoursaas.test";
});
beforeEach(() => {
  vi.clearAllMocks();
  mockUser.findUnique.mockResolvedValue(ADMIN_A);
  mockClub.findUnique.mockResolvedValue(CLUB_A);
});

async function tokenFor(user: typeof ADMIN_A) {
  const { generateToken } = await import("@/lib/auth");
  return generateToken({ id: user.id, email: user.email, role: user.role, name: user.name, clubId: user.clubId });
}

function makeReq(body: unknown, token: string): NextRequest {
  return new NextRequest("https://club-a.yoursaas.test/api/admin/members", {
    method: "POST",
    headers: {
      host: "club-a.yoursaas.test",
      cookie: `token=${token}`,
      "x-club-slug": "club-a",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

const BODY = { name: "Jean Dupont", email: "jean@club-a.test", password: "Test1234!" };

describe("maxMembers plan limit", () => {
  it("returns 402 + upgrade:true when limit is reached", async () => {
    checkLimitMock.mockResolvedValue({ ok: false, reason: "Limite de membres atteinte.", upgrade: true });

    const { POST } = await import("@/app/api/admin/members/route");
    const token = await tokenFor(ADMIN_A);
    const res  = await POST(makeReq(BODY, token));
    const json = await res.json();

    expect(res.status).toBe(402);
    expect(json.upgrade).toBe(true);
    expect(checkLimitMock).toHaveBeenCalledWith(CLUB_A.id, "maxMembers");
  });

  it("returns 201 and creates member when below limit", async () => {
    checkLimitMock.mockResolvedValue({ ok: true });
    mockUser.findFirst.mockResolvedValue(null); // email not taken
    mockUser.create.mockResolvedValue({
      id: "new-member-id", name: "Jean Dupont", email: "jean@club-a.test",
      role: "MEMBER", clubId: CLUB_A.id, isActive: true, phone: null, avatar: null,
    });

    const { POST } = await import("@/app/api/admin/members/route");
    const token = await tokenFor(ADMIN_A);
    const res  = await POST(makeReq(BODY, token));
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.member.clubId).toBe(CLUB_A.id);
    // The newly created member must belong to Club A — not any other club
    const createArgs = mockUser.create.mock.calls.at(-1)?.[0];
    expect(createArgs?.data?.clubId).toBe(CLUB_A.id);
  });

  it("returns 409 when email is already taken in the same club", async () => {
    checkLimitMock.mockResolvedValue({ ok: true });
    mockUser.findFirst.mockResolvedValue({ id: "existing", email: "jean@club-a.test" });

    const { POST } = await import("@/app/api/admin/members/route");
    const token = await tokenFor(ADMIN_A);
    const reqObj = new NextRequest("https://club-a.yoursaas.test/api/admin/members", {
      method: "POST",
      headers: {
        host: "club-a.yoursaas.test",
        cookie: `token=${token}`,
        "x-club-slug": "club-a",
        "content-type": "application/json",
      },
      body: JSON.stringify(BODY),
    });
    const res  = await POST(reqObj);
    expect(res.status).toBe(409);
  });
});
