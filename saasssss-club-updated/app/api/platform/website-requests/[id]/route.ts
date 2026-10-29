// PATCH /api/platform/website-requests/[id] { action: "approve"|"reject"|"apply", note? }
// SUPER_ADMIN only. This is a workflow/status tracker, not an automated
// content-change engine — "apply" records that staff made the change
// (through the normal admin tools, on the club's behalf, or by lifting the
// lock) rather than performing it itself.
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/auth";
import { verifyOrigin } from "@/lib/csrf";
import { logAction } from "@/lib/activity-log";
import { formatZodError, websiteChangeRequestReviewSchema } from "@/lib/validation";

const DENIED = "Accès réservé à la plateforme";
type Ctx = { params: Promise<{ id: string }> };

const ACTION_TO_STATUS = {
  approve: "APPROVED",
  reject: "REJECTED",
  apply: "APPLIED",
} as const;

export async function PATCH(request: NextRequest, { params }: Ctx) {
  try {
    const auth = await requireSuperAdmin(request);
    if (!auth.ok) return NextResponse.json({ error: DENIED }, { status: auth.status });
    const csrfResponse = verifyOrigin(request);
    if (csrfResponse) return csrfResponse;

    const { id } = await params;
    const rawBody = await request.json().catch(() => null);
    const parsed = websiteChangeRequestReviewSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 });
    }
    const { action, note } = parsed.data;

    const existing = await prisma.websiteChangeRequest.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Demande introuvable" }, { status: 404 });

    const updated = await prisma.websiteChangeRequest.update({
      where: { id },
      data: {
        status: ACTION_TO_STATUS[action],
        reviewedBy: auth.user.id,
        reviewNote: note || null,
        reviewedAt: new Date(),
      },
    });

    await logAction(request, {
      clubId: existing.clubId,
      actorId: auth.user.id, actorName: auth.user.name, actorRole: "SUPER_ADMIN",
      action: `WEBSITE_CHANGE_REQUEST_${ACTION_TO_STATUS[action]}`,
      category: "CONTENT",
      targetId: existing.id,
    });

    return NextResponse.json({ request: updated });
  } catch (error) {
    console.error("Platform website-requests PATCH error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
