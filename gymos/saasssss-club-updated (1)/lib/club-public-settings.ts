// lib/club-public-settings.ts
//
// ONE cached query for a club's public settings. Before this, a single page view hit the
// database for the same GymSettings row several times (metadata, brand colors, then
// /api/settings/public from the browser). Now they all share this.
import prisma from "@/lib/prisma";
import { TtlCache } from "@/lib/ttl-cache";

const SELECT = {
  name: true, logoUrl: true, primaryColor: true,
  backgroundColor: true, backgroundColorDark: true, enabledPages: true,
  heroTitle: true, heroSubtitle: true, heroImageUrl: true,
  secondaryColor: true, description: true,
  facebookUrl: true, instagramUrl: true, tiktokUrl: true,
  twitterUrl: true, youtubeUrl: true, websiteUrl: true,
  phone: true, email: true, address: true,
  themeId: true, heroModel: true,
} as const;

export type PublicSettingsRow = Awaited<ReturnType<typeof load>>;

async function load(clubId: string) {
  return prisma.gymSettings.findUnique({ where: { clubId }, select: SELECT });
}

const cache = new TtlCache<PublicSettingsRow>(15_000);

export function getPublicSettings(clubId: string): Promise<PublicSettingsRow> {
  return cache.get(clubId, () => load(clubId));
}

/** Call after any write to GymSettings so this instance serves the new values at once. */
export function invalidatePublicSettings(clubId: string): void {
  cache.invalidate(clubId);
}
