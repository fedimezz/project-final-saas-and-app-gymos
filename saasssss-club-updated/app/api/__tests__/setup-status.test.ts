/**
 * /api/admin/setup-status — each step's "done" state must come from real
 * data, not a stored flag, so it can never drift from what the owner
 * actually did.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

const requireAdmin = vi.fn();
vi.mock("@/lib/auth", () => ({ requireAdmin: (...a: unknown[]) => requireAdmin(...a) }));

const gymSettingsFindUnique = vi.fn();
const membershipPlanCount = vi.fn();
const coachCount = vi.fn();
const weeklyPlanCount = vi.fn();
vi.mock("@/lib/prisma", () => ({
  default: {
    gymSettings: { findUnique: (...a: unknown[]) => gymSettingsFindUnique(...a) },
    membershipPlan: { count: (...a: unknown[]) => membershipPlanCount(...a) },
    coach: { count: (...a: unknown[]) => coachCount(...a) },
    weeklyPlan: { count: (...a: unknown[]) => weeklyPlanCount(...a) },
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  requireAdmin.mockResolvedValue({ ok: true, user: { id: "a1", role: "OWNER", clubId: "club-1" } });
  gymSettingsFindUnique.mockResolvedValue(null);
  membershipPlanCount.mockResolvedValue(0);
  coachCount.mockResolvedValue(0);
  weeklyPlanCount.mockResolvedValue(0);
});
afterEach(() => vi.unstubAllEnvs());

async function call() {
  const { GET } = await import("@/app/api/admin/setup-status/route");
  return GET(new NextRequest("https://club-a.test/api/admin/setup-status"));
}

describe("GET /api/admin/setup-status", () => {
  it("requires admin auth", async () => {
    requireAdmin.mockResolvedValue({ ok: false, status: 401 });
    const res = await call();
    expect(res.status).toBe(401);
    expect(gymSettingsFindUnique).not.toHaveBeenCalled();
  });

  it("a brand new club: nothing done, all four required steps incomplete", async () => {
    const res = await call();
    const json = await res.json();

    expect(json.completedCount).toBe(0);
    expect(json.totalCount).toBe(4); // payments is optional, excluded from the count
    expect(json.allDone).toBe(false);
    expect(json.steps.find((s: { id: string }) => s.id === "branding").done).toBe(false);
  });

  it("branding needs BOTH a visual (logo/hero) AND a phone number, not just one", async () => {
    gymSettingsFindUnique.mockResolvedValue({ logoUrl: "https://cdn/x.png", heroTitle: null, heroImageUrl: null, phone: null, address: null });
    let json = await (await call()).json();
    expect(json.steps.find((s: { id: string }) => s.id === "branding").done).toBe(false);

    gymSettingsFindUnique.mockResolvedValue({ logoUrl: "https://cdn/x.png", heroTitle: null, heroImageUrl: null, phone: "20123456", address: null });
    json = await (await call()).json();
    expect(json.steps.find((s: { id: string }) => s.id === "branding").done).toBe(true);
  });

  it("each data-backed step flips independently as data appears", async () => {
    membershipPlanCount.mockResolvedValue(1);
    coachCount.mockResolvedValue(2);
    const json = await (await call()).json();

    expect(json.steps.find((s: { id: string }) => s.id === "plans").done).toBe(true);
    expect(json.steps.find((s: { id: string }) => s.id === "coaches").done).toBe(true);
    expect(json.steps.find((s: { id: string }) => s.id === "schedule").done).toBe(false);
    expect(json.completedCount).toBe(2);
  });

  it("payments step reflects platform Stripe config, and is optional (doesn't block allDone)", async () => {
    gymSettingsFindUnique.mockResolvedValue({ logoUrl: "x", heroTitle: null, heroImageUrl: null, phone: "20123456", address: null });
    membershipPlanCount.mockResolvedValue(1);
    coachCount.mockResolvedValue(1);
    weeklyPlanCount.mockResolvedValue(1);

    let json = await (await call()).json();
    expect(json.allDone).toBe(true); // 4/4 required, payments optional and unset
    expect(json.steps.find((s: { id: string }) => s.id === "payments").done).toBe(false);

    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_test");
    json = await (await call()).json();
    expect(json.steps.find((s: { id: string }) => s.id === "payments").done).toBe(true);
  });

  it("inactive plans/coaches don't count as done", async () => {
    // count() mocks are called with a where filter — confirm isActive is enforced by inspecting the call args.
    await call();
    expect(membershipPlanCount).toHaveBeenCalledWith({ where: { clubId: "club-1", isActive: true } });
    expect(coachCount).toHaveBeenCalledWith({ where: { clubId: "club-1", isActive: true } });
  });
});
