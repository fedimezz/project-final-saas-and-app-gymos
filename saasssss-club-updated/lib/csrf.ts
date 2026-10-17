// lib/csrf.ts — origin verification for non-GET route handlers.
//
// RULE: a browser-issued write is accepted only when its Origin is the SAME
// origin the request was sent to (Origin host == Host header).
//
// Why not "any subdomain of the platform domain" (the previous rule)?
//   1. In a multi-tenant app every club owner controls a page on
//      club.yoursaas.com. Trusting all subdomains means one hostile club's page
//      is "same-site trusted" and can fire authenticated writes at every other
//      club, at the apex, and at /api/platform.
//   2. It rejected legitimate clubs on a CUSTOM domain
//      (Origin https://gym.example.com is not under yoursaas.com), so every
//      write from such a club got a 403.
// Same-origin needs no allow-list, works for apex, subdomains and custom
// domains alike, and is what "reject cross-site writes" actually means.

import { NextResponse } from "next/server";

function forbidden(): NextResponse {
  return NextResponse.json({ error: "CSRF" }, { status: 403 });
}

function requestHosts(request: Request): string[] {
  const hosts = new Set<string>();
  const host = request.headers.get("host");
  if (host) hosts.add(host.toLowerCase());
  try {
    hosts.add(new URL(request.url).host.toLowerCase());
  } catch {
    /* ignore */
  }
  return [...hosts];
}

/**
 * Returns a 403 NextResponse if the request looks like a cross-site write,
 * or null if the handler should proceed.
 *
 * Requests with no Origin header (server-to-server, curl, cron) pass — this is
 * a guard for browser-issued writes, not an auth check; it complements the
 * requireX() session checks. When Origin is absent but the browser says the
 * request is cross-site (Sec-Fetch-Site), it is still rejected.
 */
export function verifyOrigin(request: Request): NextResponse | null {
  const origin = request.headers.get("origin");

  if (!origin) {
    return request.headers.get("sec-fetch-site") === "cross-site" ? forbidden() : null;
  }

  let originHost: string;
  try {
    originHost = new URL(origin).host.toLowerCase();
  } catch {
    return forbidden(); // includes the opaque "null" origin
  }

  if (requestHosts(request).includes(originHost)) return null;

  // Local dev: the dev server may normalise subdomain requests to the apex
  // host (see lib/tenant.ts), so allow localhost <-> *.localhost only.
  if (process.env.NODE_ENV !== "production") {
    const hostname = originHost.split(":")[0];
    if (hostname === "localhost" || hostname.endsWith(".localhost")) return null;
  }

  return forbidden();
}
