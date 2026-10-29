import { describe, it, expect, vi, beforeEach } from "vitest";

const subFindUnique = vi.fn();
vi.mock("@/lib/prisma", () => ({
  default: { clubSubscription: { findUnique: (...a: unknown[]) => subFindUnique(...a) } },
}));
import { denyIfFeatureLocked, isFeatureAllowed } from "@/lib/plan-feature-guard";

const limits = (over: Record<string, unknown> = {}) => ({ maxMembers: 100, customHeroModel: false, ...over });
const sub = (status: string, l: Record<string, unknown>) => ({ status, plan: { tier: "STARTER", name: "Starter", limits: l } });

beforeEach(() => vi.clearAllMocks());

describe("customHeroModel plan feature (\"Add my own 3D model\")", () => {
  it("is refused with 402 + an upgrade message when the plan does not include it", async () => {
    subFindUnique.mockResolvedValue(sub("ACTIVE", limits()));
    const res = await denyIfFeatureLocked("club-1", "customHeroModel");
    expect(res?.status).toBe(402);
    const json = await res!.json();
    expect(json).toMatchObject({ code: "PLAN_UPGRADE_REQUIRED", feature: "customHeroModel", upgrade: true, upgradePath: "/admin/billing" });
    expect(json.error).toMatch(/plan/i);
    expect(json.error).toMatch(/standard/i); // reassures that standard models stay free
  });

  it("is allowed when the plan includes it (configurable by SUPER_ADMIN in the plan limits)", async () => {
    subFindUnique.mockResolvedValue(sub("ACTIVE", limits({ customHeroModel: true })));
    expect(await denyIfFeatureLocked("club-1", "customHeroModel")).toBeNull();
    expect(await isFeatureAllowed("club-1", "customHeroModel")).toBe(true);
  });

  it("is allowed during a trial on a plan that includes it, refused during a trial on a plan that does not", async () => {
    subFindUnique.mockResolvedValue(sub("TRIALING", limits({ customHeroModel: true })));
    expect(await isFeatureAllowed("club-1", "customHeroModel")).toBe(true);
    subFindUnique.mockResolvedValue(sub("TRIALING", limits()));
    expect(await isFeatureAllowed("club-1", "customHeroModel")).toBe(false);
  });

  it("fails CLOSED: a plan row without the key, or a club without a subscription, is locked", async () => {
    subFindUnique.mockResolvedValue(sub("ACTIVE", { maxMembers: 100 }));
    expect(await isFeatureAllowed("club-1", "customHeroModel")).toBe(false);
    subFindUnique.mockResolvedValue(null);
    expect(await isFeatureAllowed("club-1", "customHeroModel")).toBe(false);
  });

  it("looks the plan up by the club id it was given (tenant isolation), nothing else", async () => {
    subFindUnique.mockResolvedValue(sub("ACTIVE", limits({ customHeroModel: true })));
    await isFeatureAllowed("club-42", "customHeroModel");
    expect(subFindUnique.mock.calls[0][0].where).toEqual({ clubId: "club-42" });
  });
});
