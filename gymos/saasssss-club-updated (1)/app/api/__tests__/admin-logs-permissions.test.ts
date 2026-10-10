/**
 * Activity log is OWNER-only, enforced on the server (not just by hiding the
 * menu entry): a regular ADMIN, a COACH, a MEMBER and an anonymous caller must
 * all be refused, and an OWNER must only ever read their own club's rows.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const userFindUnique = vi.fn();
const clubFindUnique = vi.fn();
const logFindMany = vi.fn();
const logCount = vi.fn();
const logGroupBy = vi.fn();
const logDeleteMany = vi.fn();
vi.mock("@/lib/prisma", () => ({
  default: {
    user: { findUnique: (...a: unknown[]) => userFindUnique(...a) },
    club: { findUnique: (...a: unknown[]) => clubFindUnique(...a) },
    activityLog: {
      findMany: (...a: unknown[]) => logFindMany(...a),
      count: (...a: unknown[]) => logCount(...a),
      groupBy: (...a: unknown[]) => logGroupBy(...a),
      deleteMany: (...a: unknown[]) => logDeleteMany(...a),
    },
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
  logFindMany.mockResolvedValue([]);
  logCount.mockResolvedValue(0);
  logGroupBy.mockResolvedValue([]);
  logDeleteMany.mockResolvedValue({ count: 0 });
});

function as(role: string | null, method: "GET" | "DELETE" = "GET") {
  const headers: Record<string, string> = { host: "club-a.example.test" };
  if (role) {
    userFindUnique.mockResolvedValue({
      id: `u_${role}`, email: `${role}@x.test`, role, name: role, isActive: true, clubId: club.id,
    });
    const token = generateToken({ id: `u_${role}`, email: `${role}@x.test`, role, name: role, clubId: club.id });
    headers.cookie = `token=${token}`;
  }
  return new NextRequest("https://club-a.example.test/api/admin/logs", {
    method,
    headers,
    ...(method === "DELETE" ? { body: JSON.stringify({ days: 30 }) } : {}),
  });
}

describe("/api/admin/logs permissions", () => {
  it.each(["ADMIN", "COACH", "MEMBER"])("refuses %s with 403 and never queries the log table", async (role) => {
    const { GET } = await import("@/app/api/admin/logs/route");
    const res = await GET(as(role));
    expect(res.status).toBe(403);
    expect(logFindMany).not.toHaveBeenCalled();
  });

  it("refuses an anonymous caller with 401", async () => {
    const { GET } = await import("@/app/api/admin/logs/route");
    const res = await GET(as(null));
    expect(res.status).toBe(401);
    expect(logFindMany).not.toHaveBeenCalled();
  });

  it("lets the OWNER read the journal, scoped to their own club", async () => {
    const { GET } = await import("@/app/api/admin/logs/route");
    const res = await GET(as("OWNER"));
    expect(res.status).toBe(200);
    expect(logFindMany).toHaveBeenCalled();
    const where = (logFindMany.mock.calls[0][0] as { where: { clubId: string } }).where;
    expect(where.clubId).toBe("club_a");
  });

  it("refuses an ADMIN who tries to purge the journal", async () => {
    const { DELETE } = await import("@/app/api/admin/logs/route");
    const res = await DELETE(as("ADMIN", "DELETE"));
    expect(res.status).toBe(403);
    expect(logDeleteMany).not.toHaveBeenCalled();
  });
});
