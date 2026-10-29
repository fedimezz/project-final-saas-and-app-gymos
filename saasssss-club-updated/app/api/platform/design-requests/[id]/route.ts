// PATCH /api/platform/design-requests/[id] { action: "approve" | "reject", note? } — SUPER_ADMIN only.
// Approve = a one-time grant valid GRANT_TTL_DAYS days. Only a PENDING request can be reviewed, and
// the status change is a conditional update, so two staff members (or a double click) cannot both
// "win".
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/auth";
import { verifyOrigin } from "@/lib/csrf";
import { logAction } from "@/lib/activity-log";
import { designChangeReviewSchema, formatZodError } from "@/lib/validation";
import { GRANT_TTL_DAYS } from "@/lib/design-lock";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Ctx) {
  try {
    const auth = await requireSuperAdmin(request);
    if (!auth.ok) return NextResponse.json({ error: "Accès réservé à la plateforme" }, { status: auth.status });
    const csrf = verifyOrigin(request);
    if (csrf) return csrf;

    const { id } = await params;
    const parsed = designChangeReviewSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 });
    const { action, note } = parsed.data;

    const existing = await prisma.designChangeRequest.findUnique({ where: { id }, select: { id: true, clubId: true, status: true } });
    if (!existing) return NextResponse.json({ error: "Demande introuvable" }, { status: 404 });

    const now = new Date();
    const result = await prisma.designChangeRequest.updateMany({
      where: { id, status: "PENDING" },
      data: {
        status: action === "approve" ? "APPROVED" : "REJECTED",
        reviewedBy: auth.user.id,
        reviewNote: note || null,
        reviewedAt: now,
        expiresAt: action === "approve" ? new Date(now.getTime() + GRANT_TTL_DAYS * 86_400_000) : null,
      },
    });
    if (result.count === 0) {
      return NextResponse.json({ error: `Cette demande est déjà ${existing.status === "PENDING" ? "traitée" : "au statut " + existing.status}.` }, { status: 409 });
    }

    await logAction(request, {
      clubId: existing.clubId,
      actorId: auth.user.id, actorName: auth.user.name, actorRole: "SUPER_ADMIN",
      action: action === "approve" ? "DESIGN_CHANGE_APPROVED" : "DESIGN_CHANGE_REJECTED",
      category: "SETTINGS", targetId: id,
    });
    const updated = await prisma.designChangeRequest.findUnique({
      where: { id },
      select: { id: true, status: true, reviewNote: true, reviewedAt: true, expiresAt: true },
    });
    return NextResponse.json({ request: updated });
  } catch (error) {
    console.error("Platform design-requests PATCH error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
