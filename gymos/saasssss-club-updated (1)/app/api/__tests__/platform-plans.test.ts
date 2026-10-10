import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const requireSuperAdmin = vi.fn();
const findUnique = vi.fn();
const count = vi.fn();
const update = vi.fn();

vi.mock("@/lib/auth", () => ({
  requireSuperAdmin: (...args: unknown[]) => requireSuperAdmin(...args),
}));
vi.mock("@/lib/csrf", () => ({ verifyOrigin: () => null }));
vi.mock("@/lib/prisma", () => ({
  default: {
    saasPlan: {
      findUnique: (...args: unknown[]) => findUnique(...args),
      count: (...args: unknown[]) => count(...args),
      update: (...args: unknown[]) => update(...args),
    },
  },
}));

const limits = {
  maxMembers: 100,
  maxCoaches: 3,
  maxAdmins: 2,
  storageGB: 2,
  maxBookingsPerMonth: 500,
  maxCustomPages: 3,
  customDomain: false,
  advancedAnalytics: false,
  revenueAnalytics: false,
  apiAccess: false,
  whiteLabel: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  requireSuperAdmin.mockResolvedValue({ ok: true, user: { id: "platform-admin" } });
  findUnique.mockResolvedValue({ id: "plan-1", isActive: true });
  count.mockResolvedValue(3);
  update.mockResolvedValue({
    id: "plan-1", tier: "STARTER", name: "Starter Plus", priceMonthly: 39,
    currency: "USD", limits, isActive: true,
  });
});

async function patch(body: unknown) {
  const { PATCH } = await import("@/app/api/platform/plans/route");
  return PATCH(new NextRequest("https://yoursaas.test/api/platform/plans", {
    method: "PATCH",
    headers: { "content-type": "application/json", origin: "https://yoursaas.test" },
    body: JSON.stringify(body),
  }));
}

describe("PATCH /api/platform/plans", () => {
  it("lets a superadmin edit pricing and feature limits", async () => {
    const response = await patch({ id: "plan-1", name: "Starter Plus", priceMonthly: 39, currency: "USD", limits });
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(result.plan.priceMonthly).toBe(39);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "plan-1" },
      data: { name: "Starter Plus", priceMonthly: 39, currency: "USD", limits },
    }));
  });

  it("prevents deactivating the last active plan", async () => {
    count.mockResolvedValue(1);
    const response = await patch({ id: "plan-1", isActive: false });

    expect(response.status).toBe(409);
    expect(update).not.toHaveBeenCalled();
  });

  it("rejects unsupported SaaS currencies and invalid limits", async () => {
    const badCurrency = await patch({ id: "plan-1", currency: "TND" });
    expect(badCurrency.status).toBe(400);
    const badLimit = await patch({ id: "plan-1", limits: { ...limits, maxMembers: -1 } });
    expect(badLimit.status).toBe(400);
    expect(update).not.toHaveBeenCalled();
  });
});
