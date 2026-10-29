import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const requireOwner = vi.fn();
const subFindUnique = vi.fn();
const clubFindUnique = vi.fn();
const createPortal = vi.fn();

vi.mock("@/lib/auth", () => ({ requireOwner: (...a: unknown[]) => requireOwner(...a) }));
vi.mock("@/lib/csrf", () => ({ verifyOrigin: () => null }));
vi.mock("@/lib/payments/stripe", () => ({ createBillingPortalSession: (...a: unknown[]) => createPortal(...a) }));
vi.mock("@/lib/prisma", () => ({
  default: { clubSubscription: { findUnique: (...a: unknown[]) => subFindUnique(...a) }, club: { findUnique: (...a: unknown[]) => clubFindUnique(...a) } },
}));

const call = async () => (await import("@/app/api/billing/portal/route")).POST(new NextRequest("https://gym-a.example/api/billing/portal", { method: "POST" }));

beforeEach(() => {
  vi.clearAllMocks();
  process.env.APP_URL = "https://clubx.example";
  requireOwner.mockResolvedValue({ ok: true, user: { id: "o1", clubId: "club-1" } });
  clubFindUnique.mockResolvedValue({ slug: "gym-a", customDomain: null });
  subFindUnique.mockResolvedValue({ providerCustomerId: "cus_1", providerSubscriptionId: "sub_1" });
  createPortal.mockResolvedValue({ url: "https://billing.stripe.com/p/session/abc" });
});

describe("POST /api/billing/portal", () => {
  it("returns the Stripe portal URL for the OWNER's own club customer", async () => {
    const res = await call();
    expect(res.status).toBe(200);
    expect((await res.json()).url).toBe("https://billing.stripe.com/p/session/abc");
    expect(subFindUnique.mock.calls[0][0].where).toEqual({ clubId: "club-1" }); // tenant from the session only
    expect(createPortal).toHaveBeenCalledWith("cus_1", expect.stringContaining("/admin/billing"));
  });
  it("is owner-only", async () => {
    requireOwner.mockResolvedValue({ ok: false, status: 403 });
    expect((await call()).status).toBe(403);
    expect(createPortal).not.toHaveBeenCalled();
  });
  it("404 for a club without an auto-renewing Stripe subscription (manual / one-time clubs)", async () => {
    subFindUnique.mockResolvedValue({ providerCustomerId: null, providerSubscriptionId: null });
    expect((await call()).status).toBe(404);
    expect(createPortal).not.toHaveBeenCalled();
  });
  it("502 with a friendly message when Stripe fails", async () => {
    createPortal.mockRejectedValue(new Error("portal not configured"));
    const res = await call();
    expect(res.status).toBe(502);
    expect((await res.json()).error).not.toMatch(/portal not configured/);
  });
});
