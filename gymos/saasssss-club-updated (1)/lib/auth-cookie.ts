// lib/auth-cookie.ts
//
// Everything about the session cookie's attributes lives here, in a file with
// NO server-only dependencies (no Prisma, no Node crypto) so that proxy.ts
// (Edge runtime) and the Node route handlers share exactly one definition.
//
// Why this matters: a cookie is only overwritten/deleted by a Set-Cookie with
// the SAME name + domain + path. Login used to set `Domain=.<host>` while
// logout deleted the cookie with no domain, so in production the browser kept
// the session after "logout". Every set/clear now goes through this file.

export const AUTH_COOKIE_NAME = "token";

export interface AuthCookieOptions {
  httpOnly: true;
  secure: boolean;
  sameSite: "lax";
  path: "/";
  domain?: string;
}

interface BuildOptions {
  /**
   * Host-only cookie (no Domain attribute): the browser sends it to the exact
   * host that set it and nowhere else. Used for SUPER_ADMIN sessions so a
   * platform-admin token is never sent to tenant subdomains.
   */
  hostOnly?: boolean;
}

function isLocalHostname(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)
  );
}

// IMPORTANT: secure cookies are silently dropped by the browser over
// plain http://. This checks the real request URL instead of trusting
// NODE_ENV blindly, so the cookie isn't lost on a local production build
// or a fresh deploy before HTTPS is configured.
export function buildAuthCookieOptions(
  requestUrl?: string,
  options: BuildOptions = {}
): AuthCookieOptions {
  const isHttps = requestUrl
    ? requestUrl.startsWith("https://")
    : process.env.NODE_ENV === "production";

  let cookieDomain: string | undefined;
  if (!options.hostOnly) {
    cookieDomain = process.env.COOKIE_DOMAIN?.trim() || undefined;
    if (!cookieDomain && requestUrl) {
      const hostname = new URL(requestUrl).hostname;
      if (!isLocalHostname(hostname) && hostname.includes(".")) {
        cookieDomain = `.${hostname}`;
      }
    }
  }

  return {
    httpOnly: true,
    secure: isHttps,
    sameSite: "lax",
    path: "/",
    ...(cookieDomain ? { domain: cookieDomain } : {}),
  };
}

/**
 * Cookie that must be READABLE on the platform apex even though it was SET
 * while responding to a request on a tenant subdomain — the one case is
 * Google OAuth: the flow starts on {slug}.host (the club's login page) but
 * Google always calls back on the single apex redirect_uri registered with
 * it. Domain=.<apex> is valid here because the apex is the registrable
 * parent of every tenant subdomain (same eTLD+1), which is exactly what the
 * cookie spec allows a subdomain to set for its parent.
 * Returns host-only options if APP_URL isn't configured (so it still "works"
 * — same-host only — rather than throwing) or on localhost.
 */
export function buildPlatformWideCookieOptions(): AuthCookieOptions {
  const raw = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (!raw) return { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/" };
  try {
    const hostname = new URL(raw).hostname.toLowerCase().replace(/^www\./, "");
    if (isLocalHostname(hostname)) {
      return { httpOnly: true, secure: false, sameSite: "lax", path: "/" };
    }
    return { httpOnly: true, secure: true, sameSite: "lax", path: "/", domain: `.${hostname}` };
  } catch {
    return { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/" };
  }
}

export const AUTH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};

interface CookieSink {
  cookies: {
    set: (name: string, value: string, options?: Record<string, unknown>) => unknown;
  };
  headers: Headers;
}

/** Sets the session cookie with the canonical attributes. */
export function setAuthCookie(
  response: CookieSink,
  token: string,
  requestUrl: string,
  options: { maxAgeSeconds: number; hostOnly?: boolean }
): void {
  response.cookies.set(AUTH_COOKIE_NAME, token, {
    ...buildAuthCookieOptions(requestUrl, { hostOnly: options.hostOnly }),
    maxAge: options.maxAgeSeconds,
  });
}

function expiredCookieHeader(name: string, opts: AuthCookieOptions): string {
  const parts = [
    `${name}=`,
    "Path=/",
    "Max-Age=0",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
    "HttpOnly",
    "SameSite=Lax",
  ];
  if (opts.secure) parts.push("Secure");
  if (opts.domain) parts.push(`Domain=${opts.domain}`);
  return parts.join("; ");
}

/**
 * Expires the session cookie in EVERY variant it may exist in: the exact
 * attributes login uses (Domain=.host or COOKIE_DOMAIN), and the host-only
 * variant (SUPER_ADMIN sessions, and cookies issued before this fix).
 * Emits one Set-Cookie header per variant.
 */
export function clearAuthCookie(
  response: { headers: Headers },
  requestUrl: string
): void {
  const shared = buildAuthCookieOptions(requestUrl);
  const hostOnly = buildAuthCookieOptions(requestUrl, { hostOnly: true });
  response.headers.append("Set-Cookie", expiredCookieHeader(AUTH_COOKIE_NAME, shared));
  if (shared.domain) {
    response.headers.append("Set-Cookie", expiredCookieHeader(AUTH_COOKIE_NAME, hostOnly));
  }
}
