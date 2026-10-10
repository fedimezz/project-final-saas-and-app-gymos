import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Mock the owner check so we control it per test, independent of a real DB.
const requireOwnerMock = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireOwner: (...args: unknown[]) => requireOwnerMock(...args),
}));

const logActionMock = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/activity-log", () => ({
  logAction: (...args: unknown[]) => logActionMock(...args),
}));

// Mock Prisma. $queryRaw is called with a tagged-template — the actual SQL
// text isn't something we can (or should) assert on here; what matters is
// that the route reads back whatever the mock returns and shapes the JSON
// response correctly.
const queryRawMock = vi.fn();
const userCountMock = vi.fn();
const sessionCountMock = vi.fn();
const userSessionCountMock = vi.fn();
const activityLogCountMock = vi.fn();
const notificationDeleteManyMock = vi.fn();
const subscriptionUpdateManyMock = vi.fn();

vi.mock("@/lib/prisma", () => ({
  default: {
    $queryRaw: (...args: unknown[]) => queryRawMock(...args),
    user: { count: (...args: unknown[]) => userCountMock(...args) },
    session: { count: (...args: unknown[]) => sessionCountMock(...args) },
    userSession: { count: (...args: unknown[]) => userSessionCountMock(...args) },
    activityLog: { count: (...args: unknown[]) => activityLogCountMock(...args) },
    notification: { deleteMany: (...args: unknown[]) => notificationDeleteManyMock(...args) },
    subscription: { updateMany: (...args: unknown[]) => subscriptionUpdateManyMock(...args) },
  },
}));

const { GET, POST } = await import("../system/route");

const OWNER = { id: "owner_1", email: "owner@club.test", role: "OWNER", name: "Owner" };

function makeRequest(method: "GET" | "POST", body?: unknown): NextRequest {
  return new NextRequest("https://example.test/api/admin/system", {
    method,
    ...(body !== undefined
      ? { body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }
      : {}),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/admin/system", () => {
  it("returns 403 (propagating the auth helper's status) when not an owner", async () => {
    requireOwnerMock.mockResolvedValueOnce({ ok: false, status: 403 });
    const res = await GET(makeRequest("GET"));
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toMatch(/propriétaire/i);
  });

  it("returns 401 when there's no session at all", async () => {
    requireOwnerMock.mockResolvedValueOnce({ ok: false, status: 401 });
    const res = await GET(makeRequest("GET"));
    expect(res.status).toBe(401);
  });

  it("reports db.ok=true and shapes counts/env correctly for an owner", async () => {
    requireOwnerMock.mockResolvedValueOnce({ ok: true, user: OWNER });
    userCountMock.mockResolvedValueOnce(42);
    sessionCountMock.mockResolvedValueOnce(10);
    userSessionCountMock.mockResolvedValueOnce(100);
    activityLogCountMock.mockResolvedValueOnce(500);
    // First $queryRaw call = "SELECT 1" ping, second = stale bookings,
    // third = orphaned-bookings count (the bug fixed this session).
    queryRawMock
      .mockResolvedValueOnce(undefined) // SELECT 1
      .mockResolvedValueOnce([{ id: "s1", coach: "Alex", diff: 2 }]) // stale
      .mockResolvedValueOnce([{ count: 0 }]); // orphaned

    const res = await GET(makeRequest("GET"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.db.ok).toBe(true);
    expect(json.counts).toEqual({
      userCount: 42, sessionCount: 10, bookingCount: 100, logCount: 500,
    });
    expect(json.issues.staleBookingCounts).toEqual([{ id: "s1", coach: "Alex", diff: 2 }]);
    // The specific regression this session fixed: orphanedBookings must
    // come from the dedicated LEFT JOIN count, not just echo bookingCount.
    expect(json.issues.orphanedBookings).toBe(0);
  });

  it("reports the real orphaned-booking count when the LEFT JOIN finds some", async () => {
    requireOwnerMock.mockResolvedValueOnce({ ok: true, user: OWNER });
    userCountMock.mockResolvedValueOnce(1);
    sessionCountMock.mockResolvedValueOnce(1);
    userSessionCountMock.mockResolvedValueOnce(5); // 5 ACTIVE bookings total
    activityLogCountMock.mockResolvedValueOnce(0);
    queryRawMock
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ count: 3 }]); // 3 of those 5 are orphaned

    const res = await GET(makeRequest("GET"));
    const json = await res.json();
    // Must NOT equal bookingCount (5) — that was exactly the old bug.
    expect(json.issues.orphanedBookings).toBe(3);
    expect(json.issues.orphanedBookings).not.toBe(json.counts.bookingCount);
  });

  it("degrades gracefully (db.ok=false) when the ping fails, without crashing", async () => {
    requireOwnerMock.mockResolvedValueOnce({ ok: true, user: OWNER });
    queryRawMock.mockRejectedValueOnce(new Error("connection refused"));
    userCountMock.mockResolvedValueOnce(0);
    sessionCountMock.mockResolvedValueOnce(0);
    userSessionCountMock.mockResolvedValueOnce(0);
    activityLogCountMock.mockResolvedValueOnce(0);
    // Remaining two $queryRaw calls in Promise.all — let them resolve fine.
    queryRawMock.mockResolvedValueOnce([]).mockResolvedValueOnce([{ count: 0 }]);

    const res = await GET(makeRequest("GET"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.db.ok).toBe(false);
  });
});

describe("POST /api/admin/system", () => {
  it("rejects non-owners", async () => {
    requireOwnerMock.mockResolvedValueOnce({ ok: false, status: 403 });
    const res = await POST(makeRequest("POST", { action: "ping_db" }));
    expect(res.status).toBe(403);
  });

  it("returns 400 for an unknown action", async () => {
    requireOwnerMock.mockResolvedValueOnce({ ok: true, user: OWNER });
    const res = await POST(makeRequest("POST", { action: "delete_everything" }));
    expect(res.status).toBe(400);
  });

  it("ping_db returns latency and does not log an activity entry", async () => {
    requireOwnerMock.mockResolvedValueOnce({ ok: true, user: OWNER });
    queryRawMock.mockResolvedValueOnce(undefined);
    const res = await POST(makeRequest("POST", { action: "ping_db" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(typeof json.latencyMs).toBe("number");
    expect(logActionMock).not.toHaveBeenCalled();
  });

  it("recount_bookings runs a single set-based query and logs a SYSTEM action", async () => {
    requireOwnerMock.mockResolvedValueOnce({ ok: true, user: OWNER });
    // The rewritten implementation issues exactly one $queryRaw (the
    // UPDATE ... FROM ... RETURNING) instead of the old per-session loop.
    queryRawMock.mockResolvedValueOnce([{ id: "s1" }, { id: "s2" }]);

    const res = await POST(makeRequest("POST", { action: "recount_bookings" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.sessionsFixed).toBe(2);
    expect(queryRawMock).toHaveBeenCalledTimes(1);
    expect(logActionMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "SYSTEM_RECOUNT_BOOKINGS", category: "SYSTEM" })
    );
  });

  it("clear_old_notifications deletes and logs the count", async () => {
    requireOwnerMock.mockResolvedValueOnce({ ok: true, user: OWNER });
    notificationDeleteManyMock.mockResolvedValueOnce({ count: 7 });
    const res = await POST(makeRequest("POST", { action: "clear_old_notifications" }));
    const json = await res.json();
    expect(json.deleted).toBe(7);
    expect(logActionMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "SYSTEM_CLEAR_NOTIFICATIONS" })
    );
  });

  it("expire_subscriptions updates and logs the count", async () => {
    requireOwnerMock.mockResolvedValueOnce({ ok: true, user: OWNER });
    subscriptionUpdateManyMock.mockResolvedValueOnce({ count: 4 });
    const res = await POST(makeRequest("POST", { action: "expire_subscriptions" }));
    const json = await res.json();
    expect(json.expired).toBe(4);
    expect(logActionMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "SYSTEM_EXPIRE_SUBSCRIPTIONS" })
    );
  });

  it("returns 500 without leaking internals when a mutation throws", async () => {
    requireOwnerMock.mockResolvedValueOnce({ ok: true, user: OWNER });
    subscriptionUpdateManyMock.mockRejectedValueOnce(new Error("db exploded"));
    const res = await POST(makeRequest("POST", { action: "expire_subscriptions" }));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).not.toMatch(/db exploded/);
  });
});
