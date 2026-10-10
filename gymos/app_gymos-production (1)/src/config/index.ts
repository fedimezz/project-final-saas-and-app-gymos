// One place for the things that change between environments.
//
// The platform API base URL comes from EXPO_PUBLIC_PLATFORM_API_BASE_URL
// (.env.local in dev, an EAS environment variable in builds) instead of being
// hardcoded: this repo is public, so no LAN IP or real backend host belongs
// in a committed file. Expo inlines EXPO_PUBLIC_* at bundle time — restart
// Metro with `npx expo start -c` after editing .env.local.
const rawBaseUrl = process.env.EXPO_PUBLIC_PLATFORM_API_BASE_URL?.trim();
if (!rawBaseUrl) {
  throw new Error(
    "Missing EXPO_PUBLIC_PLATFORM_API_BASE_URL — create a .env.local (see .env.example) and restart with `npx expo start -c`."
  );
}

/** Strips trailing slashes so `${base}${path}` never produces `//api/...`. */
export const normalizeBaseUrl = (url: string): string => url.trim().replace(/\/+$/, "");

/**
 * Production traffic carries bearer tokens and passwords, so it must be HTTPS.
 * Plain http:// is only tolerated in development (LAN backend on a phone).
 */
export const isSecureUrl = (url: string): boolean => /^https:\/\//i.test(url);
export const isAllowedUrl = (url: string): boolean => (__DEV__ ? /^https?:\/\//i.test(url) : isSecureUrl(url));

export const PLATFORM_API_BASE_URL = normalizeBaseUrl(rawBaseUrl);
if (!isAllowedUrl(PLATFORM_API_BASE_URL)) {
  throw new Error("EXPO_PUBLIC_PLATFORM_API_BASE_URL must be an https:// URL in production builds.");
}

// Optional, dev-only. /api/clubs/search returns each club's real apiBaseUrl
// (a per-club subdomain), which doesn't exist yet and can't be reached from
// a phone over a LAN. When set, searchClubs() replaces every result's
// apiBaseUrl with this value so search still works against a single local
// backend. No effect in production builds.
export const DEV_CLUB_API_BASE_URL = __DEV__
  ? process.env.EXPO_PUBLIC_DEV_CLUB_API_BASE_URL?.trim() || null
  : null;

// Sent on every request. The backend's login route only returns the raw JWT
// in the response body when it sees this header (app/api/auth/login/route.ts).
export const MOBILE_CLIENT_HEADER = { "x-client-type": "mobile-app" } as const;

/** Per-request network timeout. */
export const REQUEST_TIMEOUT_MS = 20_000;

// Secure (Keychain/Keystore): session only.
export const STORAGE_KEYS = {
  token: "gymos.token",
  clubApiBaseUrl: "gymos.clubApiBaseUrl",
  clubSlug: "gymos.clubSlug",
  clubName: "gymos.clubName",
  clubLogoUrl: "gymos.clubLogoUrl",
  // The Expo push token this device registered with the club's server, kept so
  // it can be unregistered on sign-out (while the session token still works).
  pushToken: "gymos.pushToken",
} as const;

// Plain AsyncStorage: not secret (public club directory info, UI memory).
export const PREF_KEYS = {
  savedClubs: "gymos.savedClubs.v1",
  lastClub: "gymos.lastClub.v1",
  homeClubSlug: "gymos.homeClubSlug.v1",
} as const;
