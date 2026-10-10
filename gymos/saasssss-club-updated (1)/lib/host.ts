// lib/host.ts
//
// Single source of truth for "does this Host header point at a tenant
// subdomain, and if so which one". Used by proxy.ts (Edge runtime — must
// stay dependency-free, no Prisma), lib/tenant.ts (Node runtime), and any
// route/page that needs a plain "is this the platform host or a club host"
// check (app/login, app/register). Don't re-implement this parsing anywhere
// else — that's exactly how the club-a.localhost bug happened (four copies
// of a slightly-wrong rule).
//
// Production:
//   "gymos.com"            (2 labels)      -> apex/platform, no tenant
//   "www.gymos.com"                        -> no tenant
//   "club-a.gymos.com"     (3 labels)      -> tenant "club-a"
//
// Local dev — "localhost" is a single-label host, so the apex/subdomain
// split happens one label earlier than production. Modern browsers resolve
// any *.localhost to 127.0.0.1 automatically, so this needs no /etc/hosts
// entry or wildcard DNS to work:
//   "localhost"             (1 label)      -> apex/platform, no tenant
//   "club-a.localhost"      (2 labels)      -> tenant "club-a"
//   "www.club-a.localhost"                  -> no tenant
export function extractSlugFromHost(host: string): string | null {
  const hostname = host.split(":")[0].toLowerCase();
  if (hostname === "localhost" || hostname === "127.0.0.1") return null;
  // A bare LAN/IPv4 host (e.g. "192.168.1.5", used when testing the mobile
  // app over Wi-Fi) has 4 dot-separated labels — the production branch below
  // would otherwise misread its first octet as a tenant slug. Treat it like
  // "localhost": no tenant from the host, so callers fall through to the
  // dev-only x-club-slug header instead.
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) return null;

  const parts = hostname.split(".");
  if (parts[0] === "www") return null;

  if (hostname.endsWith(".localhost")) {
    // "club-a.localhost" -> ["club-a", "localhost"]. Anything deeper
    // ("www.club-a.localhost") is intentionally not a tenant.
    return parts.length === 2 ? parts[0] : null;
  }

  // Production-style domain: apex is 2 labels ("gymos.com"), so a tenant
  // subdomain needs 3+ ("club-a.gymos.com").
  if (parts.length <= 2) return null;
  return parts[0];
}

export function isTenantHost(host: string): boolean {
  return extractSlugFromHost(host) !== null;
}