// proxy.ts — Next.js 16 Edge proxy (replaces middleware.ts)
//
// Responsibilities:
//   1. JWT auth guard — protects /admin, /dashboard, /api/admin, /api/dashboard.
//   2. Tenant slug injection — extracts subdomain from Host header and forwards
//      it as X-Club-Slug so every route handler can call
//      resolveTenantFromRequest() without re-parsing the host.
//   3. SUPER_ADMIN routing — redirects to /platform, never to a gym.
//   4. Owner-only page guards — /admin/promotions, /admin/roles, etc.
//
// What this does NOT do:
//   - DB calls (Edge Runtime can't use Prisma's Node.js engine). All tenant/
//     clubId DB verification happens in route handlers via lib/auth.ts's
//     requireX() functions — those are the real security boundary.

import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { verifyOrigin } from "@/lib/csrf";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
// Note: lib/logger uses console internally — safe in Edge Runtime
import { log } from "@/lib/logger";
import { extractSlugFromHost } from "@/lib/host";
import { clearAuthCookie, AUTH_COOKIE_NAME } from "@/lib/auth-cookie";

// General write-rate-limit for authenticated API requests, applied centrally
// (Phase 10 — "rate-limit sur toutes les routes write") rather than added
// to each of the ~50 write handlers individually: one place to get right,
// can't be forgotten on a new route. Auth endpoints (login, register, etc.)
// keep their own tighter, per-IP limits inside their handlers — this is a
// coarser backstop for everything else, keyed by user id once a JWT is
// verified below.
const WRITE_LIMIT = 60;
const WRITE_WINDOW_MS = 60 * 1000;
const isDev = process.env.NODE_ENV === "development";

function buildCsp(nonce: string, host: string): string {
  const sources = new Set(["'self'"]);
  const rawAppUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (rawAppUrl) {
    try {
      const appUrl = new URL(rawAppUrl);
      const port = appUrl.port ? `:${appUrl.port}` : "";
      sources.add(`${appUrl.protocol}//${appUrl.hostname.replace(/^www\./, "")}${port}`);
      sources.add(`${appUrl.protocol}//*.${appUrl.hostname.replace(/^www\./, "")}${port}`);
    } catch {
      // Invalid app URL does not expand the frame allowlist.
    }
  }
  if (isDev) {
    sources.add("http://localhost:*");
    sources.add("http://*.localhost:*");
  }
  const hostName = host.split(":")[0].toLowerCase();
  if (hostName && hostName !== "localhost" && !hostName.endsWith(".localhost")) {
    sources.add(`https://${hostName}`);
  }
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://res.cloudinary.com https://images.unsplash.com",
    "font-src 'self' data:",
    "connect-src 'self' blob: data:",
    "worker-src 'self' blob:",
    "media-src 'self' https://res.cloudinary.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    `frame-src ${[...sources].join(" ")}`,
    `frame-ancestors ${[...sources].join(" ")}`,
  ].join("; ");
}

const JWT_SECRET = process.env.JWT_SECRET;

interface MiddlewareJWTPayload {
  id: string;
  email: string;
  role: string;
  name: string;
  clubId: string | null;
}

const isWriteMethod = (method: string) => !["GET", "HEAD", "OPTIONS"].includes(method);
const getBearerToken = (request: NextRequest) => {
  const authorization = request.headers.get("authorization");
  return authorization?.startsWith("Bearer ") ? authorization.slice(7) : null;
};

// Shared by the protected and the public-write paths below. Fails open on a
// limiter error: a Redis outage shouldn't take down every write (the limiter
// itself already falls back to in-memory before it ever throws).
async function writeRateLimited(key: string): Promise<NextResponse | null> {
  const rl = await checkRateLimit(key, WRITE_LIMIT, WRITE_WINDOW_MS).catch(() => ({
    allowed: process.env.NODE_ENV !== "production",
    remaining: 0,
    resetAt: Date.now() + WRITE_WINDOW_MS,
  }));
  if (rl.allowed) return null;
  return NextResponse.json(
    { error: "Trop de requêtes, veuillez réessayer dans un instant." },
    { status: 429 }
  );
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const pageNonce = pathname.startsWith("/api/") ? null : btoa(crypto.randomUUID());
  const pageCsp = pageNonce ? buildCsp(pageNonce, request.headers.get("host") ?? "") : null;

  // ── CSRF — Origin check, every non-GET /api/* request ──────────────────────
  // Centralized here instead of duplicated in all ~50 write route handlers:
  // one place to get right, impossible to forget on a new route, and it runs
  // before any auth/DB work so a cross-site write is rejected as cheaply as
  // possible. See lib/csrf.ts for why this checks "same base domain or a
  // subdomain of it" rather than the continuation prompt's literal regex
  // (that regex assumes APP_URL already has a subdomain to strip, which
  // breaks for this app's apex-domain config and would reject every
  // legitimate per-club subdomain origin).
  if (
    pathname.startsWith("/api/") &&
    !["GET", "HEAD", "OPTIONS"].includes(request.method)
  ) {
    const csrfError = verifyOrigin(request);
    if (csrfError) return csrfError;
  }

  // ── Tenant slug — inject on every request ──────────────────────────────────
  const host = request.headers.get("host") ?? "";
  const slug = extractSlugFromHost(host);

  // Helper that returns a NextResponse.next() with the club slug header added.
  // For OAuth callback routes we intentionally skip the dev URL rewrite:
  // NextResponse.rewrite() in Edge Runtime can drop cookies that were set
  // on the initiating response (the google_oauth_state CSRF cookie), causing
  // a state mismatch. Header injection is sufficient — the route handler reads
  // x-club-slug via resolveTenantFromRequest(), same as production.
  const isOAuthCallback = pathname.startsWith("/api/auth/callback/");
  const nextWithSlug = (extraHeaders?: Record<string, string>) => {
    const headers = new Headers(request.headers);
    if (slug) headers.set("x-club-slug", slug);
    if (pageNonce && pageCsp) {
      headers.set("x-nonce", pageNonce);
      headers.set("Content-Security-Policy", pageCsp);
    }
    if (extraHeaders) {
      for (const [k, v] of Object.entries(extraHeaders)) headers.set(k, v);
    }
    if (slug && process.env.NODE_ENV !== "production" && !isOAuthCallback) {
      const rewrittenUrl = request.nextUrl.clone();
      rewrittenUrl.searchParams.set("club", slug);
      const response = NextResponse.rewrite(rewrittenUrl, { request: { headers } });
      if (pageCsp) response.headers.set("Content-Security-Policy", pageCsp);
      return response;
    }
    const response = NextResponse.next({ request: { headers } });
    if (pageCsp) response.headers.set("Content-Security-Policy", pageCsp);
    return response;
  };

  // ── Static / auth / public routes — skip auth check ───────────────────────
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/settings/public") ||
    pathname.startsWith("/api/plans/public") ||
    pathname.startsWith("/api/coaches/public") ||
    pathname.startsWith("/api/promotions/public") ||
    pathname.startsWith("/api/schedule/public") ||
    pathname.startsWith("/api/content/public") ||
    pathname.startsWith("/api/payments/country") ||
    pathname.startsWith("/api/payments/stripe/webhook") ||
    pathname.startsWith("/api/sse") ||
    pathname === "/platform/login"
  ) {
    return nextWithSlug();
  }

  const isApiRoute = pathname.startsWith("/api/");
  const isPlatformPath =
    pathname.startsWith("/platform") || pathname.startsWith("/api/platform");
  const isProtected =
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/api/dashboard") ||
    pathname.startsWith("/api/admin") ||
    isPlatformPath;

  // Public pages — no auth needed, still inject slug.
  //
  // Writes to API routes OUTSIDE the protected prefixes (/api/upload,
  // /api/posts, /api/billing, /api/bookings, onboarding, ...) used to skip the
  // central write limiter entirely, because it only ran further down for
  // /admin, /dashboard and /platform. They authenticate inside their own
  // handlers, so here we only need a rate-limit key: the user id when the
  // session cookie verifies, else the client IP. Cron routes authenticate with
  // a bearer secret and are exempt.
  if (!isProtected) {
    if (isApiRoute && isWriteMethod(request.method) && !pathname.startsWith("/api/cron")) {
      let key = `write-ip:${getClientIp(request)}`;
      const requestToken = request.cookies.get(AUTH_COOKIE_NAME)?.value ?? getBearerToken(request);
      if (requestToken && JWT_SECRET) {
        try {
          const { payload } = await jwtVerify(requestToken, new TextEncoder().encode(JWT_SECRET));
          if (typeof payload.id === "string") key = `write:${payload.id}`;
        } catch {
          /* invalid token: keep the IP key, the route's own auth will reject it */
        }
      }
      const limited = await writeRateLimited(key);
      if (limited) return limited;
    }
    return nextWithSlug();
  }

  // ── Auth check ─────────────────────────────────────────────────────────────
  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value ?? (isApiRoute ? getBearerToken(request) : null);

  if (!token) {
    log.warn("proxy_401_unauthenticated", { path: request.nextUrl.pathname });
    if (isApiRoute) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    const loginUrl = new URL(
      "/user/login",
      request.url
    );
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (!JWT_SECRET) {
    console.error("JWT_SECRET is not set; denying access in proxy.");
    if (isApiRoute) return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
    return NextResponse.redirect(new URL("/platform/login", request.url));
  }

  try {
    const secretKey = new TextEncoder().encode(JWT_SECRET);
    const { payload } = await jwtVerify(token, secretKey);
    const typedPayload = payload as unknown as MiddlewareJWTPayload;
    const role = typedPayload.role?.toUpperCase();

    // General write-rate-limit backstop — see WRITE_LIMIT comment above.
    if (isApiRoute && isWriteMethod(request.method)) {
      const limited = await writeRateLimited(`write:${typedPayload.id}`);
      if (limited) return limited;
    }

    // SUPER_ADMIN → platform only
    if (isPlatformPath) {
      if (role !== "SUPER_ADMIN") {
        log.warn("proxy_403_access_denied", { path: request.nextUrl.pathname, role: payload.role });
    if (isApiRoute) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
        return NextResponse.redirect(new URL("/user/login", request.url));
      }
      return nextWithSlug({ "x-user-id": typedPayload.id, "x-user-role": role });
    }

    if (role === "SUPER_ADMIN") {
      if (isApiRoute) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
      return NextResponse.redirect(new URL("/platform", request.url));
    }

    // Admin/owner guard
    const isAdminPath =
      pathname.startsWith("/admin") || pathname.startsWith("/api/admin");
    if (isAdminPath && !["ADMIN", "OWNER"].includes(role)) {
      if (isApiRoute) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }

    // Owner-only UI pages
    const ownerOnlyPaths = ["/admin/stats", "/admin/promotions", "/admin/roles", "/admin/services", "/admin/logs", "/api/admin/logs", "/admin/appearance"];
    if (ownerOnlyPaths.some((p) => pathname.startsWith(p)) && role !== "OWNER") {
      if (isApiRoute)
        return NextResponse.json({ error: "Accès réservé au propriétaire" }, { status: 403 });
      return NextResponse.redirect(new URL("/admin", request.url));
    }

    return nextWithSlug({ "x-user-id": typedPayload.id, "x-user-role": role });
  } catch (err) {
    log.warn("proxy_token_verification_failed", {
      path: request.nextUrl.pathname,
      reason: err instanceof Error ? err.name : "unknown",
    });
    const response = isApiRoute
      ? NextResponse.json({ error: "Session invalide" }, { status: 401 })
      : NextResponse.redirect(new URL("/user/login", request.url));
    // Same Domain/Path as the cookie was set with — a bare delete() is a no-op
    // against the production Domain=.host cookie.
    clearAuthCookie(response, request.url);
    return response;
  }
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/admin/:path*",
    "/platform/:path*",
    // Broad /api/:path* match is what makes the CSRF check above apply to
    // every write route platform-wide (auth, billing, onboarding, posts,
    // upload, bookings, ...) without listing each one individually. The
    // more specific /api/dashboard, /api/admin, /api/platform entries
    // below are now redundant with this but harmless to keep explicit.
    "/api/:path*",
    "/api/dashboard/:path*",
    "/api/admin/:path*",
    "/api/platform/:path*",
    // Also run on public routes to inject x-club-slug
    "/",
    "/coaching/:path*",
    "/offres/:path*",
    "/actualites/:path*",
    "/(public)/:path*",
    "/((?!api/|_next/|favicon.ico).*)",
    "/api/settings/public",
    "/api/plans/public",
    "/api/coaches/public",
    "/api/promotions/public",
    "/api/schedule/public",
    "/api/content/public/:path*",
  ],
};