/**
 * /api/dashboard/coach/profile — a coach edits only their own, permitted
 * profile fields; both the Coach and User rows are persisted together.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const userFindUnique = vi.fn();
const userUpdate = vi.fn();
const clubFindUnique = vi.fn();
const coachFindFirst = vi.fn();
const coachUpdate = vi.fn();
const rolePermFind = vi.fn();
vi.mock("@/lib/prisma", () => ({
  default: {
    user: { findUnique: (...a: unknown[]) => userFindUnique(...a), update: (...a: unknown[]) => userUpdate(...a) },
    club: { findUnique: (...a: unknown[]) => clubFindUnique(...a) },
    coach: { findFirst: (...a: unknown[]) => coachFindFirst(...a), update: (...a: unknown[]) => coachUpdate(...a) },
    rolePermission: { findUnique: (...a: unknown[]) => rolePermFind(...a) },
    $transaction: (ops: Promise<unknown>[]) => Promise.all(ops),
  },
}));
vi.mock("@/lib/activity-log", () => ({ logAction: vi.fn() }));

beforeAll(() => {
  process.env.JWT_SECRET = "test-secret-do-not-use-in-production";
});
const { generateToken, clearAccountCache } = await import("@/lib/auth");
const club = { id: "club_a", slug: "club-a", name: "Club A", status: "ACTIVE" };

beforeEach(() => {
  vi.clearAllMocks();
  clearAccountCache();
  clubFindUnique.mockResolvedValue(club);
  rolePermFind.mockResolvedValue(null); // default: allowed
  coachFindFirst.mockResolvedValue({
    id: "coach_1", name: "Old Name", bio: null, photoUrl: null, specialties: [], phone: null, isActive: true,
    user: { email: "c@x.test", avatar: null },
  });
  coachUpdate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    name: "Old Name", bio: null, photoUrl: null, specialties: [], phone: null, isActive: true, ...data,
  }));
  userUpdate.mockResolvedValue({ id: "u_coach" });
});

function req(method: "GET" | "PATCH", role: string | null, body?: unknown) {
  const headers: Record<string, string> = { host: "club-a.example.test", "content-type": "application/json" };
  if (role) {
    userFindUnique.mockResolvedValue({ id: "u_coach", email: "c@x.test", role, name: "Old Name", isActive: true, clubId: club.id });
    headers.cookie = `token=${generateToken({ id: "u_coach", email: "c@x.test", role, name: "Old Name", clubId: club.id })}`;
  }
  return new NextRequest("https://club-a.example.test/api/dashboard/coach/profile", {
    method, headers, ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

describe("PATCH /api/dashboard/coach/profile", () => {
  it("is coach-only", async () => {
    const { PATCH } = await import("@/app/api/dashboard/coach/profile/route");
    expect((await PATCH(req("PATCH", "MEMBER", { bio: "x" }))).status).toBe(403);
    expect((await PATCH(req("PATCH", null, { bio: "x" }))).status).toBe(401);
    expect(coachUpdate).not.toHaveBeenCalled();
  });

  it("respects the owner switching profile editing off", async () => {
    rolePermFind.mockResolvedValue({ allowed: false });
    const { PATCH } = await import("@/app/api/dashboard/coach/profile/route");
    expect((await PATCH(req("PATCH", "COACH", { bio: "x" }))).status).toBe(403);
    expect(coachUpdate).not.toHaveBeenCalled();
  });

  it("persists name/phone/bio/specialties/photo on the coach AND the linked user, scoped by session user + club", async () => {
    const { PATCH } = await import("@/app/api/dashboard/coach/profile/route");
    const photo = "https://res.cloudinary.com/demo/image/upload/me.jpg";
    const res = await PATCH(req("PATCH", "COACH", {
      name: "New Name", phone: "+216 20 123 456", bio: "  Ancien boxeur  ", specialties: ["Boxe", "Boxe", "Cardio"], photoUrl: photo,
    }));
    expect(res.status).toBe(200);
    expect(coachFindFirst.mock.calls[0][0].where).toEqual({ userId: "u_coach", clubId: "club_a" });
    expect(coachUpdate.mock.calls[0][0].where).toEqual({ id: "coach_1" });
    expect(coachUpdate.mock.calls[0][0].data).toMatchObject({
      name: "New Name", phone: "+216 20 123 456", bio: "Ancien boxeur", specialties: ["Boxe", "Cardio"], photoUrl: photo,
    });
    expect(userUpdate.mock.calls[0][0]).toMatchObject({ where: { id: "u_coach" }, data: { name: "New Name", avatar: photo } });
    const json = await res.json();
    expect(json.profile.specialties).toEqual(["Boxe", "Cardio"]);
  });

  it("cannot touch protected fields (role, email, isActive, clubId, userId are ignored)", async () => {
    const { PATCH } = await import("@/app/api/dashboard/coach/profile/route");
    await PATCH(req("PATCH", "COACH", { bio: "ok", role: "OWNER", email: "evil@x.test", isActive: false, clubId: "club_b", userId: "u2" }));
    const coachData = coachUpdate.mock.calls[0][0].data;
    const userData = userUpdate.mock.calls[0][0].data;
    for (const k of ["role", "email", "isActive", "clubId", "userId"]) {
      expect(coachData).not.toHaveProperty(k);
      expect(userData).not.toHaveProperty(k);
    }
  });

  it("rejects unsafe photo URLs, oversized bios, too many specialties and empty bodies", async () => {
    const { PATCH } = await import("@/app/api/dashboard/coach/profile/route");
    for (const body of [
      { photoUrl: "javascript:alert(1)" },
      { photoUrl: "https://evil.example/x.jpg" },
      { bio: "a".repeat(1001) },
      { specialties: Array.from({ length: 9 }, (_, i) => `s${i}`) },
      {},
    ]) {
      expect((await PATCH(req("PATCH", "COACH", body))).status).toBe(400);
    }
    expect(coachUpdate).not.toHaveBeenCalled();
  });

  it("404s when the account has no linked coach profile", async () => {
    coachFindFirst.mockResolvedValue(null);
    const { PATCH } = await import("@/app/api/dashboard/coach/profile/route");
    expect((await PATCH(req("PATCH", "COACH", { bio: "x" }))).status).toBe(404);
  });
});

describe("GET /api/dashboard/coach/profile", () => {
  it("returns the profile and which fields are editable", async () => {
    const { GET } = await import("@/app/api/dashboard/coach/profile/route");
    const json = await (await GET(req("GET", "COACH"))).json();
    expect(json.profile.email).toBe("c@x.test");
    expect(json.editable).toContain("bio");
  });

  it("reports nothing editable when the club disabled it", async () => {
    rolePermFind.mockResolvedValue({ allowed: false });
    const { GET } = await import("@/app/api/dashboard/coach/profile/route");
    expect((await (await GET(req("GET", "COACH"))).json()).editable).toEqual([]);
  });
});
