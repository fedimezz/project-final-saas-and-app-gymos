/**
 * PATCH /api/admin/members/[id] { action: "setRole" } — an OWNER can promote a
 * club member to COACH or ADMIN. Enforced on the server: ADMIN/COACH/MEMBER are
 * refused, plan limits apply, a coach profile is created, the target is always
 * looked up inside the caller's own club, and nobody can mint an OWNER or
 * SUPER_ADMIN this way.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const userFindUnique = vi.fn();
const userFindFirst = vi.fn();
const userUpdate = vi.fn();
const clubFindUnique = vi.fn();
const coachFindFirst = vi.fn();
const coachCreate = vi.fn();
const coachUpdate = vi.fn();
const coachUpdateMany = vi.fn();
const checkLimitMock = vi.fn();

const db = {
  user: {
    findUnique: (...a: unknown[]) => userFindUnique(...a),
    findFirst: (...a: unknown[]) => userFindFirst(...a),
    update: (...a: unknown[]) => userUpdate(...a),
  },
  club: { findUnique: (...a: unknown[]) => clubFindUnique(...a) },
  coach: {
    findFirst: (...a: unknown[]) => coachFindFirst(...a),
    create: (...a: unknown[]) => coachCreate(...a),
    update: (...a: unknown[]) => coachUpdate(...a),
    updateMany: (...a: unknown[]) => coachUpdateMany(...a),
  },
  $transaction: async (cb: (tx: unknown) => unknown) => cb(db),
};
vi.mock("@/lib/prisma", () => ({ default: db }));
vi.mock("@/lib/activity-log", () => ({ logAction: vi.fn() }));
vi.mock("@/lib/after", () => ({ runAfter: vi.fn() }));
vi.mock("@/lib/permissions", () => ({ hasPermission: vi.fn().mockResolvedValue(true) }));
vi.mock("@/lib/plan-limits", () => ({ checkLimit: (...a: unknown[]) => checkLimitMock(...a) }));

beforeAll(() => {
  process.env.JWT_SECRET = "test-secret-do-not-use-in-production";
});

const { generateToken, clearAccountCache } = await import("@/lib/auth");

const club = { id: "club_a", slug: "club-a", name: "Club A", status: "ACTIVE" };
const member = { id: "m1", name: "Sara", email: "sara@x.test", phone: null, role: "MEMBER", isActive: true, clubId: club.id };

beforeEach(() => {
  vi.clearAllMocks();
  clearAccountCache();
  clubFindUnique.mockResolvedValue(club);
  userFindFirst.mockResolvedValue(member);
  userUpdate.mockImplementation(async ({ data }: { data: { role: string } }) => ({ ...member, role: data.role }));
  coachFindFirst.mockResolvedValue(null);
  coachCreate.mockResolvedValue({ id: "c1" });
  checkLimitMock.mockResolvedValue({ ok: true });
});

function patch(role: string, body: unknown) {
  userFindUnique.mockResolvedValue({
    id: `u_${role}`, email: `${role}@x.test`, role, name: role, isActive: true, clubId: club.id,
  });
  const token = generateToken({ id: `u_${role}`, email: `${role}@x.test`, role, name: role, clubId: club.id });
  return new NextRequest("https://club-a.example.test/api/admin/members/m1", {
    method: "PATCH",
    headers: { host: "club-a.example.test", cookie: `token=${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
const ctx = { params: Promise.resolve({ id: "m1" }) };

describe("PATCH /api/admin/members/[id] — setRole", () => {
  it.each(["ADMIN", "COACH", "MEMBER"])("refuses %s and changes nothing", async (role) => {
    const { PATCH } = await import("@/app/api/admin/members/[id]/route");
    const res = await PATCH(patch(role, { action: "setRole", role: "COACH" }), ctx);
    expect([401, 403]).toContain(res.status);
    expect(userUpdate).not.toHaveBeenCalled();
  });

  it("lets the OWNER make a member a coach, and gives them a coach profile", async () => {
    const { PATCH } = await import("@/app/api/admin/members/[id]/route");
    const res = await PATCH(patch("OWNER", { action: "setRole", role: "COACH" }), ctx);
    expect(res.status).toBe(200);
    expect((await res.json()).member.role).toBe("COACH");
    expect(checkLimitMock).toHaveBeenCalledWith(club.id, "maxCoaches");
    expect(coachCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ clubId: club.id, userId: "m1", name: "Sara" }),
    });
  });

  it("re-uses an existing coach profile instead of creating a duplicate", async () => {
    coachFindFirst.mockResolvedValue({ id: "c_old" });
    const { PATCH } = await import("@/app/api/admin/members/[id]/route");
    const res = await PATCH(patch("OWNER", { action: "setRole", role: "COACH" }), ctx);
    expect(res.status).toBe(200);
    expect(coachCreate).not.toHaveBeenCalled();
    expect(coachUpdate).toHaveBeenCalledWith({ where: { id: "c_old" }, data: { isActive: true } });
  });

  it("promotes to ADMIN without creating a coach profile", async () => {
    const { PATCH } = await import("@/app/api/admin/members/[id]/route");
    const res = await PATCH(patch("OWNER", { action: "setRole", role: "ADMIN" }), ctx);
    expect(res.status).toBe(200);
    expect(checkLimitMock).toHaveBeenCalledWith(club.id, "maxAdmins");
    expect(coachCreate).not.toHaveBeenCalled();
  });

  it("answers 402 and does not change the role when the plan limit is reached", async () => {
    checkLimitMock.mockResolvedValue({ ok: false, reason: "Limite atteinte", upgrade: true });
    const { PATCH } = await import("@/app/api/admin/members/[id]/route");
    const res = await PATCH(patch("OWNER", { action: "setRole", role: "ADMIN" }), ctx);
    expect(res.status).toBe(402);
    expect((await res.json()).upgrade).toBe(true);
    expect(userUpdate).not.toHaveBeenCalled();
  });

  it("looks the target up inside the caller's own club only", async () => {
    userFindFirst.mockResolvedValue(null);
    const { PATCH } = await import("@/app/api/admin/members/[id]/route");
    const res = await PATCH(patch("OWNER", { action: "setRole", role: "COACH" }), ctx);
    expect(res.status).toBe(404);
    expect(userFindFirst).toHaveBeenCalledWith({ where: { id: "m1", clubId: club.id } });
    expect(userUpdate).not.toHaveBeenCalled();
  });

  it("refuses to mint an OWNER or SUPER_ADMIN through this endpoint", async () => {
    const { PATCH } = await import("@/app/api/admin/members/[id]/route");
    for (const role of ["OWNER", "SUPER_ADMIN"]) {
      const res = await PATCH(patch("OWNER", { action: "setRole", role }), ctx);
      expect(res.status).toBe(400);
    }
    expect(userUpdate).not.toHaveBeenCalled();
  });

  it("refuses to change an owner's role, or the caller's own", async () => {
    const { PATCH } = await import("@/app/api/admin/members/[id]/route");
    userFindFirst.mockResolvedValue({ ...member, role: "OWNER" });
    expect((await PATCH(patch("OWNER", { action: "setRole", role: "COACH" }), ctx)).status).toBe(400);
    userFindFirst.mockResolvedValue({ ...member, id: "u_OWNER" });
    expect((await PATCH(patch("OWNER", { action: "setRole", role: "COACH" }), ctx)).status).toBe(400);
    expect(userUpdate).not.toHaveBeenCalled();
  });
});
