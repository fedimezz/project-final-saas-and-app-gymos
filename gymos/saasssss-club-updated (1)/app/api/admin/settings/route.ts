import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { invalidatePublicSettings } from "@/lib/club-public-settings";
import { requireAdmin, requireOwner } from "@/lib/auth";
import { formatZodError, gymSettingsSchema } from "@/lib/validation";
import { denyUnlessPermitted } from "@/lib/permission-guard";
import { denyIfWebsiteLocked } from "@/lib/website-setup";
import { buildTenantOrigin } from "@/lib/tenant-url";
import { logAction } from "@/lib/activity-log";
import { runAfter } from "@/lib/after";

async function getOrCreateSettings(clubId: string) {
  const existing = await prisma.gymSettings.findUnique({ where: { clubId } });
  if (existing) return existing;
  return prisma.gymSettings.create({ data: { clubId } });
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.ok) return NextResponse.json({ error: "Accès refusé" }, { status: auth.status });
    const denied = await denyUnlessPermitted(auth.user, "settings.view");
    if (denied) return denied;
    const clubId = auth.user.clubId as string;
    const settings = await getOrCreateSettings(clubId);

    // Also fetch the club slug so the settings page can show the gym's public URL.
    const club = await prisma.club.findUnique({
      where: { id: clubId },
      select: { slug: true, customDomain: true },
    });

    return NextResponse.json({
      settings,
      club: {
        slug: club?.slug ?? "",
        customDomain: club?.customDomain ?? null,
        // Same helper the emails / payment return URLs use: strips "www.",
        // keeps the port, and never yields "slug.www.yoursaas.com".
        publicUrl: buildTenantOrigin({ slug: club?.slug ?? "demo", customDomain: club?.customDomain ?? null }),
      },
    });
  } catch (error) {
    console.error("Admin settings GET error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await requireOwner(request);
    if (!auth.ok) return NextResponse.json({ error: "Accès réservé au propriétaire" }, { status: auth.status });
    const owner = auth.user;

    // Once the guided website setup is locked, branding/theme/contact
    // changes go through a WebsiteChangeRequest instead of a direct PUT —
    // see lib/website-setup.ts.
    const lockedResponse = await denyIfWebsiteLocked(owner.clubId as string);
    if (lockedResponse) return lockedResponse;

    const rawBody = await request.json().catch(() => null);
    // The form sends the complete settings object. Prisma returns nullable
    // columns as null, while the validation schema uses optional fields.
    // Normalize null -> undefined before validation so an untouched nullable
    // field never makes an otherwise valid save fail with "Invalid input".
    const body = rawBody && typeof rawBody === "object"
      ? Object.fromEntries(Object.entries(rawBody as Record<string, unknown>).map(([key, value]) => [key, value === null && key !== "heroModel" ? undefined : value]))
      : rawBody;

    const parsed = gymSettingsSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 });
    }

    const {
      name, logoUrl, address, phone, email,
      workingHours, facebookUrl, instagramUrl, tiktokUrl, primaryColor,
      backgroundColor, backgroundColorDark, enabledPages,
      heroTitle, heroSubtitle,
      twitterUrl, youtubeUrl, websiteUrl, description, secondaryColor,
      themeId, heroModel,
    } = parsed.data;

    await getOrCreateSettings(owner.clubId as string);

    const settings = await prisma.gymSettings.update({
      where: { clubId: owner.clubId as string },
      data: {
        ...(name !== undefined && { name }),
        ...(logoUrl !== undefined && { logoUrl: logoUrl || null }),
        ...(address !== undefined && { address: address || null }),
        ...(phone !== undefined && { phone: phone || null }),
        ...(email !== undefined && { email: email || null }),
        ...(workingHours !== undefined && { workingHours: workingHours as Prisma.InputJsonValue }),
        ...(facebookUrl !== undefined && { facebookUrl: facebookUrl || null }),
        ...(instagramUrl !== undefined && { instagramUrl: instagramUrl || null }),
        ...(tiktokUrl !== undefined && { tiktokUrl: tiktokUrl || null }),
        ...(twitterUrl !== undefined && { twitterUrl: twitterUrl || null }),
        ...(youtubeUrl !== undefined && { youtubeUrl: youtubeUrl || null }),
        ...(websiteUrl !== undefined && { websiteUrl: websiteUrl || null }),
        ...(description !== undefined && { description: description || null }),
        ...(secondaryColor !== undefined && { secondaryColor: secondaryColor || null }),
        ...(primaryColor !== undefined && { primaryColor: primaryColor || null }),
        ...(backgroundColor !== undefined && { backgroundColor: backgroundColor || null }),
        ...(backgroundColorDark !== undefined && { backgroundColorDark: backgroundColorDark || null }),
        ...(enabledPages !== undefined && { enabledPages: enabledPages as Prisma.InputJsonValue }),
        ...(heroTitle !== undefined && { heroTitle: heroTitle || null }),
        ...(heroSubtitle !== undefined && { heroSubtitle: heroSubtitle || null }),
        ...(themeId !== undefined && { themeId }),
        ...(heroModel !== undefined && { heroModel }),
        updatedBy: owner.id,
      },
    });
    invalidatePublicSettings(owner.clubId as string);

    runAfter(() =>
      logAction(request, {
        clubId: owner.clubId as string,
        actorId: owner.id, actorName: owner.name, actorRole: owner.role,
        action: "CLUB_SETTINGS_UPDATED",
        category: "SETTINGS",
      })
    )

    return NextResponse.json({ settings });
  } catch (error) {
    console.error("Admin settings PUT error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
