import { describe, it, expect, vi, beforeEach } from "vitest";

const getAppRelease = vi.fn();
const getPlayStoreUrl = vi.fn();
vi.mock("@/lib/app-release", () => ({
  getAppRelease: () => getAppRelease(),
  getPlayStoreUrl: () => getPlayStoreUrl(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  process.env.APP_URL = "https://clubx.example";
});

describe("GET /api/app-download", () => {
  it("always points to the platform's /download page, built from APP_URL (not from the current host)", async () => {
    getAppRelease.mockReturnValue({ available: false });
    getPlayStoreUrl.mockReturnValue(null);
    const { GET } = await import("@/app/api/app-download/route");
    const json = await (await GET()).json();
    expect(json.downloadPageUrl).toBe("https://clubx.example/download");
    expect(json.apk).toBeNull();
    expect(json.playStoreUrl).toBeNull();
  });

  it("exposes the APK only for a complete, attested release", async () => {
    getAppRelease.mockReturnValue({ available: true, release: { url: "https://clubx.example/apk/clubx.apk", version: "1.2.0", sha256: "a".repeat(64) } });
    getPlayStoreUrl.mockReturnValue("https://play.google.com/store/apps/details?id=tn.clubx");
    const { GET } = await import("@/app/api/app-download/route");
    const res = await GET();
    const json = await res.json();
    expect(json.apk).toEqual({ url: "https://clubx.example/apk/clubx.apk", version: "1.2.0", sha256: "a".repeat(64) });
    expect(json.playStoreUrl).toContain("play.google.com");
    expect(res.headers.get("cache-control")).toBe("no-store");
  });
});
