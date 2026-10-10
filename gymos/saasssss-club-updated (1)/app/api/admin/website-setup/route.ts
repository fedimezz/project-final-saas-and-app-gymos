// GET  /api/admin/website-setup — current phase of the guided website setup
//      ("initial" | "extra" | "locked") plus the raw tracking flags.
// POST /api/admin/website-setup { action: "complete" } — advances the phase:
//      initial → extra (setup done, one more edit session available)
//      extra   → locked (the one extra session is now spent, permanently)
//      locked  → 409 (nothing left to complete)
//
// Owner-only, same trust boundary as /admin/settings and /admin/content —
// this drives the wizard that edits both.
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { invalidatePublicSettings } from "@/lib/club-public-settings";
import { requireOwner } from "@/lib/auth";
import { logAction } from "@/lib/activity-log";
import { runAfter } from "@/lib/after";
import { formatZodError, websiteSetupActionSchema } from "@/lib/validation";
import { computeWebsiteSetupPhase } from "@/lib/website-setup";
import { getActiveServicePrice, PriceNotConfiguredError } from "@/lib/service-pricing";

async function getOrCreateSettings(clubId: string) {
  const existing = await prisma.gymSettings.findUnique({
    where: { clubId },
    select: {
      websiteSetupCompleted: true,
      websiteExtraEditUsed: true,
      websiteCustomizationLocked: true,
      websiteSetupMode: true,
    },
  });
  if (existing) return existing;
  return prisma.gymSettings.create({
    data: { clubId },
    select: {
      websiteSetupCompleted: true,
      websiteExtraEditUsed: true,
      websiteCustomizationLocked: true,
      websiteSetupMode: true,
    },
  });
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireOwner(request);
    if (!auth.ok) return NextResponse.json({ error: "Accès réservé au propriétaire" }, { status: auth.status });

    const flags = await getOrCreateSettings(auth.user.clubId as string);
    const phase = computeWebsiteSetupPhase(flags);

    return NextResponse.json({ phase, ...flags });
  } catch (error) {
    console.error("Website setup GET error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireOwner(request);
    if (!auth.ok) return NextResponse.json({ error: "Accès réservé au propriétaire" }, { status: auth.status });
    const clubId = auth.user.clubId as string;

    const rawBody = await request.json().catch(() => null);
    const parsed = websiteSetupActionSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 });
    }

    const flags = await getOrCreateSettings(clubId);
    const phase = computeWebsiteSetupPhase(flags);

    // ── "How do you want to build your site?" (shown right after payment) ──────
    if (parsed.data.action === "choose") {
      const { mode, description } = parsed.data;
      let serviceRequest: { id: string } | null = null;

      if (mode === "PRO") {
        // Paid professional setup: the platform team builds the site. The price is the
        // one SUPER_ADMIN configured (snapshotted on the request), exactly like /admin/services.
        const open = await prisma.serviceRequest.findFirst({
          where: { clubId, type: "PROFESSIONAL_SETUP", status: { in: ["PENDING", "APPROVED", "IN_PROGRESS"] } },
          select: { id: true },
        });
        if (open) {
          serviceRequest = open;
        } else {
          let snapshot: { price: number; currency: string };
          try {
            snapshot = await getActiveServicePrice("PROFESSIONAL_SETUP");
          } catch (e) {
            if (e instanceof PriceNotConfiguredError) {
              return NextResponse.json(
                { error: "L'installation professionnelle n'est pas disponible pour le moment. Choisissez la configuration guidée ou manuelle." },
                { status: 503 }
              );
            }
            throw e;
          }
          serviceRequest = await prisma.serviceRequest.create({
            data: {
              clubId,
              requestedBy: auth.user.id,
              type: "PROFESSIONAL_SETUP",
              description: description || null,
              priceAtRequest: snapshot.price,
              currency: snapshot.currency,
            },
            select: { id: true },
          });
        }
      }

      const updated = await prisma.gymSettings.update({
        where: { clubId },
        data: { websiteSetupMode: mode },
        select: {
          websiteSetupCompleted: true,
          websiteExtraEditUsed: true,
          websiteCustomizationLocked: true,
          websiteSetupMode: true,
        },
      });
      invalidatePublicSettings(clubId);

      runAfter(() =>
        logAction(request, {
          clubId,
          actorId: auth.user.id, actorName: auth.user.name, actorRole: auth.user.role,
          action: "WEBSITE_SETUP_MODE_CHOSEN",
          category: "CONTENT",
          targetName: mode,
        })
      );

      return NextResponse.json({
        phase: computeWebsiteSetupPhase(updated),
        ...updated,
        serviceRequestId: serviceRequest?.id ?? null,
      });
    }

    if (phase === "locked") {
      return NextResponse.json(
        { error: "La configuration du site est déjà terminée et verrouillée." },
        { status: 409 }
      );
    }

    const data =
      phase === "initial"
        ? { websiteSetupCompleted: true }
        : { websiteExtraEditUsed: true, websiteCustomizationLocked: true };

    const updated = await prisma.gymSettings.update({
      where: { clubId },
      data,
      select: {
        websiteSetupCompleted: true,
        websiteExtraEditUsed: true,
        websiteCustomizationLocked: true,
        websiteSetupMode: true,
      },
    });
    invalidatePublicSettings(clubId);

    runAfter(() =>
      logAction(request, {
        clubId,
        actorId: auth.user.id, actorName: auth.user.name, actorRole: auth.user.role,
        action: phase === "initial" ? "WEBSITE_SETUP_COMPLETED" : "WEBSITE_CUSTOMIZATION_LOCKED",
        category: "CONTENT",
      })
    );

    return NextResponse.json({ phase: computeWebsiteSetupPhase(updated), ...updated });
  } catch (error) {
    console.error("Website setup POST error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
