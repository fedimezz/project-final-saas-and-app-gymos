/**
 * Billing upgrade gate, reserved slugs, upload restrictions.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

const requireOwner = vi.fn();
const requireUser = vi.fn();
vi.mock("@/lib/auth", async (orig) => {
  const real = await orig<typeof import("@/lib/auth")>();
  return { ...real, requireOwner: (...a: unknown[]) => requireOwner(...a), requireUser: (...a: unknown[]) => requireUser(...a) };
});
vi.mock("@/lib/activity-log", () => ({ logAction: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 5, resetAt: 0 }),
  getClientIp: () => "1.2.3.4",
}));

const clubFindUnique = vi.fn();
const saasPlanFindFirst = vi.fn();
const upload = vi.fn();
vi.mock("@/lib/prisma", () => ({
  default: {
    club: { findUnique: (...a: unknown[]) => clubFindUnique(...a) },
    saasPlan: { findFirst: (...a: unknown[]) => saasPlanFindFirst(...a), findUnique: (...a: unknown[]) => saasPlanFindFirst(...a) },
    clubSubscription: { update: vi.fn(), upsert: vi.fn() },
    $transaction: vi.fn(),
  },
}));
vi.mock("@/lib/cloudinary", () => ({
  isCloudinaryConfigured: true,
  uploadBufferToCloudinary: (...a: unknown[]) => upload(...a),
}));

beforeEach(() => {
  vi.clearAllMocks();
  clubFindUnique.mockResolvedValue(null);
  upload.mockResolvedValue({ secure_url: "https://cdn.test/x.png", resource_type: "image" });
});
afterEach(() => vi.unstubAllEnvs());

describe("POST /api/billing/upgrade legacy route", () => {
  it("is disabled in every environment and never reaches auth or the DB", async () => {
    const { POST } = await import("@/app/api/billing/upgrade/route");
    const res = await POST();

    expect(res.status).toBe(410);
    expect(requireOwner).not.toHaveBeenCalled();
    expect(saasPlanFindFirst).not.toHaveBeenCalled();
  });
});

describe("reserved slugs", () => {
  it.each(["admin", "billing", "mail", "support", "www", "api"])("check-slug reports %s unavailable", async (slug) => {
    const { GET } = await import("@/app/api/onboarding/check-slug/route");
    const res = await GET(new NextRequest(`https://yoursaas.test/api/onboarding/check-slug?slug=${slug}`));
    const json = await res.json();
    expect(json.available).toBe(false);
    expect(clubFindUnique).not.toHaveBeenCalled();
  });

  it("check-slug still reports a free, valid slug as available", async () => {
    const { GET } = await import("@/app/api/onboarding/check-slug/route");
    const res = await GET(new NextRequest("https://yoursaas.test/api/onboarding/check-slug?slug=fit-club-sousse"));
    expect((await res.json()).available).toBe(true);
  });

  it("create-club refuses reserved names with a 400 before touching the DB", async () => {
    const { POST } = await import("@/app/api/onboarding/create-club/route");
    const res = await POST(
      new NextRequest("https://yoursaas.test/api/onboarding/create-club", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clubName: "Evil Club", slug: "billing", ownerName: "Eve Evil",
          email: "eve@evil.test", password: "Str0ng-pass-123", phone: "20123456",
        }),
      })
    );
    expect(res.status).toBe(400);
    expect(clubFindUnique).not.toHaveBeenCalled();
  });
});

describe("POST /api/upload", () => {
  const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64)]);
  const asUser = (role: string) =>
    requireUser.mockResolvedValue({ ok: true, user: { id: "u1", role, name: "U", email: "u@x.test", clubId: "club-42" } });

  const uploadReq = (file: File) => {
    const fd = new FormData();
    fd.set("file", file);
    return new NextRequest("https://club-a.test/api/upload", { method: "POST", body: fd });
  };
  const call = async (file: File) => (await import("@/app/api/upload/route")).POST(uploadReq(file));

  it("a member can upload an image, into a per-club folder (not the shared hardcoded one)", async () => {
    asUser("MEMBER");
    const res = await call(new File([PNG], "a.png", { type: "image/png" }));
    expect(res.status).toBeLessThan(300);
    expect(upload.mock.calls[0][1]).toMatchObject({ folder: "clubs/club-42" });
  });

  it("a member CANNOT upload video or audio", async () => {
    asUser("MEMBER");
    const res = await call(new File([Buffer.alloc(1024)], "v.mp4", { type: "video/mp4" }));
    expect(res.status).toBe(403);
    expect(upload).not.toHaveBeenCalled();
  });

  it("a member's image is capped at 5MB (staff get 10MB)", async () => {
    const big = Buffer.concat([PNG, Buffer.alloc(6 * 1024 * 1024)]);
    asUser("MEMBER");
    expect((await call(new File([big], "big.png", { type: "image/png" }))).status).toBe(413);
    asUser("ADMIN");
    expect((await call(new File([big], "big.png", { type: "image/png" }))).status).toBeLessThan(300);
  });

  it("staff can upload video", async () => {
    asUser("ADMIN");
    upload.mockResolvedValue({ secure_url: "https://cdn.test/v.mp4", resource_type: "video" });
    const res = await call(new File([Buffer.alloc(1024)], "v.mp4", { type: "video/mp4" }));
    expect(res.status).toBeLessThan(300);
  });

  it("rejects a non-image that only CLAIMS to be image/png (magic-byte check)", async () => {
    asUser("MEMBER");
    const res = await call(new File([Buffer.from("<script>alert(1)</script>............")], "x.png", { type: "image/png" }));
    expect(res.status).toBe(400);
    expect(upload).not.toHaveBeenCalled();
  });

  it("refuses an oversized body from Content-Length alone, before parsing it", async () => {
    asUser("MEMBER");
    const { POST } = await import("@/app/api/upload/route");
    const res = await POST(
      new NextRequest("https://club-a.test/api/upload", {
        method: "POST",
        headers: { "content-length": String(500 * 1024 * 1024), "content-type": "multipart/form-data; boundary=x" },
        body: "x",
      })
    );
    expect(res.status).toBe(413);
  });

  it("rejects an oversized streamed body even when Content-Length is absent", async () => {
    asUser("MEMBER");
    const { POST } = await import("@/app/api/upload/route");
    const res = await POST(
      new NextRequest("https://club-a.test/api/upload", {
        method: "POST",
        headers: { "content-type": "multipart/form-data; boundary=x" },
        body: "x".repeat(5 * 1024 * 1024 + 65 * 1024),
      })
    );
    expect(res.status).toBe(413);
  });
});
