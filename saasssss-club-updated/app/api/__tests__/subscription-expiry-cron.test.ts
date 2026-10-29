import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const subFindMany = vi.fn();
const subUpdate = vi.fn();
const clubUpdate = vi.fn();
const sendEmail = vi.fn();

vi.mock("@/lib/prisma", () => ({
  default: {
    clubSubscription: { findMany: (...a: unknown[]) => subFindMany(...a), update: (...a: unknown[]) => subUpdate(...a) },
    club: { update: (...a: unknown[]) => clubUpdate(...a) },
    $transaction: async (ops: unknown[]) => Promise.all(ops),
  },
}));
vi.mock("@/lib/cron-auth", () => ({ isAuthorizedCron: (r: Request) => r.headers.get("authorization") === "Bearer secret" }));
vi.mock("@/lib/email", () => ({ sendEmail: (...a: unknown[]) => sendEmail(...a), escapeHtml: (s: string) => s }));
vi.mock("@/lib/activity-log", () => ({ logAction: vi.fn() }));
vi.mock("@/lib/tenant", () => ({ invalidateClubCache: vi.fn() }));

const req = (auth = true) =>
  new NextRequest("https://yoursaas.test/api/cron/subscription-renewal", { headers: auth ? { authorization: "Bearer secret" } : {} });

beforeEach(() => {
  vi.clearAllMocks();
  sendEmail.mockResolvedValue(undefined);
  subUpdate.mockResolvedValue({});
  clubUpdate.mockResolvedValue({});
});

describe("GET /api/cron/subscription-renewal — paid period expiry", () => {
  it("is not callable without the cron secret", async () => {
    const { GET } = await import("@/app/api/cron/subscription-renewal/route");
    expect((await GET(req(false))).status).toBe(401);
    expect(subFindMany).not.toHaveBeenCalled();
  });

  it("suspends ACTIVE clubs whose paid period (+ grace) is over, records the reason and e-mails the owner", async () => {
    // 1st findMany = PAST_DUE pass, 2nd = expired ACTIVE pass
    subFindMany.mockResolvedValueOnce([]).mockResolvedValueOnce([
      { clubId: "c1", club: { id: "c1", name: "Gym One", slug: "gym-one", users: [{ email: "o@gym.test", name: "Owner" }] } },
    ]);
    const { GET } = await import("@/app/api/cron/subscription-renewal/route");
    const json = await (await GET(req())).json();
    expect(json.expired).toBe(1);

    const where = subFindMany.mock.calls[1][0].where;
    expect(where).toMatchObject({ status: "ACTIVE", club: { status: "ACTIVE" } });
    expect(where.currentPeriodEnd.not).toBeNull(); // platform-managed clubs (no period end) are never expired
    expect(where.currentPeriodEnd.lt).toBeInstanceOf(Date);

    expect(subUpdate).toHaveBeenCalledWith({ where: { clubId: "c1" }, data: { status: "SUSPENDED" } });
    expect(clubUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "c1" },
      data: expect.objectContaining({ status: "SUSPENDED", suspendedReason: "Subscription expired" }),
    }));
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it("does nothing when no paid period has run out", async () => {
    subFindMany.mockResolvedValue([]);
    const { GET } = await import("@/app/api/cron/subscription-renewal/route");
    const json = await (await GET(req())).json();
    expect(json.expired).toBe(0);
    expect(subUpdate).not.toHaveBeenCalled();
    expect(clubUpdate).not.toHaveBeenCalled();
  });

  it("one failing club does not stop the others", async () => {
    subFindMany.mockResolvedValueOnce([]).mockResolvedValueOnce([
      { clubId: "c1", club: { id: "c1", name: "A", slug: "a", users: [] } },
      { clubId: "c2", club: { id: "c2", name: "B", slug: "b", users: [] } },
    ]);
    subUpdate.mockRejectedValueOnce(new Error("db hiccup")).mockResolvedValue({});
    const { GET } = await import("@/app/api/cron/subscription-renewal/route");
    const json = await (await GET(req())).json();
    expect(json.expired).toBe(1);
  });
});
