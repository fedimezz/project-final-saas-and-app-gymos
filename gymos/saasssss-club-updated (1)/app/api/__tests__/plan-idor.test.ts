/**
 * Cross-tenant IDOR on /api/admin/schedule/plan/[id]
 * An admin of club A must not be able to delete/activate/archive club B's plan.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const CLUB_A = "club-a";
const CLUB_B = "club-b";
const PLAN_B = { id: "plan-of-b", clubId: CLUB_B, weekStart: new Date("2026-09-21"), sessions: [] };

const requireAdmin = vi.fn();
vi.mock("@/lib/auth", () => ({ requireAdmin: (...a: unknown[]) => requireAdmin(...a) }));
vi.mock("@/lib/permissions", () => ({ hasPermission: vi.fn().mockResolvedValue(true) }));
vi.mock("@/lib/notify", () => ({ notifyAllMembers: vi.fn().mockResolvedValue(undefined) }));

// Emulates a DB where a row is only visible to a query that scopes by ITS clubId.
const planFindFirst = vi.fn(async ({ where }: { where: { id: string; clubId?: string } }) =>
  where.id === PLAN_B.id && (where.clubId === undefined || where.clubId === PLAN_B.clubId) ? PLAN_B : null
);
const planUpdateMany = vi.fn().mockResolvedValue({ count: 0 });
const planDeleteMany = vi.fn().mockResolvedValue({ count: 0 });
const sessionDeleteMany = vi.fn();
const userSessionUpdateMany = vi.fn();
const userSessionDeleteMany = vi.fn();
const notificationCreateMany = vi.fn();
const transaction = vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
  fn({
    weeklyPlan: { updateMany: planUpdateMany, deleteMany: planDeleteMany, findFirstOrThrow: planFindFirst },
    session: { deleteMany: sessionDeleteMany },
    userSession: { updateMany: userSessionUpdateMany, deleteMany: userSessionDeleteMany },
    notification: { createMany: notificationCreateMany },
  })
);

vi.mock("@/lib/prisma", () => ({
  default: {
    weeklyPlan: {
      findFirst: (...a: unknown[]) => planFindFirst(...(a as [never])),
      findUnique: vi.fn(() => {
        throw new Error("findUnique by id alone is the bug — must not be used");
      }),
      updateMany: (...a: unknown[]) => planUpdateMany(...a),
    },
    $transaction: (...a: unknown[]) => transaction(...(a as [never])),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  requireAdmin.mockResolvedValue({
    ok: true,
    user: { id: "admin-a", role: "ADMIN", name: "A", email: "a@a.test", clubId: CLUB_A },
  });
});

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const req = (method: string, body?: unknown) =>
  new NextRequest("https://club-a.test/api/admin/schedule/plan/x", {
    method,
    headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });

describe("DELETE /api/admin/schedule/plan/[id]", () => {
  it("club A's admin cannot delete club B's plan: 404, nothing touched", async () => {
    const { DELETE } = await import("@/app/api/admin/schedule/plan/[id]/route");
    const res = await DELETE(req("DELETE"), ctx(PLAN_B.id));

    expect(res.status).toBe(404);
    expect(planFindFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: PLAN_B.id, clubId: CLUB_A } }));
    expect(transaction).not.toHaveBeenCalled();
    expect(planDeleteMany).not.toHaveBeenCalled();
    expect(sessionDeleteMany).not.toHaveBeenCalled();
  });

  it("club B's own admin can delete it, and every write is clubId-scoped", async () => {
    requireAdmin.mockResolvedValue({ ok: true, user: { id: "admin-b", role: "ADMIN", name: "B", email: "b@b.test", clubId: CLUB_B } });
    const { DELETE } = await import("@/app/api/admin/schedule/plan/[id]/route");
    const res = await DELETE(req("DELETE"), ctx(PLAN_B.id));

    expect(res.status).toBe(200);
    expect(planDeleteMany).toHaveBeenCalledWith({ where: { id: PLAN_B.id, clubId: CLUB_B } });
    expect(sessionDeleteMany).toHaveBeenCalledWith({ where: { weeklyPlanId: PLAN_B.id, clubId: CLUB_B } });
  });
});

describe("PATCH /api/admin/schedule/plan/[id]", () => {
  it("activating a foreign plan: 404 and the club's CURRENT active plan is left alone", async () => {
    const { PATCH } = await import("@/app/api/admin/schedule/plan/[id]/route");
    const res = await PATCH(req("PATCH", { action: "activate" }), ctx(PLAN_B.id));

    expect(res.status).toBe(404);
    // The old code deactivated the current plan BEFORE checking the target.
    expect(planUpdateMany).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });

  it("archiving a foreign plan: 404, no write", async () => {
    const { PATCH } = await import("@/app/api/admin/schedule/plan/[id]/route");
    const res = await PATCH(req("PATCH", { action: "archive" }), ctx(PLAN_B.id));

    expect(res.status).toBe(404);
    expect(planUpdateMany).not.toHaveBeenCalled();
  });

  it("activating your own plan deactivates the others and activates it in ONE transaction", async () => {
    requireAdmin.mockResolvedValue({ ok: true, user: { id: "admin-b", role: "ADMIN", name: "B", email: "b@b.test", clubId: CLUB_B } });
    const { PATCH } = await import("@/app/api/admin/schedule/plan/[id]/route");
    const res = await PATCH(req("PATCH", { action: "activate" }), ctx(PLAN_B.id));

    expect(res.status).toBe(200);
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(planUpdateMany).toHaveBeenNthCalledWith(1, {
      where: { isActive: true, clubId: CLUB_B, id: { not: PLAN_B.id } },
      data: { isActive: false },
    });
    expect(planUpdateMany).toHaveBeenNthCalledWith(2, { where: { id: PLAN_B.id, clubId: CLUB_B }, data: { isActive: true } });
  });
});
