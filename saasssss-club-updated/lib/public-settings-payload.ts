// lib/public-settings-payload.ts
//
// ONE place that builds the public (unauthenticated) club settings JSON.
// Used by:
//   - GET /api/settings/public (browser refreshes, mobile app), and
//   - app/layout.tsx, which now hands the same object to ClubSettingsProvider
//     as its initial value, so the homepage renders on the FIRST response
//     instead of waiting for a client-side fetch (the old "blank page until
//     /api/settings/public answers" delay, painful with a remote database).
import { getPublicSettings } from "@/lib/club-public-settings";
import { safeImageUrl } from "@/lib/image-url";
import { resolveThemeId, resolveHeroModel, resolveHeroChoice } from "@/lib/website-themes";
import { getHeroModelMeta, toPublicHeroModel } from "@/lib/hero-model-server";

export const PUBLIC_SETTINGS_DEFAULTS = {
  name: "Mon Club", logoUrl: null, primaryColor: "#0f172a",
  backgroundColor: "#ffffff", backgroundColorDark: "#0a0a0a",
  enabledPages: null, heroTitle: null, heroSubtitle: null, heroImageUrl: null,
  // Added fields (additive — existing keys above are unchanged for older clients).
  secondaryColor: "#3b82f6", description: null,
  facebookUrl: null, instagramUrl: null, tiktokUrl: null,
  twitterUrl: null, youtubeUrl: null, websiteUrl: null,
  phone: null, email: null, address: null,
  themeId: "modern", heroModel: null, heroMode: "builtin", heroCustomModel: null,
} as const;

export type PublicSettingsPayload = Record<string, unknown> & { hasTenant: boolean };

/** Apex / platform host: no club resolved. */
export function noTenantPayload(): PublicSettingsPayload {
  return { ...PUBLIC_SETTINGS_DEFAULTS, hasTenant: false };
}

/** Transient failure: keep tenant sites rendering their normal UI instead of flashing SaaS content. */
export function fallbackTenantPayload(): PublicSettingsPayload {
  return { ...PUBLIC_SETTINGS_DEFAULTS, hasTenant: true };
}

export async function buildPublicSettingsPayload(tenant: { id: string; name: string }): Promise<PublicSettingsPayload> {
  const settings = await getPublicSettings(tenant.id); // cached (15s) + de-duplicated

  // Built-in id stays in `heroModel` (older clients / the mobile app keep working);
  // the new fields describe a custom upload or "no 3D".
  const choice = resolveHeroChoice(settings?.themeId, settings?.heroModel);
  // Only clubs that uploaded their own model pay for the second (cached) lookup.
  const customMeta = choice === "custom" ? await getHeroModelMeta(tenant.id) : null;
  const heroMode: "builtin" | "custom" | "none" =
    choice === "none" ? "none" : choice === "custom" && customMeta ? "custom" : "builtin";

  return {
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
    heroMode,
    heroCustomModel: heroMode === "custom" && customMeta ? toPublicHeroModel(customMeta) : null,
    hasTenant: true,
  };
}
