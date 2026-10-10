// PATCH /api/platform/service-requests/[id] { status?, reviewNote? }
// SUPER_ADMIN only. Workflow: PENDING → APPROVED/REJECTED/CANCELLED →
// IN_PROGRESS → COMPLETED. The price snapshot on the request is never touched.
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/auth";
import { verifyOrigin } from "@/lib/csrf";
import { logAction } from "@/lib/activity-log";
import { canTransition, SERVICE_TRANSITIONS, type ServiceStatus } from "@/lib/domain-requests";
import { formatZodError, serviceRequestReviewSchema } from "@/lib/validation";

const DENIED = "Accès réservé à la plateforme";
type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Ctx) {
  try {
    const auth = await requireSuperAdmin(request);
    if (!auth.ok) return NextResponse.json({ error: DENIED }, { status: auth.status });
    const csrf = verifyOrigin(request);
    if (csrf) return csrf;

    const { id } = await params;
    const parsed = serviceRequestReviewSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 });
    }
    const { status, reviewNote } = parsed.data;

    const existing = await prisma.serviceRequest.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Demande introuvable" }, { status: 404 });

    const from = existing.status as ServiceStatus;
    if (status && status !== from && !canTransition(SERVICE_TRANSITIONS, from, status)) {
      return NextResponse.json({ error: `Transition impossible : ${from} → ${status}` }, { status: 409 });
    }

    const data: Prisma.ServiceRequestUpdateInput = { reviewedBy: auth.user.id, reviewedAt: new Date() };
    if (status) {
      data.status = status;
      if (status === "COMPLETED") data.completedAt = new Date();
    }
    if (reviewNote !== undefined) data.reviewNote = reviewNote || null;

    const updated = await prisma.serviceRequest.update({ where: { id }, data });

    await logAction(request, {
      clubId: existing.clubId,
      actorId: auth.user.id, actorName: auth.user.name, actorRole: "SUPER_ADMIN",
      action: `SERVICE_REQUEST_${status ?? "NOTE"}`,
      category: "SETTINGS", targetId: existing.id, targetName: existing.type,
    });

    return NextResponse.json({ request: updated });
  } catch (error) {
    console.error("Platform service request patch error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
