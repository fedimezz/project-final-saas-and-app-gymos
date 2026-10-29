// /api/admin/design-change — OWNER only. The club's theme + 3D model are locked after setup
// (lib/design-lock.ts); this is how an owner asks for a one-time change.
//   GET     lock state + the latest requests of THIS club
//   POST    { themeId?, heroModel?, reason } — file a request (one open request per club)
//   DELETE  cancel the open request (pending, or approved-but-not-yet-applied)
// The club always comes from the authenticated session, never from the request.
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { requireOwner } from "@/lib/auth";
import { verifyOrigin } from "@/lib/csrf";
import { checkRateLimit } from "@/lib/rate-limit";
import { designChangeRequestSchema, formatZodError } from "@/lib/validation";
import { expireStaleGrants } from "@/lib/design-lock";
import { resolveThemeId } from "@/lib/website-themes";
import { denyIfFeatureLocked } from "@/lib/plan-feature-guard";
import { logAction } from "@/lib/activity-log";
import { runAfter } from "@/lib/after";

const DENIED = "Accès réservé au propriétaire";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireOwner(request);
    if (!auth.ok) return NextResponse.json({ error: DENIED }, { status: auth.status });
    const clubId = auth.user.clubId as string;

    await expireStaleGrants(clubId);
    const [settings, requests] = await Promise.all([
      prisma.gymSettings.findUnique({
        where: { clubId },
        select: { themeId: true, heroModel: true, designLockedAt: true },
      }),
      prisma.designChangeRequest.findMany({
        where: { clubId },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          id: true, requestedThemeId: true, requestedHeroModel: true, reason: true, status: true,
          reviewNote: true, reviewedAt: true, expiresAt: true, consumedAt: true, createdAt: true,
        },
      }),
    ]);

    return NextResponse.json(
      {
        locked: !!settings?.designLockedAt,
        lockedAt: settings?.designLockedAt ?? null,
        themeId: resolveThemeId(settings?.themeId),
        heroModel: settings?.heroModel ?? null,
        requests,
        open: requests.find((r) => r.status === "PENDING" || r.status === "APPROVED") ?? null,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Design change GET error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const csrf = verifyOrigin(request);
    if (csrf) return csrf;
    const auth = await requireOwner(request);
    if (!auth.ok) return NextResponse.json({ error: DENIED }, { status: auth.status });
    const clubId = auth.user.clubId as string;

    const rl = await checkRateLimit(`design-change:${clubId}`, 5, 24 * 60 * 60 * 1000);
    if (!rl.allowed) {
      return NextResponse.json({ error: "Trop de demandes aujourd'hui. Réessayez demain." }, { status: 429 });
    }

    const parsed = designChangeRequestSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 });
    const { themeId, heroModel, reason } = parsed.data;

    const settings = await prisma.gymSettings.findUnique({
      where: { clubId },
      select: { themeId: true, heroModel: true, designLockedAt: true },
    });
    if (!settings?.designLockedAt) {
      return NextResponse.json(
        { error: "Votre thème et votre modèle 3D ne sont pas encore verrouillés : modifiez-les directement dans Apparence.", code: "NOT_LOCKED" },
        { status: 409 }
      );
    }

    // Ask only for a real change.
    const themeChanges = themeId !== undefined && themeId !== resolveThemeId(settings.themeId);
    const heroChanges = heroModel !== undefined && heroModel !== (settings.heroModel ?? null);
    if (!themeChanges && !heroChanges) {
      return NextResponse.json({ error: "Cette demande ne change rien à votre thème ou à votre modèle 3D actuels." }, { status: 400 });
    }
    // Themes and standard 3D models are free on every plan; asking for the club's own model needs the plan feature.
    if (heroChanges && heroModel === "custom") {
      const featureDenied = await denyIfFeatureLocked(clubId, "customHeroModel");
      if (featureDenied) return featureDenied;
    }

    await expireStaleGrants(clubId);
    try {
      const created = await prisma.designChangeRequest.create({
        data: {
          clubId,
          requestedBy: auth.user.id,
          requestedThemeId: themeChanges ? themeId : null,
          requestedHeroModel: heroChanges ? (heroModel as string) : null,
          reason,
        },
        select: { id: true, requestedThemeId: true, requestedHeroModel: true, reason: true, status: true, createdAt: true },
      });
      runAfter(() =>
        logAction(request, {
          clubId, actorId: auth.user.id, actorName: auth.user.name, actorRole: auth.user.role,
          action: "DESIGN_CHANGE_REQUESTED", category: "SETTINGS", targetId: created.id,
          detail: { themeId: created.requestedThemeId, heroModel: created.requestedHeroModel },
        })
      );
      return NextResponse.json({ request: created }, { status: 201 });
    } catch (e) {
      // The partial unique index (one open request per club) is the real guard against races.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        return NextResponse.json({ error: "Une demande est déjà en cours pour votre club." }, { status: 409 });
      }
      throw e;
    }
  } catch (error) {
    console.error("Design change POST error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const csrf = verifyOrigin(request);
    if (csrf) return csrf;
    const auth = await requireOwner(request);
    if (!auth.ok) return NextResponse.json({ error: DENIED }, { status: auth.status });
    const clubId = auth.user.clubId as string;

    const result = await prisma.designChangeRequest.updateMany({
      where: { clubId, status: { in: ["PENDING", "APPROVED"] }, consumedAt: null },
      data: { status: "CANCELLED" },
    });
    if (result.count === 0) return NextResponse.json({ error: "Aucune demande en cours." }, { status: 404 });
    runAfter(() =>
      logAction(request, {
        clubId, actorId: auth.user.id, actorName: auth.user.name, actorRole: auth.user.role,
        action: "DESIGN_CHANGE_CANCELLED", category: "SETTINGS",
      })
    );
    return NextResponse.json({ cancelled: true });
  } catch (error) {
    console.error("Design change DELETE error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
