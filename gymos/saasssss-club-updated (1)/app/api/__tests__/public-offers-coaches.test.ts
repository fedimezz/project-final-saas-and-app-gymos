/**
 * Public club pages: saved promotional offers and coaches must show up for the
 * club resolved from the host — and ONLY that club, only when published.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const tenantMock = vi.fn();
vi.mock("@/lib/tenant", () => ({ resolveTenantFromRequest: (...a: unknown[]) => tenantMock(...a) }));

const promoFindMany = vi.fn();
const coachFindMany = vi.fn();
vi.mock("@/lib/prisma", () => ({
  default: {
    promotion: { findMany: (...a: unknown[]) => promoFindMany(...a) },
    coach: { findMany: (...a: unknown[]) => coachFindMany(...a) },
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  tenantMock.mockResolvedValue({ id: "club_a", slug: "club-a" });
});

const req = (path: string) => new NextRequest(`https://club-a.example.test${path}`);
const promo = (over: Record<string, unknown> = {}) => ({
  id: "p1", code: "SUMMER10", title: "Été -10%", description: "d", discountType: "PERCENT", discountValue: 10,
  startDate: new Date("2026-06-01"), endDate: null, maxUses: null, usedCount: 0, ...over,
});

describe("GET /api/promotions/public", () => {
  it("queries only the resolved club's active, published, in-window offers", async () => {
    promoFindMany.mockResolvedValue([promo()]);
    const { GET } = await import("@/app/api/promotions/public/route");
    const res = await GET(req("/api/promotions/public?clubId=club_b")); // query param must be ignored
    expect(res.status).toBe(200);
    const where = promoFindMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ clubId: "club_a", isActive: true, isPublic: true });
    expect(where.startDate.lte).toBeInstanceOf(Date);
    expect(where.OR).toEqual([{ endDate: null }, { endDate: { gte: expect.any(Date) } }]);
    expect((await res.json()).promotions).toHaveLength(1);
  });

  it("keeps an offer visible through its whole last day (end date compared with start of today)", async () => {
    promoFindMany.mockResolvedValue([]);
    const { GET } = await import("@/app/api/promotions/public/route");
    await GET(req("/api/promotions/public"));
    const gte: Date = promoFindMany.mock.calls[0][0].where.OR[1].endDate.gte;
    expect(gte.getUTCHours()).toBe(0);
    expect(gte.getUTCMinutes()).toBe(0);
  });

  it("drops exhausted offers and reports remaining uses; hides internal counters", async () => {
    promoFindMany.mockResolvedValue([
      promo({ id: "p1", maxUses: 10, usedCount: 4 }),
      promo({ id: "p2", maxUses: 5, usedCount: 5 }),
    ]);
    const { GET } = await import("@/app/api/promotions/public/route");
    const { promotions } = await (await GET(req("/api/promotions/public"))).json();
    expect(promotions.map((p: { id: string }) => p.id)).toEqual(["p1"]);
    expect(promotions[0].usesLeft).toBe(6);
    expect(promotions[0]).not.toHaveProperty("usedCount");
    expect(promotions[0]).not.toHaveProperty("maxUses");
    expect(promotions[0]).not.toHaveProperty("createdBy");
  });

  it("returns nothing (and no DB query) when the host is not a known club", async () => {
    tenantMock.mockResolvedValue(null);
    const { GET } = await import("@/app/api/promotions/public/route");
    expect((await (await GET(req("/api/promotions/public"))).json()).promotions).toEqual([]);
    expect(promoFindMany).not.toHaveBeenCalled();
  });
});

describe("GET /api/coaches/public", () => {
  it("returns only the resolved club's active coaches, without private fields", async () => {
    coachFindMany.mockResolvedValue([
      { id: "c1", name: "Sami", bio: "b", photoUrl: "https://res.cloudinary.com/demo/image/upload/a.jpg", specialties: ["Boxe"], sessions: [{ activity: "BOXE" }, { activity: "BOXE" }] },
      { id: "c2", name: "Lina", bio: null, photoUrl: "https://evil.example/x.jpg", specialties: [], sessions: [] },
    ]);
    const { GET } = await import("@/app/api/coaches/public/route");
    const { coaches } = await (await GET(req("/api/coaches/public"))).json();
    expect(coachFindMany.mock.calls[0][0].where).toEqual({ clubId: "club_a", isActive: true });
    expect(coaches).toHaveLength(2);
    expect(coaches[0].activities).toEqual(["BOXE"]);
    expect(coaches[1].photoUrl).toBeNull(); // unsafe host never reaches next/image
    for (const c of coaches) {
      expect(c).not.toHaveProperty("phone");
      expect(c).not.toHaveProperty("userId");
      expect(c).not.toHaveProperty("clubId");
    }
  });
});
