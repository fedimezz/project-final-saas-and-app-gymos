/**
 * Theme + 3D model lock: owner request → SUPER_ADMIN approval → one-time apply.
 * Route-level behaviour (mocked Prisma). The guarantee that the DATABASE itself refuses an
 * unauthorised or repeated change is tested against real Postgres in prisma/tests/design-lock.test.sql.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";

const userFindUnique = vi.fn();
const clubFindUnique = vi.fn();
const settingsFindUnique = vi.fn();
const settingsUpdate = vi.fn();
const reqFindMany = vi.fn();
const reqFindFirst = vi.fn();
const reqFindUnique = vi.fn();
const reqCreate = vi.fn();
const reqUpdateMany = vi.fn();
const heroFindUnique = vi.fn();

vi.mock("@/lib/prisma", () => ({
  default: {
    user: { findUnique: (...a: unknown[]) => userFindUnique(...a) },
    club: { findUnique: (...a: unknown[]) => clubFindUnique(...a) },
    gymSettings: {
      findUnique: (...a: unknown[]) => settingsFindUnique(...a),
      create: vi.fn(),
      update: (...a: unknown[]) => settingsUpdate(...a),
    },
    designChangeRequest: {
      findMany: (...a: unknown[]) => reqFindMany(...a),
      findFirst: (...a: unknown[]) => reqFindFirst(...a),
      findUnique: (...a: unknown[]) => reqFindUnique(...a),
      create: (...a: unknown[]) => reqCreate(...a),
      updateMany: (...a: unknown[]) => reqUpdateMany(...a),
    },
    clubHeroModel: { findUnique: (...a: unknown[]) => heroFindUnique(...a) },
  },
}));
vi.mock("@/lib/website-setup", () => ({ denyIfWebsiteLocked: async () => null }));
// Plan feature "customHeroModel", flipped per test (real guard: lib/__tests__/plan-feature-guard.test.ts).
let customAllowed = true;
vi.mock("@/lib/plan-feature-guard", async () => {
  const { NextResponse } = await import("next/server");
  return {
    denyIfFeatureLocked: async () =>
      customAllowed ? null : NextResponse.json({ error: "Non inclus dans votre plan.", code: "PLAN_UPGRADE_REQUIRED", feature: "customHeroModel", upgrade: true }, { status: 402 }),
    isFeatureAllowed: async () => customAllowed,
  };
});
vi.mock("@/lib/activity-log", () => ({ logAction: vi.fn() }));
vi.mock("@/lib/after", () => ({ runAfter: (fn: () => unknown) => void fn() }));
vi.mock("@/lib/csrf", () => ({ verifyOrigin: () => null }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 4, resetAt: 0 }) }));
vi.mock("@/lib/club-public-settings", () => ({ invalidatePublicSettings: vi.fn() }));
const tenantMock = vi.fn();
vi.mock("@/lib/tenant", async (orig) => ({ ...(await orig<object>()), resolveTenantFromRequest: (...a: unknown[]) => tenantMock(...a) }));

beforeAll(() => {
  process.env.JWT_SECRET = "test-secret-do-not-use-in-production-0123456789";
});
const { generateToken, clearAccountCache } = await import("@/lib/auth");
const club = { id: "club_a", slug: "club-a", name: "Club A", status: "ACTIVE" };
const LOCKED = { themeId: "modern", heroModel: null, designLockedAt: new Date("2026-10-01"), premiumUnlocks: [], websiteSetupMode: "WIZARD" };

beforeEach(() => {
  vi.clearAllMocks();
  customAllowed = true;
  clearAccountCache();
  clubFindUnique.mockResolvedValue(club);
  tenantMock.mockResolvedValue({ ...club, customDomain: null });
  settingsFindUnique.mockResolvedValue({ clubId: "club_a", ...LOCKED });
  settingsUpdate.mockImplementation(async ({ data }: { data: object }) => ({ clubId: "club_a", ...data }));
  reqUpdateMany.mockResolvedValue({ count: 0 });
  reqFindMany.mockResolvedValue([]);
  reqFindFirst.mockResolvedValue(null);
  reqCreate.mockImplementation(async ({ data }: { data: object }) => ({ id: "r1", status: "PENDING", createdAt: new Date(), ...data }));
});

function as(role: string, clubId: string | null, url: string, method: string, body?: unknown) {
  userFindUnique.mockResolvedValue({ id: "u1", email: "o@x.test", role, name: "O", isActive: true, clubId });
  const token = generateToken({ id: "u1", email: "o@x.test", role, name: "O", clubId });
  return new NextRequest(`https://club-a.example.test${url}`, {
    method,
    headers: { host: "club-a.example.test", cookie: `token=${token}`, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
const owner = (url: string, method: string, body?: unknown) => as("OWNER", "club_a", url, method, body);
const ID = { params: Promise.resolve({ id: "r1" }) };

describe("POST /api/admin/design-change (owner files a request)", () => {
  it("creates a PENDING request for the SESSION's club, with only the requested change", async () => {
    const { POST } = await import("@/app/api/admin/design-change/route");
    const res = await POST(owner("/api/admin/design-change", "POST", { themeId: "boxing", reason: "Nouvelle identité de marque" }));
    expect(res.status).toBe(201);
    expect(reqCreate.mock.calls[0][0].data).toMatchObject({
      clubId: "club_a", requestedBy: "u1", requestedThemeId: "boxing", requestedHeroModel: null,
    });
  });

  it("ignores any client-supplied clubId: the strict schema rejects it, nothing is created", async () => {
    const { POST } = await import("@/app/api/admin/design-change/route");
    const res = await POST(owner("/api/admin/design-change", "POST", { clubId: "club_b", themeId: "boxing", reason: "Nouvelle identité de marque" }));
    expect(res.status).toBe(400);
    expect(reqCreate).not.toHaveBeenCalled();
  });

  it("refuses while the design is NOT locked yet (the owner can still edit freely)", async () => {
    settingsFindUnique.mockResolvedValue({ clubId: "club_a", ...LOCKED, designLockedAt: null });
    const { POST } = await import("@/app/api/admin/design-change/route");
    const res = await POST(owner("/api/admin/design-change", "POST", { themeId: "boxing", reason: "Nouvelle identité de marque" }));
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("NOT_LOCKED");
    expect(reqCreate).not.toHaveBeenCalled();
  });

  it("refuses a request that changes nothing, and an unknown theme", async () => {
    const { POST } = await import("@/app/api/admin/design-change/route");
    expect((await POST(owner("/api/admin/design-change", "POST", { themeId: "modern", reason: "Même thème qu'avant" }))).status).toBe(400);
    expect((await POST(owner("/api/admin/design-change", "POST", { themeId: "nope", reason: "Thème inexistant ici" }))).status).toBe(400);
    expect((await POST(owner("/api/admin/design-change", "POST", { reason: "Rien de demandé du tout" }))).status).toBe(400);
    expect(reqCreate).not.toHaveBeenCalled();
  });

  it("queues a formerly-Premium theme like any other: every theme is included in every plan", async () => {
    reqCreate.mockResolvedValue({ id: "r1", status: "PENDING" });
    const { POST } = await import("@/app/api/admin/design-change/route");
    const res = await POST(owner("/api/admin/design-change", "POST", { themeId: "gold", reason: "Nous voulons le thème doré" }));
    expect(res.status).toBe(201);
    expect(reqCreate).toHaveBeenCalled();
  });

  it("does not queue a request for the club's own 3D model when the plan does not include it (402)", async () => {
    customAllowed = false;
    const { POST } = await import("@/app/api/admin/design-change/route");
    const res = await POST(owner("/api/admin/design-change", "POST", { heroModel: "custom", reason: "Nous avons notre propre modèle" }));
    expect(res.status).toBe(402);
    expect((await res.json()).code).toBe("PLAN_UPGRADE_REQUIRED");
    expect(reqCreate).not.toHaveBeenCalled();
  });

  it("answers 409 when the one-open-request-per-club index fires (race / double click)", async () => {
    reqCreate.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "5" }));
    const { POST } = await import("@/app/api/admin/design-change/route");
    const res = await POST(owner("/api/admin/design-change", "POST", { themeId: "boxing", reason: "Nouvelle identité de marque" }));
    expect(res.status).toBe(409);
  });

  it("is owner-only", async () => {
    const { POST } = await import("@/app/api/admin/design-change/route");
    for (const role of ["ADMIN", "COACH", "MEMBER"]) {
      expect((await POST(as(role, "club_a", "/api/admin/design-change", "POST", { themeId: "boxing", reason: "Nouvelle identité de marque" }))).status).toBe(403);
    }
    expect(reqCreate).not.toHaveBeenCalled();
  });

  it("an owner of ANOTHER club cannot act on this host (tenant isolation)", async () => {
    const { POST } = await import("@/app/api/admin/design-change/route");
    const res = await POST(as("OWNER", "club_b", "/api/admin/design-change", "POST", { themeId: "boxing", reason: "Nouvelle identité de marque" }));
    expect(res.status).toBe(403);
    expect(reqCreate).not.toHaveBeenCalled();
  });
});

describe("POST /api/admin/design-change/apply (spend the one-time grant)", () => {
  const grant = { id: "g1", clubId: "club_a", requestedThemeId: "boxing", requestedHeroModel: null, status: "APPROVED" };

  it("409 when there is no approved grant", async () => {
    const { POST } = await import("@/app/api/admin/design-change/apply/route");
    const res = await POST(owner("/api/admin/design-change/apply", "POST", {}));
    expect(res.status).toBe(409);
    expect(settingsUpdate).not.toHaveBeenCalled();
  });

  it("looks the grant up for the session's club only, and applies exactly what was approved", async () => {
    reqFindFirst.mockResolvedValue(grant);
    const { POST } = await import("@/app/api/admin/design-change/apply/route");
    // the body is ignored: a client cannot widen the approval
    const res = await POST(owner("/api/admin/design-change/apply", "POST", { themeId: "neon", heroModel: "kettlebell", clubId: "club_b" }));
    expect(res.status).toBe(200);
    expect(reqFindFirst.mock.calls[0][0].where).toMatchObject({ clubId: "club_a", status: "APPROVED" });
    const call = settingsUpdate.mock.calls[0][0];
    expect(call.where).toEqual({ clubId: "club_a" });
    expect(call.data).toEqual({ themeId: "boxing", updatedBy: "u1" });
  });

  it("423 when the database trigger refuses (grant spent or expired between check and write)", async () => {
    reqFindFirst.mockResolvedValue(grant);
    settingsUpdate.mockRejectedValue(new Error("DESIGN_LOCKED: theme and 3D model are locked"));
    const { POST } = await import("@/app/api/admin/design-change/apply/route");
    const res = await POST(owner("/api/admin/design-change/apply", "POST", {}));
    expect(res.status).toBe(423);
  });

  it("applies a formerly-Premium model: included in every plan", async () => {
    reqFindFirst.mockResolvedValue({ ...grant, requestedThemeId: null, requestedHeroModel: "crown" });
    const { POST } = await import("@/app/api/admin/design-change/apply/route");
    const res = await POST(owner("/api/admin/design-change/apply", "POST", {}));
    expect(res.status).toBe(200);
    expect(settingsUpdate.mock.calls[0][0].data).toMatchObject({ heroModel: "crown" });
  });

  it("does not apply the club's own model when the plan does not include it, even with an approved grant (402)", async () => {
    customAllowed = false;
    reqFindFirst.mockResolvedValue({ ...grant, requestedThemeId: null, requestedHeroModel: "custom" });
    heroFindUnique.mockResolvedValue({ id: "h1" });
    const { POST } = await import("@/app/api/admin/design-change/apply/route");
    const res = await POST(owner("/api/admin/design-change/apply", "POST", {}));
    expect(res.status).toBe(402);
    expect(settingsUpdate).not.toHaveBeenCalled();
  });

  it("selecting 'custom' requires an uploaded model first", async () => {
    reqFindFirst.mockResolvedValue({ ...grant, requestedThemeId: null, requestedHeroModel: "custom" });
    heroFindUnique.mockResolvedValue(null);
    const { POST } = await import("@/app/api/admin/design-change/apply/route");
    expect((await POST(owner("/api/admin/design-change/apply", "POST", {}))).status).toBe(409);
    expect(settingsUpdate).not.toHaveBeenCalled();
  });
});

describe("PUT /api/admin/settings once the design is locked", () => {
  const put = (body: unknown) => owner("/api/admin/settings", "PUT", body);

  it("423 on a real theme or 3D-model change, nothing written", async () => {
    const { PUT } = await import("@/app/api/admin/settings/route");
    const a = await PUT(put({ themeId: "boxing" }));
    expect(a.status).toBe(423);
    expect((await a.json()).code).toBe("DESIGN_LOCKED");
    expect((await PUT(put({ heroModel: "kettlebell" }))).status).toBe(423);
    expect(settingsUpdate).not.toHaveBeenCalled();
  });

  it("re-sending the current theme / model (forms send everything) is fine and never rewrites them", async () => {
    settingsFindUnique.mockResolvedValue({ clubId: "club_a", ...LOCKED, themeId: "classic" }); // legacy id of "modern"
    const { PUT } = await import("@/app/api/admin/settings/route");
    const res = await PUT(put({ themeId: "modern", heroModel: null, name: "Nouveau nom" }));
    expect(res.status).toBe(200);
    const data = settingsUpdate.mock.calls[0][0].data;
    expect(data).toMatchObject({ name: "Nouveau nom" });
    expect(data).not.toHaveProperty("themeId");
    expect(data).not.toHaveProperty("heroModel");
  });

  it("DB trigger error surfaced as 423 even if the pre-check were bypassed", async () => {
    settingsFindUnique.mockResolvedValue({ clubId: "club_a", ...LOCKED, designLockedAt: null, websiteSetupMode: "WIZARD" });
    settingsUpdate.mockRejectedValue(new Error("DESIGN_LOCKED: x"));
    const { PUT } = await import("@/app/api/admin/settings/route");
    expect((await PUT(put({ themeId: "boxing" }))).status).toBe(423);
  });

  it("before the lock the owner changes freely; in wizard mode this does not lock yet", async () => {
    settingsFindUnique.mockResolvedValue({ clubId: "club_a", ...LOCKED, designLockedAt: null });
    const { PUT } = await import("@/app/api/admin/settings/route");
    expect((await PUT(put({ themeId: "boxing" }))).status).toBe(200);
    expect(settingsUpdate.mock.calls[0][0].data).toMatchObject({ themeId: "boxing" });
    expect(settingsUpdate.mock.calls[0][0].data).not.toHaveProperty("designLockedAt");
  });

  it("in manual mode the first saved theme choice locks the design", async () => {
    settingsFindUnique.mockResolvedValue({ clubId: "club_a", ...LOCKED, designLockedAt: null, websiteSetupMode: "MANUAL" });
    const { PUT } = await import("@/app/api/admin/settings/route");
    expect((await PUT(put({ themeId: "boxing" }))).status).toBe(200);
    expect(settingsUpdate.mock.calls[0][0].data.designLockedAt).toBeInstanceOf(Date);
  });
});

describe("SUPER_ADMIN review (PATCH /api/platform/design-requests/[id])", () => {
  const patch = (role: string, body: unknown) => as(role, role === "SUPER_ADMIN" ? null : "club_a", "/api/platform/design-requests/r1", "PATCH", body);

  it("only SUPER_ADMIN: owners cannot approve their own request", async () => {
    const { PATCH } = await import("@/app/api/platform/design-requests/[id]/route");
    for (const role of ["OWNER", "ADMIN", "MEMBER"]) expect((await PATCH(patch(role, { action: "approve" }), ID)).status).toBe(403);
    expect(reqUpdateMany).not.toHaveBeenCalled();
  });

  it("approve = conditional PENDING→APPROVED update with a 7-day expiry", async () => {
    reqFindUnique.mockResolvedValue({ id: "r1", clubId: "club_a", status: "PENDING" });
    reqUpdateMany.mockResolvedValue({ count: 1 });
    const { PATCH } = await import("@/app/api/platform/design-requests/[id]/route");
    const before = Date.now();
    const res = await PATCH(patch("SUPER_ADMIN", { action: "approve", note: "OK" }), ID);
    expect(res.status).toBe(200);
    const call = reqUpdateMany.mock.calls[0][0];
    expect(call.where).toEqual({ id: "r1", status: "PENDING" });
    expect(call.data.status).toBe("APPROVED");
    const ttl = call.data.expiresAt.getTime() - before;
    expect(ttl).toBeGreaterThan(6.99 * 86_400_000);
    expect(ttl).toBeLessThan(7.01 * 86_400_000);
  });

  it("reject sets no expiry; a second review of the same request is refused (409)", async () => {
    reqFindUnique.mockResolvedValue({ id: "r1", clubId: "club_a", status: "PENDING" });
    reqUpdateMany.mockResolvedValue({ count: 1 });
    const { PATCH } = await import("@/app/api/platform/design-requests/[id]/route");
    await PATCH(patch("SUPER_ADMIN", { action: "reject", note: "Non" }), ID);
    expect(reqUpdateMany.mock.calls[0][0].data).toMatchObject({ status: "REJECTED", expiresAt: null });

    reqUpdateMany.mockResolvedValue({ count: 0 });
    reqFindUnique.mockResolvedValue({ id: "r1", clubId: "club_a", status: "REJECTED" });
    expect((await PATCH(patch("SUPER_ADMIN", { action: "approve" }), ID)).status).toBe(409);
  });

  it("404 for an unknown request", async () => {
    reqFindUnique.mockResolvedValue(null);
    const { PATCH } = await import("@/app/api/platform/design-requests/[id]/route");
    expect((await PATCH(patch("SUPER_ADMIN", { action: "approve" }), ID)).status).toBe(404);
  });
});
