// GET  /api/admin/website-change-requests — this club's own change requests,
//      newest first. Available regardless of lock state so the owner can see
//      history even before the site is locked.
// POST /api/admin/website-change-requests { description } — submit a new
//      request describing a website change. Owner-only, rate-limited so the
//      review queue can't be flooded.
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireOwner } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { formatZodError, websiteChangeRequestSchema } from "@/lib/validation";
import { logAction } from "@/lib/activity-log";
import { runAfter } from "@/lib/after";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireOwner(request);
    if (!auth.ok) return NextResponse.json({ error: "Accès réservé au propriétaire" }, { status: auth.status });

    const requests = await prisma.websiteChangeRequest.findMany({
      where: { clubId: auth.user.clubId as string },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    return NextResponse.json({ requests });
  } catch (error) {
    console.error("Website change requests GET error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireOwner(request);
    if (!auth.ok) return NextResponse.json({ error: "Accès réservé au propriétaire" }, { status: auth.status });
    const clubId = auth.user.clubId as string;

    // 10 requests / day is generous for a legitimate change request queue
    // and stops the review queue being flooded by one club.
    const rl = await checkRateLimit(`website-change-request:${clubId}`, 10, 24 * 60 * 60 * 1000);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Trop de demandes envoyées aujourd'hui. Réessayez demain." },
        { status: 429 }
      );
    }

    const rawBody = await request.json().catch(() => null);
    const parsed = websiteChangeRequestSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 });
    }

    const created = await prisma.websiteChangeRequest.create({
      data: {
        clubId,
        requestedBy: auth.user.id,
        description: parsed.data.description,
      },
    });

    runAfter(() =>
      logAction(request, {
        clubId,
        actorId: auth.user.id, actorName: auth.user.name, actorRole: auth.user.role,
        action: "WEBSITE_CHANGE_REQUESTED",
        category: "CONTENT",
        targetId: created.id,
      })
    );

    return NextResponse.json({ request: created }, { status: 201 });
  } catch (error) {
    console.error("Website change requests POST error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
