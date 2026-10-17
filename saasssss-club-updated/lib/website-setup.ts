// lib/website-setup.ts — server-side half (Prisma-backed lock check).
// Phase logic and the wizard's page-key list live in
// lib/website-setup-shared.ts so client components can import those without
// pulling in Prisma.
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import type { WebsiteSetupFlags } from "@/lib/website-setup-shared";

export type { WebsiteSetupPhase, WebsiteSetupFlags } from "@/lib/website-setup-shared";
export { computeWebsiteSetupPhase, WIZARD_PAGE_KEYS } from "@/lib/website-setup-shared";

/**
 * Guards PUT /api/admin/settings and PUT /api/admin/page-content: once the
 * site is locked, direct edits are rejected (423) and the response points
 * the client at the change-request flow. Returns null when the write may
 * proceed.
 */
export async function denyIfWebsiteLocked(clubId: string): Promise<NextResponse | null> {
  const settings = await prisma.gymSettings.findUnique({
    where: { clubId },
    select: { websiteCustomizationLocked: true },
  });
  if (settings?.websiteCustomizationLocked) {
    return NextResponse.json(
      {
        error:
          "La personnalisation directe du site est verrouillée. Utilisez « Demander une modification » pour soumettre votre changement.",
        locked: true,
      },
      { status: 423 }
    );
  }
  return null;
}
