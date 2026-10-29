import { describe, it, expect } from "vitest";
import { getAppRelease, getPlayStoreUrl, isStableHttpsUrl } from "@/lib/app-release";

const SHA = "a".repeat(64);
const good = {
  ANDROID_APK_URL: "https://github.com/acme/clubx/releases/download/v1.0.0/clubx.apk",
  ANDROID_APK_VERSION: "1.0.0",
  ANDROID_APK_SHA256: SHA,
  ANDROID_APK_SIGNED: "true",
  ANDROID_APK_RELEASE_NOTES: "Première version | Photo de profil corrigée",
};

describe("getAppRelease", () => {
  it("offers the APK only when every field is present and attested", () => {
    const r = getAppRelease(good);
    expect(r.available).toBe(true);
    if (r.available) {
      expect(r.release.version).toBe("1.0.0");
      expect(r.release.notes).toEqual(["Première version", "Photo de profil corrigée"]);
    }
  });

  it("nothing configured → not available", () => {
    expect(getAppRelease({}).available).toBe(false);
  });

  it.each([
    ["no https", { ANDROID_APK_URL: "http://cdn.clubx.tn/clubx.apk" }],
    ["placeholder host", { ANDROID_APK_URL: "https://example.com/clubx.apk" }],
    ["local address", { ANDROID_APK_URL: "https://192.168.1.5/clubx.apk" }],
    ["credentials in URL", { ANDROID_APK_URL: "https://u:p@cdn.clubx.tn/clubx.apk" }],
    ["javascript scheme", { ANDROID_APK_URL: "javascript:alert(1)" }],
    ["bad version", { ANDROID_APK_VERSION: "latest" }],
    ["missing sha", { ANDROID_APK_SHA256: "" }],
    ["short sha", { ANDROID_APK_SHA256: "abc123" }],
    ["not attested signed", { ANDROID_APK_SIGNED: "yes" }],
    ["no release notes", { ANDROID_APK_RELEASE_NOTES: "  " }],
  ])("refuses: %s", (_name, override) => {
    const r = getAppRelease({ ...good, ...override });
    expect(r.available).toBe(false);
    if (!r.available) expect(r.reasons.length).toBeGreaterThan(0);
  });

  it("the legacy NEXT_PUBLIC_ vars alone never enable the button", () => {
    const r = getAppRelease({ NEXT_PUBLIC_ANDROID_APK_URL: good.ANDROID_APK_URL, NEXT_PUBLIC_ANDROID_APK_VERSION: "1.0.0" });
    expect(r.available).toBe(false);
  });

  it("strips a leading v from the version and ignores an unparsable date", () => {
    const r = getAppRelease({ ...good, ANDROID_APK_VERSION: "v1.2.3", ANDROID_APK_RELEASED_AT: "not a date" });
    expect(r.available && r.release.version).toBe("1.2.3");
    expect(r.available && r.release.releasedAt).toBeNull();
  });
});

describe("isStableHttpsUrl / getPlayStoreUrl", () => {
  it("accepts a real https host, rejects localhost and bare hosts", () => {
    expect(isStableHttpsUrl("https://cdn.clubx.tn/a.apk")).toBe(true);
    expect(isStableHttpsUrl("https://localhost/a.apk")).toBe(false);
    expect(isStableHttpsUrl("https://intranet/a.apk")).toBe(false);
  });
  it("accepts only play.google.com", () => {
    expect(getPlayStoreUrl({ ANDROID_PLAY_URL: "https://play.google.com/store/apps/details?id=com.clubx.mobile" })).toContain("play.google.com");
    expect(getPlayStoreUrl({ ANDROID_PLAY_URL: "https://evil.example.net/x" })).toBeNull();
    expect(getPlayStoreUrl({})).toBeNull();
  });
});
