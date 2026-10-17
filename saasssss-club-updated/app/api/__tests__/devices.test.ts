/**
 * /api/devices — push token registration. Real auth logic, mocked DB.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const userFindUnique = vi.fn();
const clubFindUnique = vi.fn();
const upsert = vi.fn();
const findMany = vi.fn();
const updateMany = vi.fn();
const deleteMany = vi.fn();
vi.mock("@/lib/prisma", () => ({
  default: {
    user: { findUnique: (...a: unknown[]) => userFindUnique(...a) },
    club: { findUnique: (...a: unknown[]) => clubFindUnique(...a) },
    deviceToken: {
      upsert: (...a: unknown[]) => upsert(...a),
      findMany: (...a: unknown[]) => findMany(...a),
      updateMany: (...a: unknown[]) => updateMany(...a),
      deleteMany: (...a: unknown[]) => deleteMany(...a),
    },
  },
}));
const rateLimit = vi.fn();
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: (...a: unknown[]) => rateLimit(...a),
  getClientIp: () => "1.1.1.1",
}));

beforeAll(() => {
  process.env.JWT_SECRET = "test-secret-do-not-use-in-production";
});
const { generateToken, clearAccountCache } = await import("@/lib/auth");

const club = { id: "club_a", slug: "club-a", name: "Club A", status: "ACTIVE" };
const GOOD = "ExponentPushToken[abcdefghijklmnopqrstuv]";

beforeEach(() => {
  vi.clearAllMocks();
  clearAccountCache();
  clubFindUnique.mockResolvedValue(club);
  rateLimit.mockResolvedValue({ allowed: true, remaining: 10, resetAt: 0 });
  upsert.mockResolvedValue({});
  findMany.mockResolvedValue([]);
  updateMany.mockResolvedValue({ count: 0 });
  deleteMany.mockResolvedValue({ count: 1 });
});

function req(method: "POST" | "DELETE" | "GET", role: string | null, body?: unknown) {
  const headers: Record<string, string> = { host: "club-a.example.test", "content-type": "application/json" };
  if (role) {
    userFindUnique.mockResolvedValue({ id: "u1", email: "u@x.test", role, name: "U One", isActive: true, clubId: club.id });
    headers.cookie = `token=${generateToken({ id: "u1", email: "u@x.test", role, name: "U One", clubId: club.id })}`;
  }
  return new NextRequest("https://club-a.example.test/api/devices", {
    method,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

describe("POST /api/devices", () => {
  it("rejects anonymous callers", async () => {
    const { POST } = await import("@/app/api/devices/route");
    const res = await POST(req("POST", null, { token: GOOD, platform: "ios" }));
    expect(res.status).toBe(401);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("refuses staff roles (the app serves members and coaches)", async () => {
    const { POST } = await import("@/app/api/devices/route");
    const res = await POST(req("POST", "ADMIN", { token: GOOD, platform: "ios" }));
    expect(res.status).toBe(403);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("rejects malformed push tokens", async () => {
    const { POST } = await import("@/app/api/devices/route");
    for (const token of ["", "abc", "ExponentPushToken[]", "FCM:xyz", `ExponentPushToken[${"a".repeat(200)}]`]) {
      const res = await POST(req("POST", "MEMBER", { token, platform: "android" }));
      expect(res.status).toBe(400);
    }
    expect(upsert).not.toHaveBeenCalled();
  });

  it("registers a device for a member, taking clubId from the session — never the body", async () => {
    const { POST } = await import("@/app/api/devices/route");
    const res = await POST(req("POST", "MEMBER", { token: GOOD, platform: "ios", deviceName: "iPhone", clubId: "evil_club" }));
    expect(res.status).toBe(200);
    const arg = upsert.mock.calls[0][0] as { create: { clubId: string; userId: string }; update: { clubId: string; userId: string } };
    expect(arg.create.clubId).toBe("club_a");
    expect(arg.update.clubId).toBe("club_a");
    expect(arg.update.userId).toBe("u1"); // token moves to whoever is signed in now
  });

  it("lets a coach register too", async () => {
    const { POST } = await import("@/app/api/devices/route");
    const res = await POST(req("POST", "COACH", { token: GOOD, platform: "android" }));
    expect(res.status).toBe(200);
  });

  it("retires devices beyond the per-user cap", async () => {
    findMany.mockResolvedValue(Array.from({ length: 12 }, (_, i) => ({ id: `d${i}` })));
    const { POST } = await import("@/app/api/devices/route");
    await POST(req("POST", "MEMBER", { token: GOOD, platform: "ios" }));
    const arg = updateMany.mock.calls[0][0] as { where: { id: { in: string[] } }; data: { isActive: boolean } };
    expect(arg.where.id.in).toEqual(["d10", "d11"]);
    expect(arg.data.isActive).toBe(false);
  });

  it("is rate limited", async () => {
    rateLimit.mockResolvedValue({ allowed: false, remaining: 0, resetAt: 0 });
    const { POST } = await import("@/app/api/devices/route");
    const res = await POST(req("POST", "MEMBER", { token: GOOD, platform: "ios" }));
    expect(res.status).toBe(429);
    expect(upsert).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/devices", () => {
  it("only removes a token owned by the caller, inside their club", async () => {
    const { DELETE } = await import("@/app/api/devices/route");
    const res = await DELETE(req("DELETE", "MEMBER", { token: GOOD }));
    expect(res.status).toBe(200);
    expect(deleteMany).toHaveBeenCalledWith({ where: { token: GOOD, userId: "u1", clubId: "club_a" } });
  });
});

describe("GET /api/devices", () => {
  it("never returns a full token", async () => {
    findMany.mockResolvedValue([{ token: GOOD, platform: "ios", deviceName: "iPhone", appVersion: "1.0.0", lastSeenAt: new Date() }]);
    const { GET } = await import("@/app/api/devices/route");
    const res = await GET(req("GET", "MEMBER"));
    const json = await res.json();
    expect(json.devices[0].token).not.toBe(GOOD);
    expect(json.devices[0].token).toContain("…");
    const where = (findMany.mock.calls[0][0] as { where: { userId: string; clubId: string } }).where;
    expect(where).toMatchObject({ userId: "u1", clubId: "club_a" });
  });
});
