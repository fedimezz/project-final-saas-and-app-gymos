import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const subFindMany = vi.fn();
const subUpdateMany = vi.fn();
const sendEmail = vi.fn();
vi.mock("@/lib/prisma", () => ({
  default: { clubSubscription: { findMany: (...a: unknown[]) => subFindMany(...a), updateMany: (...a: unknown[]) => subUpdateMany(...a) } },
}));
vi.mock("@/lib/cron-auth", () => ({ isAuthorizedCron: (r: Request) => r.headers.get("authorization") === "Bearer secret" }));
vi.mock("@/lib/email", () => ({ sendEmail: (...a: unknown[]) => sendEmail(...a), escapeHtml: (s: string) => s }));

const req = (auth = true) => new NextRequest("https://yoursaas.test/api/cron/renewal-reminders", { headers: auth ? { authorization: "Bearer secret" } : {} });
const inDays = (d: number) => new Date(Date.now() + d * 86_400_000);
const sub = (over: Record<string, unknown> = {}) => ({
  id: "s1", currentPeriodEnd: inDays(2.5), renewalReminderDays: null, renewalReminderFor: null,
  plan: { name: "Pro" },
  club: { id: "c1", name: "Gym A", slug: "gym-a", customDomain: null, users: [{ email: "o@gym.test", name: "Owner" }] },
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  process.env.APP_URL = "https://clubx.test";
  sendEmail.mockResolvedValue(undefined);
  subUpdateMany.mockResolvedValue({ count: 1 });
});

describe("GET /api/cron/renewal-reminders", () => {
  it("needs the cron secret", async () => {
    const { GET } = await import("@/app/api/cron/renewal-reminders/route");
    expect((await GET(req(false))).status).toBe(401);
    expect(subFindMany).not.toHaveBeenCalled();
  });

  it("only looks at ACTIVE clubs with a paid period ending within a week", async () => {
    subFindMany.mockResolvedValue([]);
    const { GET } = await import("@/app/api/cron/renewal-reminders/route");
    await GET(req());
    const where = subFindMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ status: "ACTIVE", club: { status: "ACTIVE" } });
    expect(where.currentPeriodEnd.not).toBeNull();
    expect(where.currentPeriodEnd.gt).toBeInstanceOf(Date);
    expect(where.currentPeriodEnd.lte).toBeInstanceOf(Date);
  });

  it("does not remind clubs that renew automatically through Stripe (unless auto-renewal was cancelled)", async () => {
    subFindMany.mockResolvedValue([]);
    const { GET } = await import("@/app/api/cron/renewal-reminders/route");
    await GET(req());
    expect(subFindMany.mock.calls[0][0].where.OR).toEqual([{ providerSubscriptionId: null }, { cancelAtPeriodEnd: true }]);
  });

  it("e-mails the owner once and records the threshold for that exact period end", async () => {
    const s = sub();
    subFindMany.mockResolvedValue([s]);
    const { GET } = await import("@/app/api/cron/renewal-reminders/route");
    const json = await (await GET(req())).json();
    expect(json).toMatchObject({ checked: 1, sent: 1, failed: 0 });
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: "o@gym.test", subject: expect.stringContaining("Gym A") }));
    expect(sendEmail.mock.calls[0][0].html).toContain("/admin/billing");
    expect(subUpdateMany).toHaveBeenCalledWith({
      where: { id: "s1", currentPeriodEnd: s.currentPeriodEnd },
      data: { renewalReminderDays: 3, renewalReminderFor: s.currentPeriodEnd },
    });
  });

  it("does not send again for a threshold already sent for this period", async () => {
    const end = inDays(2.5);
    subFindMany.mockResolvedValue([sub({ currentPeriodEnd: end, renewalReminderDays: 3, renewalReminderFor: end })]);
    const { GET } = await import("@/app/api/cron/renewal-reminders/route");
    const json = await (await GET(req())).json();
    expect(json.sent).toBe(0);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("does not mark a reminder as sent when the e-mail fails, and keeps going for the others", async () => {
    subFindMany.mockResolvedValue([sub(), sub({ id: "s2", club: { id: "c2", name: "Gym B", slug: "gym-b", customDomain: null, users: [{ email: "b@gym.test", name: "B" }] } })]);
    sendEmail.mockRejectedValueOnce(new Error("smtp down")).mockResolvedValue(undefined);
    const { GET } = await import("@/app/api/cron/renewal-reminders/route");
    const json = await (await GET(req())).json();
    expect(json).toMatchObject({ sent: 1, failed: 1 });
    expect(subUpdateMany).toHaveBeenCalledTimes(1);
    expect(subUpdateMany.mock.calls[0][0].where.id).toBe("s2");
  });

  it("skips a club with no owner e-mail", async () => {
    subFindMany.mockResolvedValue([sub({ club: { id: "c1", name: "Gym A", slug: "gym-a", customDomain: null, users: [] } })]);
    const { GET } = await import("@/app/api/cron/renewal-reminders/route");
    expect((await (await GET(req())).json()).sent).toBe(0);
  });
});
