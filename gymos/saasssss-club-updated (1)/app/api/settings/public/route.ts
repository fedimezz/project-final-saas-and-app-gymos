import { NextRequest, NextResponse } from "next/server";
import { getPublicSettings } from "@/lib/club-public-settings";
import { resolveTenantFromRequest } from "@/lib/tenant";
import { safeImageUrl } from "@/lib/image-url";
import { resolveThemeId, resolveHeroModel } from "@/lib/website-themes";

const DEFAULTS = {
  name: "Mon Club", logoUrl: null, primaryColor: "#0f172a",
  backgroundColor: "#ffffff", backgroundColorDark: "#0a0a0a",
  enabledPages: null, heroTitle: null, heroSubtitle: null, heroImageUrl: null,
  // Added fields (additive — existing keys above are unchanged for older clients).
  secondaryColor: "#3b82f6", description: null,
  facebookUrl: null, instagramUrl: null, tiktokUrl: null,
  twitterUrl: null, youtubeUrl: null, websiteUrl: null,
  phone: null, email: null, address: null,
  themeId: "modern", heroModel: null,
};

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
      return NextResponse.json({ ...DEFAULTS, hasTenant: false }, { headers: { "Cache-Control": CACHE_HEADER } });
    }

    const settings = await getPublicSettings(tenant.id);

    return NextResponse.json({
      name: settings?.name ?? tenant.name,
      logoUrl: safeImageUrl(settings?.logoUrl),
      primaryColor: settings?.primaryColor ?? "#0f172a",
      backgroundColor: settings?.backgroundColor ?? "#ffffff",
      backgroundColorDark: settings?.backgroundColorDark ?? "#0a0a0a",
      enabledPages: settings?.enabledPages ?? null,
      heroTitle: settings?.heroTitle ?? null,
      heroSubtitle: settings?.heroSubtitle ?? null,
      heroImageUrl: safeImageUrl(settings?.heroImageUrl),
      secondaryColor: settings?.secondaryColor ?? "#3b82f6",
      description: settings?.description ?? null,
      facebookUrl: settings?.facebookUrl ?? null,
      instagramUrl: settings?.instagramUrl ?? null,
      tiktokUrl: settings?.tiktokUrl ?? null,
      twitterUrl: settings?.twitterUrl ?? null,
      youtubeUrl: settings?.youtubeUrl ?? null,
      websiteUrl: settings?.websiteUrl ?? null,
      phone: settings?.phone ?? null,
      email: settings?.email ?? null,
      address: settings?.address ?? null,
      themeId: resolveThemeId(settings?.themeId),
      heroModel: resolveHeroModel(settings?.themeId, settings?.heroModel),
      hasTenant: true,
    }, { headers: { "Cache-Control": CACHE_HEADER } });
  } catch (error) {
    console.error("Public settings GET error:", error);
    // Never break rendering because of this endpoint — fall back to defaults.
    // hasTenant: true keeps existing tenant sites rendering their normal UI
    // even if this call transiently fails, instead of flashing SaaS marketing content.
    // Not cached: a transient failure shouldn't get pinned at the edge.
    return NextResponse.json({ ...DEFAULTS, hasTenant: true });
  }
}
