// lib/app-release.ts
//
// Decides whether the website may offer an Android APK download. The rule from the brief:
// the button appears ONLY for a real, signed APK on a stable HTTPS URL — never for a placeholder.
//
// We cannot inspect the APK from here, so "real and signed" is an explicit statement by whoever
// publishes it: every field below must be set, and ANDROID_APK_SIGNED must be exactly "true"
// (the publisher's attestation that the file is a release-signed build that was installed on a real
// device). Anything missing or suspicious → the page shows "coming soon" instead of a button.
//
// Env (server-side; read per request, no NEXT_PUBLIC_ needed):
//   ANDROID_APK_URL            https URL of the .apk (a GitHub Release asset or your own storage)
//   ANDROID_APK_VERSION        semantic version, e.g. 1.0.0
//   ANDROID_APK_SHA256         64-hex SHA-256 of the file (`sha256sum clubx.apk`) — shown so users can verify
//   ANDROID_APK_SIGNED         "true" = release-signed build, tested on a real device
//   ANDROID_APK_RELEASE_NOTES  short notes; separate items with "|"
//   ANDROID_APK_RELEASED_AT    optional ISO date (2026-11-02)
//   ANDROID_PLAY_URL           optional Google Play listing (shown instead of the APK when set)
// The legacy NEXT_PUBLIC_ANDROID_APK_URL / _VERSION names are still read for the URL and version only;
// they never enable the button on their own.

export interface AppRelease {
  url: string;
  version: string;
  sha256: string;
  notes: string[];
  releasedAt: string | null;
}

export type AppReleaseStatus =
  | { available: true; release: AppRelease }
  | { available: false; reasons: string[] };

const SEMVER = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;
const SHA256 = /^[a-f0-9]{64}$/i;
const PLACEHOLDER_HOST = /(^|\.)(example\.(com|org|net)|localhost|invalid|test)$|replace-with|your-?domain|yourdomain/i;
const LOCAL_HOST = /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|0\.0\.0\.0$)|\.local$/;

/** True for an https URL on a real-looking public host. */
export function isStableHttpsUrl(value: string): boolean {
  let u: URL;
  try {
    u = new URL(value);
  } catch {
    return false;
  }
  if (u.protocol !== "https:") return false;
  if (u.username || u.password) return false;
  if (PLACEHOLDER_HOST.test(u.hostname) || LOCAL_HOST.test(u.hostname)) return false;
  if (!u.hostname.includes(".")) return false;
  return true;
}

export function getAppRelease(env: Record<string, string | undefined> = process.env): AppReleaseStatus {
  const url = (env.ANDROID_APK_URL || env.NEXT_PUBLIC_ANDROID_APK_URL || "").trim();
  const version = (env.ANDROID_APK_VERSION || env.NEXT_PUBLIC_ANDROID_APK_VERSION || "").trim().replace(/^v/i, "");
  const sha256 = (env.ANDROID_APK_SHA256 || "").trim();
  const signed = (env.ANDROID_APK_SIGNED || "").trim() === "true";
  const notes = (env.ANDROID_APK_RELEASE_NOTES || "")
    .split("|")
    .map((n) => n.trim())
    .filter(Boolean)
    .slice(0, 8);
  const releasedRaw = (env.ANDROID_APK_RELEASED_AT || "").trim();
  const releasedAt = releasedRaw && !Number.isNaN(Date.parse(releasedRaw)) ? releasedRaw : null;

  const reasons: string[] = [];
  if (!url) reasons.push("ANDROID_APK_URL is not set");
  else if (!isStableHttpsUrl(url)) reasons.push("ANDROID_APK_URL must be a public https URL (no placeholder / local address)");
  if (!SEMVER.test(version)) reasons.push("ANDROID_APK_VERSION must look like 1.0.0");
  if (!SHA256.test(sha256)) reasons.push("ANDROID_APK_SHA256 must be the 64-character SHA-256 of the file");
  if (!signed) reasons.push('ANDROID_APK_SIGNED must be "true" (release-signed build tested on a real device)');
  if (notes.length === 0) reasons.push("ANDROID_APK_RELEASE_NOTES is empty");

  if (reasons.length > 0) return { available: false, reasons };
  return { available: true, release: { url, version, sha256: sha256.toLowerCase(), notes, releasedAt } };
}

/** Optional Google Play listing; only an https play.google.com URL is accepted. */
export function getPlayStoreUrl(env: Record<string, string | undefined> = process.env): string | null {
  const v = (env.ANDROID_PLAY_URL || "").trim();
  try {
    const u = new URL(v);
    return u.protocol === "https:" && u.hostname === "play.google.com" ? u.toString() : null;
  } catch {
    return null;
  }
}
