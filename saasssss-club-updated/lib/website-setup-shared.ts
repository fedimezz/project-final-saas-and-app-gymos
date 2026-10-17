// lib/website-setup-shared.ts
//
// Client-safe pieces of the guided website setup: no server-only imports
// (no prisma), so this can be imported from "use client" components as well
// as from lib/website-setup.ts (the server-side counterpart that adds the
// Prisma-backed lock check).
export type WebsiteSetupPhase = "initial" | "extra" | "locked";

export interface WebsiteSetupFlags {
  websiteSetupCompleted: boolean;
  websiteExtraEditUsed: boolean;
  websiteCustomizationLocked: boolean;
}

export function computeWebsiteSetupPhase(flags: WebsiteSetupFlags): WebsiteSetupPhase {
  if (flags.websiteCustomizationLocked) return "locked";
  if (!flags.websiteSetupCompleted) return "initial";
  if (!flags.websiteExtraEditUsed) return "extra";
  return "locked";
}

// Curated top-level pages shown in the wizard's "Pages" step, in sidebar
// order. Deliberately a subset of PAGE_CONTENT_SCHEMA (excludes the dozen
// activite-* sub-pages) so a first-time owner isn't shown 15+ tabs — the
// full list stays available afterwards at /admin/content.
export const WIZARD_PAGE_KEYS = ["home", "coaching", "gallery", "offres", "actualites"] as const;
