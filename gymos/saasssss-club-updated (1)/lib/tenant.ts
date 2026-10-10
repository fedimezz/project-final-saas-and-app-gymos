// src/lib/tenant.ts
//
// Resolves "which gym is this request for" from server-side signals only —
// the request's Host header (subdomain) in production, with a couple of
// explicit, production-disabled dev conveniences. NEVER from a client-
// supplied clubId in a request body/query/header in production: that would
// let any authenticated user simply claim to belong to a different gym.
//
// Architecture: gym-a.yoursaas.com -> slug "gym-a". The apex domain
// (yoursaas.com) and "www" resolve to no tenant at all — that's the
// platform marketing site / SUPER_ADMIN area, not any one gym's site.
import prisma from "@/lib/prisma";
import type { ClubStatus } from "@prisma/client";
import { extractSlugFromHost } from "@/lib/host";
import { isPlatformHost } from "@/lib/tenant-url";

export interface TenantClub {
  id: string;
  slug: string;
  name: string;
  status: ClubStatus;
  // Set when the club serves its site on its own domain. Optional so tests
  // and callers that only care about identity don't have to provide it.
  customDomain?: string | null;
}

const CLUB_SELECT = { id: true, slug: true, name: true, status: true, customDomain: true } as const;

// A DNS label: what a subdomain can actually be. Anything else in the Host
// header (garbage, attacker-chosen strings) is rejected before it can touch
// the database or the cache.
const DNS_LABEL = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;
// A hostname (custom domains): dot-separated DNS labels, max 253 chars.
const HOSTNAME = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

// Tenant cache, short TTL. Tenant resolution runs on essentially every
// request (every page load, every API call), so this avoids a DB round trip
// per request without reaching for Redis for something this cheap and this
// tolerant of a few seconds of staleness. Trade-off: a just-suspended gym
// can keep serving requests for up to TTL_MS after suspension — the platform
// suspend/reactivate actions should call invalidateClubCache(slug).
//
// Bounded: keys derive from the request's Host header, which an attacker
// controls (random-1.yoursaas.com, random-2.yoursaas.com, ...). Without a cap
// that's an unbounded memory growth vector. Misses ("no such club") are cached
// for a shorter time than hits, and the map is hard-capped with oldest-first
// eviction.
const cache = new Map<string, { club: TenantClub | null; expiresAt: number }>();
const TTL_MS = 30_000;
const NEGATIVE_TTL_MS = 5_000;
const MAX_CACHE_ENTRIES = 500;

function cacheGet(key: string): { club: TenantClub | null } | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (hit.expiresAt <= Date.now()) {
    cache.delete(key);
    return null;
  }
  return { club: hit.club };
}

function cacheSet(key: string, club: TenantClub | null): void {
  const now = Date.now();
  if (cache.size >= MAX_CACHE_ENTRIES) {
    for (const [k, v] of cache) if (v.expiresAt <= now) cache.delete(k);
    // Still full: evict oldest inserted entries (Map preserves insertion order).
    while (cache.size >= MAX_CACHE_ENTRIES) {
      const oldest = cache.keys().next().value;
      if (oldest === undefined) break;
      cache.delete(oldest);
    }
  }
  cache.delete(key); // re-insert so this key becomes the newest
  cache.set(key, { club, expiresAt: now + (club ? TTL_MS : NEGATIVE_TTL_MS) });
}

export async function resolveClubById(id: string): Promise<TenantClub | null> {
  const key = `id:${id}`;
  const cached = cacheGet(key);
  if (cached) return cached.club;

  const club = await prisma.club.findUnique({ where: { id }, select: CLUB_SELECT });
  cacheSet(key, club);
  return club;
}

export async function resolveClubBySlug(slug: string): Promise<TenantClub | null> {
  if (!DNS_LABEL.test(slug)) return null;

  const key = `slug:${slug}`;
  const cached = cacheGet(key);
  if (cached) return cached.club;

  const club = await prisma.club.findUnique({ where: { slug }, select: CLUB_SELECT });
  cacheSet(key, club);
  return club;
}

async function resolveClubByCustomDomain(hostname: string): Promise<TenantClub | null> {
  if (!HOSTNAME.test(hostname)) return null;

  const key = `domain:${hostname}`;
  const cached = cacheGet(key);
  if (cached) return cached.club;

  const club = await prisma.club.findFirst({ where: { customDomain: hostname }, select: CLUB_SELECT });
  cacheSet(key, club);
  return club;
}

export function invalidateClubCache(slug: string): void {
  cache.delete(`slug:${slug}`);
}

/**
 * Resolves the tenant for an incoming Request. This is the single function
 * every auth check and every server component should call — do not
 * re-implement hostname parsing elsewhere.
 */
export async function resolveTenantFromRequest(request: Request): Promise<TenantClub | null> {
  const url = new URL(request.url);
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = request.headers.get("host") ?? url.host;
  const developmentHosts = process.env.NODE_ENV !== "production"
    ? [
        forwardedHost,
        request.headers.get("origin"),
        request.headers.get("referer"),
      ].filter(Boolean).map((value) => {
        try { return new URL(value as string).host; } catch { return value as string; }
      })
    : [];

  // Dev/test convenience ONLY: an explicit x-club-slug header or ?club=
  // query param lets you exercise multi-tenant behavior on localhost
  // without wildcard DNS/hosts-file setup. Both are completely ignored
  // outside development, so they can never be used to spoof a tenant
  // against a real deployment.
  const slug = extractSlugFromHost(host) ?? developmentHosts
    .map((candidate) => extractSlugFromHost(candidate))
    .find(Boolean) ?? null;
  if (slug) {
    const bySlug = await resolveClubBySlug(slug);
    // In production a 3-label host that isn't a known slug may still be a
    // CUSTOM domain ("app.mygym.tn", "www.mygym.com": extractSlugFromHost
    // reads their first label as a slug). Returning null here used to make
    // every such club unreachable — only bare 2-label custom domains worked.
    if (bySlug || process.env.NODE_ENV !== "production") return bySlug;
  }

  // Custom domains only exist in production. The platform's own apex host
  // (and www) can never be a custom domain, so skip the lookup entirely for
  // it — otherwise every marketing-site request would cost a DB query.
  if (process.env.NODE_ENV === "production" && !isPlatformHost(host)) {
    const customClub = await resolveClubByCustomDomain(host.split(":")[0].toLowerCase());
    if (customClub) return customClub;
  }

  if (process.env.NODE_ENV !== "production") {
    const headerSlug = request.headers.get("x-club-slug");
    const querySlug = url.searchParams.get("club");
    const devSlug = headerSlug || querySlug || process.env.DEV_DEFAULT_CLUB_SLUG;
    if (devSlug) return resolveClubBySlug(devSlug);
  }

  return null; // apex/platform host — intentionally no tenant
}

export function isClubUsable(club: TenantClub | null): club is TenantClub {
  return !!club && (club.status === "ACTIVE" || club.status === "TRIAL");
}