/**
 * Website customization is saved per club: theme, 3D hero model and branding
 * (logo + colors) persist in GymSettings, only the OWNER can change them, and
 * the PUBLIC settings endpoint serves them back for that club only.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const userFindUnique = vi.fn();
const clubFindUnique = vi.fn();
const settingsFindUnique = vi.fn();
const settingsUpdate = vi.fn();
vi.mock("@/lib/prisma", () => ({
  default: {
    user: { findUnique: (...a: unknown[]) => userFindUnique(...a) },
    club: { findUnique: (...a: unknown[]) => clubFindUnique(...a) },
    gymSettings: {
      findUnique: (...a: unknown[]) => settingsFindUnique(...a),
      create: vi.fn(),
      update: (...a: unknown[]) => settingsUpdate(...a),
    },
  },
}));
vi.mock("@/lib/website-setup", () => ({ denyIfWebsiteLocked: async () => null }));
vi.mock("@/lib/activity-log", () => ({ logAction: vi.fn() }));
vi.mock("@/lib/club-public-settings", () => ({
  invalidatePublicSettings: vi.fn(),
  getPublicSettings: async () => ({ name: "Club A", themeId: "classic", heroModel: null, primaryColor: "#112233", secondaryColor: "#445566" }),
}));
const tenantMock = vi.fn();
vi.mock("@/lib/tenant", async (orig) => ({ ...(await orig<object>()), resolveTenantFromRequest: (...a: unknown[]) => tenantMock(...a) }));

beforeAll(() => {
  process.env.JWT_SECRET = "test-secret-do-not-use-in-production";
});
const { generateToken, clearAccountCache } = await import("@/lib/auth");
const club = { id: "club_a", slug: "club-a", name: "Club A", status: "ACTIVE" };

beforeEach(() => {
  vi.clearAllMocks();
  clearAccountCache();
  clubFindUnique.mockResolvedValue(club);
  settingsFindUnique.mockResolvedValue({ clubId: "club_a" });
  settingsUpdate.mockImplementation(async ({ data }: { data: object }) => ({ clubId: "club_a", ...data }));
  tenantMock.mockResolvedValue({ ...club, customDomain: null });
});

function put(role: string, body: unknown) {
  userFindUnique.mockResolvedValue({ id: "u1", email: "o@x.test", role, name: "O", isActive: true, clubId: club.id });
  const token = generateToken({ id: "u1", email: "o@x.test", role, name: "O", clubId: club.id });
  return new NextRequest("https://club-a.example.test/api/admin/settings", {
    method: "PUT",
    headers: { host: "club-a.example.test", cookie: `token=${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("PUT /api/admin/settings — theme, 3D model, branding", () => {
  it("persists theme, hero model, colors and logo for the owner's club", async () => {
    const { PUT } = await import("@/app/api/admin/settings/route");
    const logo = "https://res.cloudinary.com/demo/image/upload/logo.png";
    const res = await PUT(put("OWNER", { themeId: "boxing", heroModel: "kettlebell", primaryColor: "#dc2626", secondaryColor: "#facc15", logoUrl: logo }));
    expect(res.status).toBe(200);
    const call = settingsUpdate.mock.calls[0][0];
    expect(call.where).toEqual({ clubId: "club_a" });
    expect(call.data).toMatchObject({ themeId: "boxing", heroModel: "kettlebell", primaryColor: "#dc2626", secondaryColor: "#facc15", logoUrl: logo });
  });

  it("heroModel null resets to the theme's default object (null is NOT dropped)", async () => {
    const { PUT } = await import("@/app/api/admin/settings/route");
    await PUT(put("OWNER", { themeId: "yoga", heroModel: null }));
    expect(settingsUpdate.mock.calls[0][0].data).toHaveProperty("heroModel", null);
  });

  it("rejects unknown hero models and bad colors", async () => {
    const { PUT } = await import("@/app/api/admin/settings/route");
    expect((await PUT(put("OWNER", { heroModel: "rocket" }))).status).toBe(400);
    expect((await PUT(put("OWNER", { primaryColor: "red" }))).status).toBe(400);
    expect(settingsUpdate).not.toHaveBeenCalled();
  });

  it("is owner-only: regular admins and coaches cannot change the website", async () => {
    const { PUT } = await import("@/app/api/admin/settings/route");
    for (const role of ["ADMIN", "COACH", "MEMBER"]) {
      expect((await PUT(put(role, { themeId: "boxing" }))).status).toBe(403);
    }
    expect(settingsUpdate).not.toHaveBeenCalled();
  });
});

describe("GET /api/settings/public — what the club's site renders", () => {
  it("serves valid theme + hero model ids (legacy ids mapped, default model resolved)", async () => {
    const { GET } = await import("@/app/api/settings/public/route");
    const res = await GET(new NextRequest("https://club-a.example.test/api/settings/public", { headers: { host: "club-a.example.test" } }));
    const json = await res.json();
    expect(json.themeId).toBe("modern"); // legacy "classic"
    expect(json.heroModel).toBe("dumbbell"); // modern's default
    expect(json.primaryColor).toBe("#112233");
  });
});
