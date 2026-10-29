import { NextRequest, NextResponse } from "next/server";
import { resolveTenantFromRequest } from "@/lib/tenant";
import { buildPublicSettingsPayload, noTenantPayload, fallbackTenantPayload } from "@/lib/public-settings-payload";

// Public, unauthenticated: branding (name/logo/colors) plus the club's own
// PUBLISHED contact info (phone/email/address) and social links — the same
// information a visitor sees on the public site (footer, contact section).
// This deliberately does NOT expose anything about the owner/staff accounts
// themselves (no user table fields, no ids). Used by ClubSettingsContext
// to render the real club identity everywhere (public navbar, admin sidebar,
// login/register pages) for the gym resolved from the current subdomain.
// Branding rarely changes and every page fetches this on load — cached at
// the edge/CDN per full URL (which already includes the host, so tenants
// never share a cache entry) for 30s, served stale for up to 5min while a
// fresh copy is fetched behind the scenes. Cuts the "homepage waits on this
// before it can render anything" cost this endpoint used to have on repeat
// visits.
const CACHE_HEADER = "public, max-age=0, s-maxage=10, stale-while-revalidate=30";

export async function GET(request: NextRequest) {
  try {
    const tenant = await resolveTenantFromRequest(request);
    if (!tenant) {
      // No subdomain resolved (apex/platform host, or no dev tenant configured) —
      // this is the SaaS marketing site itself, not any one gym's page.
      return NextResponse.json(noTenantPayload(), { headers: { "Cache-Control": CACHE_HEADER } });
    }
    return NextResponse.json(await buildPublicSettingsPayload(tenant), { headers: { "Cache-Control": CACHE_HEADER } });
  } catch (error) {
    console.error("Public settings GET error:", error);
    // Never break rendering because of this endpoint — fall back to defaults.
    // hasTenant: true keeps existing tenant sites rendering their normal UI
    // even if this call transiently fails, instead of flashing SaaS marketing content.
    // Not cached: a transient failure shouldn't get pinned at the edge.
    return NextResponse.json(fallbackTenantPayload());
  }
}
