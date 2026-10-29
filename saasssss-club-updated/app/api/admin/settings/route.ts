import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { invalidatePublicSettings } from "@/lib/club-public-settings";
import { requireAdmin, requireOwner } from "@/lib/auth";
import { resolveThemeId } from "@/lib/website-themes";
import { denyIfFeatureLocked } from "@/lib/plan-feature-guard";
import { designLockedResponse, isDesignLockError } from "@/lib/design-lock";
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

    const current = await getOrCreateSettings(owner.clubId as string);

    // Theme + 3D model: locked after setup. Re-sending the current value (the settings forms always
    // send the whole object) is fine; a real change needs an approved one-time grant and goes through
    // /api/admin/design-change/apply. The database trigger enforces the same rule even if this check
    // were bypassed.
    const themeChanging = themeId !== undefined && resolveThemeId(themeId) !== resolveThemeId(current.themeId);
    const heroChanging = heroModel !== undefined && (heroModel ?? null) !== (current.heroModel ?? null);
    const designLocked = !!current.designLockedAt;
    if (designLocked && (themeChanging || heroChanging)) return designLockedResponse();
    // Outside the guided wizard (manual / professional setup) there is no "complete" step, so the first
    // time the owner saves a theme or model choice is the moment it is confirmed and locked.
    const lockNow = !designLocked && (themeChanging || heroChanging) && current.websiteSetupMode !== "WIZARD";

    // Every theme and every standard 3D model is available on every plan. The ONLY plan-gated choice
    // is the club's own uploaded model ("custom"): selecting it needs the customHeroModel feature.
    // Keeping a custom model that is already selected stays allowed (a downgrade never breaks a site).
    if (heroModel === "custom" && current.heroModel !== "custom") {
      const featureDenied = await denyIfFeatureLocked(owner.clubId as string, "customHeroModel");
      if (featureDenied) return featureDenied;
    }

    // "custom" is only valid once THIS club has uploaded a model (club id from the session).
    if (heroModel === "custom") {
      const uploaded = await prisma.clubHeroModel.findUnique({ where: { clubId: owner.clubId as string }, select: { id: true } });
      if (!uploaded) {
        return NextResponse.json({ error: "Téléversez d'abord votre modèle 3D (.glb ou .gltf)." }, { status: 400 });
      }
    }

    let settings;
    try {
    settings = await prisma.gymSettings.update({
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
        // Locked clubs never write these fields from here (unchanged values are skipped so a legacy
        // id such as "classic" is not rewritten to its alias).
        ...(themeId !== undefined && (!designLocked || themeChanging) && { themeId }),
        ...(heroModel !== undefined && (!designLocked || heroChanging) && { heroModel }),
        ...(lockNow && { designLockedAt: new Date() }),
        updatedBy: owner.id,
      },
    });
    } catch (e) {
      if (isDesignLockError(e)) return designLockedResponse();
      throw e;
    }
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
