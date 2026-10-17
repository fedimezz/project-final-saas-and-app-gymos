/**
 * Custom 3D hero model: owner-only management, club taken from the SESSION
 * (never the request), strict server-side validation, tenant-scoped public
 * serving with safe headers, and "custom" can't be selected without a file.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const userFindUnique = vi.fn();
const clubFindUnique = vi.fn();
const heroFindUnique = vi.fn();
const heroUpsert = vi.fn();
const heroUpdate = vi.fn();
const heroDeleteMany = vi.fn();
const settingsUpdateMany = vi.fn();
const settingsFindUnique = vi.fn();
const settingsUpdate = vi.fn();
vi.mock("@/lib/prisma", () => {
  const prisma = {
    user: { findUnique: (...a: unknown[]) => userFindUnique(...a) },
    club: { findUnique: (...a: unknown[]) => clubFindUnique(...a) },
    clubHeroModel: {
      findUnique: (...a: unknown[]) => heroFindUnique(...a),
      upsert: (...a: unknown[]) => heroUpsert(...a),
      update: (...a: unknown[]) => heroUpdate(...a),
      deleteMany: (...a: unknown[]) => heroDeleteMany(...a),
    },
    gymSettings: {
      findUnique: (...a: unknown[]) => settingsFindUnique(...a),
      create: vi.fn(),
      update: (...a: unknown[]) => settingsUpdate(...a),
      updateMany: (...a: unknown[]) => settingsUpdateMany(...a),
    },
    $transaction: async (ops: unknown[]) => Promise.all(ops),
  };
  return { default: prisma };
});
vi.mock("@/lib/website-setup", () => ({ denyIfWebsiteLocked: async () => null }));
vi.mock("@/lib/activity-log", () => ({ logAction: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: async () => ({ allowed: true, remaining: 9, resetAt: 0 }) }));
vi.mock("@/lib/club-public-settings", () => ({ invalidatePublicSettings: vi.fn(), getPublicSettings: async () => null }));
const tenantMock = vi.fn();
vi.mock("@/lib/tenant", async (orig) => ({ ...(await orig<object>()), resolveTenantFromRequest: (...a: unknown[]) => tenantMock(...a) }));

beforeAll(() => {
  process.env.JWT_SECRET = "test-secret-do-not-use-in-production";
});
const { generateToken, clearAccountCache } = await import("@/lib/auth");
const admin = await import("../admin/hero-model/route");
const pub = await import("../hero-model/route");
const settingsRoute = await import("../admin/settings/route");

const club = { id: "club_a", slug: "club-a", name: "Club A", status: "ACTIVE" };
const enc = new TextEncoder();

function glb(): Uint8Array {
  const json = enc.encode(JSON.stringify({
    asset: { version: "2.0" }, nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }], accessors: [{ count: 30 }],
  }).padEnd(200));
  const out = new Uint8Array(20 + json.length);
  const v = new DataView(out.buffer);
  v.setUint32(0, 0x46546c67, true); v.setUint32(4, 2, true); v.setUint32(8, out.length, true);
  v.setUint32(12, json.length, true); v.setUint32(16, 0x4e4f534a, true); out.set(json, 20);
  return out;
}

function authed(role: string, method: string, body?: BodyInit, extra: Record<string, string> = {}, url = "https://club-a.example.test/api/admin/hero-model") {
  userFindUnique.mockResolvedValue({ id: "u1", email: "o@x.test", role, name: "O", isActive: true, clubId: club.id });
  const token = generateToken({ id: "u1", email: "o@x.test", role, name: "O", clubId: club.id });
  return new NextRequest(url, { method, headers: { host: "club-a.example.test", cookie: `token=${token}`, ...extra }, body });
}
function upload(role: string, name: string, bytes: Uint8Array) {
  const form = new FormData();
  form.append("file", new File([bytes as BlobPart], name));
  return authed(role, "POST", form);
}
const META = {
  fileName: "m.glb", format: "glb", contentType: "model/gltf-binary", byteSize: 220, sha256: "a".repeat(64),
  scale: 1, rotationX: 0, rotationY: 0, rotationZ: 0, positionX: 0, positionY: 0, positionZ: 0, autoRotate: true, updatedAt: new Date(),
};

beforeEach(() => {
  vi.clearAllMocks();
  clearAccountCache();
  clubFindUnique.mockResolvedValue(club);
  settingsFindUnique.mockResolvedValue({ clubId: "club_a" });
  tenantMock.mockResolvedValue({ ...club, customDomain: null });
  heroUpsert.mockResolvedValue({ id: "h1" });
  heroDeleteMany.mockResolvedValue({ count: 1 });
  settingsUpdateMany.mockResolvedValue({ count: 1 });
  settingsUpdate.mockImplementation(async ({ data }: { data: object }) => ({ clubId: "club_a", ...data }));
});

describe("POST /api/admin/hero-model", () => {
  it("stores a valid .glb for the SESSION's club only", async () => {
    heroFindUnique.mockResolvedValueOnce(null).mockResolvedValue(META);
    const res = await admin.POST(upload("OWNER", "m.glb", glb()));
    expect(res.status).toBe(201);
    const call = heroUpsert.mock.calls[0][0];
    expect(call.where).toEqual({ clubId: "club_a" });
    expect(call.create).toMatchObject({ clubId: "club_a", format: "glb", contentType: "model/gltf-binary" });
    expect(call.create.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect((await res.json()).model.url).toMatch(/^\/api\/hero-model\?v=/);
  });

  it("ignores a clubId smuggled in the request", async () => {
    heroFindUnique.mockResolvedValue(null);
    const form = new FormData();
    form.append("file", new File([glb() as BlobPart], "m.glb"));
    form.append("clubId", "club_evil");
    await admin.POST(authed("OWNER", "POST", form, {}, "https://club-a.example.test/api/admin/hero-model?clubId=club_evil"));
    expect(heroUpsert.mock.calls[0][0].where).toEqual({ clubId: "club_a" });
  });

  it("rejects fake / invalid / oversized files with a clear 400/413", async () => {
    let res = await admin.POST(upload("OWNER", "m.glb", enc.encode("<html>".padEnd(64))));
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("glb_magic");
    res = await admin.POST(upload("OWNER", "m.png", glb()));
    expect(res.status).toBe(400);
    res = await admin.POST(authed("OWNER", "POST", new FormData(), { "content-length": String(500 * 1024 * 1024) }));
    expect(res.status).toBe(413);
    expect(heroUpsert).not.toHaveBeenCalled();
  });

  it("is owner-only (admins, coaches, members and anonymous are refused)", async () => {
    for (const role of ["ADMIN", "COACH", "MEMBER"]) {
      clearAccountCache(); // same user id, different role each time
      expect((await admin.POST(upload(role, "m.glb", glb()))).status).toBe(403);
    }
    const anon = new NextRequest("https://club-a.example.test/api/admin/hero-model", { method: "POST", headers: { host: "club-a.example.test" } });
    expect([401, 403]).toContain((await admin.POST(anon)).status);
    expect(heroUpsert).not.toHaveBeenCalled();
  });
});

describe("PUT / DELETE /api/admin/hero-model", () => {
  const put = (body: unknown) => authed("OWNER", "PUT", JSON.stringify(body), { "content-type": "application/json" });

  it("validates placement ranges and updates the session's club", async () => {
    heroFindUnique.mockResolvedValue({ id: "h1", ...META });
    heroUpdate.mockResolvedValue({ id: "h1" });
    const ok = { scale: 1.5, rotation: { x: 0, y: 90, z: 0 }, position: { x: 0.5, y: 0, z: 0 }, autoRotate: false };
    expect((await admin.PUT(put(ok))).status).toBe(200);
    expect(heroUpdate.mock.calls[0][0]).toMatchObject({ where: { clubId: "club_a" }, data: { scale: 1.5, rotationY: 90, autoRotate: false } });
    expect((await admin.PUT(put({ ...ok, scale: 50 }))).status).toBe(400);
    expect((await admin.PUT(put({ scale: 1 }))).status).toBe(400);
  });

  it("returns 404 when there is nothing to adjust", async () => {
    heroFindUnique.mockResolvedValue(null);
    const body = { scale: 1, rotation: { x: 0, y: 0, z: 0 }, position: { x: 0, y: 0, z: 0 }, autoRotate: true };
    expect((await admin.PUT(put(body))).status).toBe(404);
  });

  it("DELETE removes the file and resets a 'custom' selection", async () => {
    const res = await admin.DELETE(authed("OWNER", "DELETE"));
    expect(res.status).toBe(200);
    expect(heroDeleteMany).toHaveBeenCalledWith({ where: { clubId: "club_a" } });
    expect(settingsUpdateMany).toHaveBeenCalledWith({ where: { clubId: "club_a", heroModel: "custom" }, data: { heroModel: null } });
    clearAccountCache(); // same user id, different role below
    expect((await admin.DELETE(authed("ADMIN", "DELETE"))).status).toBe(403);
  });
});

describe("PUT /api/admin/settings — selecting the custom model", () => {
  const select = (heroModel: string | null) =>
    authed("OWNER", "PUT", JSON.stringify({ heroModel }), { "content-type": "application/json" }, "https://club-a.example.test/api/admin/settings");

  it("refuses 'custom' until a model is uploaded, accepts it afterwards, and accepts 'none'", async () => {
    heroFindUnique.mockResolvedValueOnce(null);
    expect((await settingsRoute.PUT(select("custom"))).status).toBe(400);
    heroFindUnique.mockResolvedValueOnce({ id: "h1" });
    expect((await settingsRoute.PUT(select("custom"))).status).toBe(200);
    expect(settingsUpdate.mock.calls.at(-1)?.[0].data).toMatchObject({ heroModel: "custom" });
    expect((await settingsRoute.PUT(select("none"))).status).toBe(200);
    expect((await settingsRoute.PUT(select("rocket"))).status).toBe(400);
  });
});

describe("GET /api/hero-model (public, tenant-scoped)", () => {
  const get = (qs = "", headers: Record<string, string> = {}) =>
    new NextRequest(`https://club-a.example.test/api/hero-model${qs}`, { headers: { host: "club-a.example.test", ...headers } });

  it("serves the host's club file with safe headers and immutable caching for the versioned URL", async () => {
    const bytes = glb();
    heroFindUnique.mockImplementation(async ({ select }: { select: Record<string, boolean> }) =>
      select.data ? { data: Buffer.from(bytes) } : { sha256: "a".repeat(64), contentType: "model/gltf-binary", format: "glb" });
    const res = await pub.GET(get(`?v=${"a".repeat(16)}`));
    expect(res.status).toBe(200);
    expect(heroFindUnique.mock.calls[0][0].where).toEqual({ clubId: "club_a" }); // from the host, nothing else
    expect(res.headers.get("content-type")).toBe("model/gltf-binary");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("content-security-policy")).toContain("sandbox");
    expect(res.headers.get("cache-control")).toContain("immutable");
    expect(new Uint8Array(await res.arrayBuffer()).byteLength).toBe(bytes.byteLength);
  });

  it("does not trust a clubId in the URL and revalidates unversioned requests", async () => {
    heroFindUnique.mockResolvedValue({ sha256: "a".repeat(64), contentType: "model/gltf-binary", format: "glb", data: Buffer.from(glb()) });
    const res = await pub.GET(get("?clubId=club_evil&club=club_evil"));
    expect(heroFindUnique.mock.calls[0][0].where).toEqual({ clubId: "club_a" });
    expect(res.headers.get("cache-control")).toContain("must-revalidate");
  });

  it("answers 304 when the ETag matches (without loading the file)", async () => {
    heroFindUnique.mockResolvedValue({ sha256: "a".repeat(64), contentType: "model/gltf-binary", format: "glb" });
    const res = await pub.GET(get("", { "if-none-match": `"${"a".repeat(64)}"` }));
    expect(res.status).toBe(304);
    expect(heroFindUnique).toHaveBeenCalledTimes(1);
  });

  it("404s for no tenant or a club without a model", async () => {
    tenantMock.mockResolvedValueOnce(null);
    expect((await pub.GET(get())).status).toBe(404);
    heroFindUnique.mockResolvedValue(null);
    expect((await pub.GET(get())).status).toBe(404);
  });
});
