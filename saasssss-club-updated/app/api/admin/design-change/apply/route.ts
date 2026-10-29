// POST /api/admin/design-change/apply — OWNER only. Spends the club's approved one-time grant by
// applying EXACTLY what SUPER_ADMIN approved (the body carries no theme or model: nothing the
// client sends can widen the grant). The UPDATE below is what the database trigger sees; the
// trigger consumes the grant atomically with this write, so a double click or a replay finds
// nothing left to spend.
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireOwner } from "@/lib/auth";
import { verifyOrigin } from "@/lib/csrf";
import { invalidatePublicSettings } from "@/lib/club-public-settings";
import { designLockedResponse, expireStaleGrants, findActiveGrant, isDesignLockError } from "@/lib/design-lock";
import { getTheme, resolveThemeId } from "@/lib/website-themes";
import { denyIfFeatureLocked } from "@/lib/plan-feature-guard";
import { logAction } from "@/lib/activity-log";

export async function POST(request: NextRequest) {
  try {
    const csrf = verifyOrigin(request);
    if (csrf) return csrf;
    const auth = await requireOwner(request);
    if (!auth.ok) return NextResponse.json({ error: "Accès réservé au propriétaire" }, { status: auth.status });
    const owner = auth.user;
    const clubId = owner.clubId as string;

    await expireStaleGrants(clubId);
    const grant = await findActiveGrant(clubId);
    if (!grant) {
      return NextResponse.json({ error: "Aucun changement approuvé à appliquer (ou l'autorisation a expiré).", code: "NO_GRANT" }, { status: 409 });
    }

    const settings = await prisma.gymSettings.findUnique({
      where: { clubId },
      select: { themeId: true, heroModel: true },
    });
    if (!settings) return NextResponse.json({ error: "Paramètres introuvables." }, { status: 404 });

    const newTheme = grant.requestedThemeId && grant.requestedThemeId !== resolveThemeId(settings.themeId) ? grant.requestedThemeId : null;
    const newHero = grant.requestedHeroModel && grant.requestedHeroModel !== (settings.heroModel ?? null) ? grant.requestedHeroModel : null;
    if (!newTheme && !newHero) {
      return NextResponse.json({ error: "Votre site utilise déjà ce thème / modèle : rien à appliquer." }, { status: 409 });
    }
    if (newHero === "custom") {
      const featureDenied = await denyIfFeatureLocked(clubId, "customHeroModel");
      if (featureDenied) return featureDenied;
      const uploaded = await prisma.clubHeroModel.findUnique({ where: { clubId }, select: { id: true } });
      if (!uploaded) return NextResponse.json({ error: "Téléversez d'abord votre modèle 3D (.glb ou .gltf), puis appliquez le changement.", code: "NO_CUSTOM_MODEL" }, { status: 409 });
    }

    try {
      await prisma.gymSettings.update({
        where: { clubId },
        data: {
          ...(newTheme && { themeId: newTheme }),
          ...(newHero && { heroModel: newHero }),
          updatedBy: owner.id,
        },
        select: { id: true },
      });
    } catch (e) {
      // The trigger refused: the grant was spent or expired between our check and the write.
      if (isDesignLockError(e)) return designLockedResponse();
      throw e;
    }
    invalidatePublicSettings(clubId);
    await logAction(request, {
      clubId, actorId: owner.id, actorName: owner.name, actorRole: owner.role,
      action: "DESIGN_CHANGE_APPLIED", category: "SETTINGS", targetId: grant.id,
      detail: { themeId: newTheme, heroModel: newHero },
    });

    return NextResponse.json({
      applied: true,
      themeId: newTheme ? getTheme(newTheme).id : resolveThemeId(settings.themeId),
      heroModel: newHero ?? settings.heroModel ?? null,
    });
  } catch (error) {
    console.error("Design change apply error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
