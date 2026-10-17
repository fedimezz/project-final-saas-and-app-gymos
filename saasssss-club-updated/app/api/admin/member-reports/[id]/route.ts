// PATCH /api/admin/member-reports/[id] — update a report's status/adminNote
// Used by the "Signalements des membres" panel in /admin/reports.
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { ReportStatus } from "@prisma/client";
import { formatZodError, memberReportUpdateSchema } from "@/lib/validation";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.ok) return NextResponse.json({ error: "Accès refusé" }, { status: auth.status });
    if (!(await hasPermission(auth.user, "reports.view"))) {
      return NextResponse.json({ error: "Permission requise : consulter les rapports" }, { status: 403 });
    }

    const { id } = await params;
    const rawBody = await request.json().catch(() => null);
    const parsed = memberReportUpdateSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 });
    }
    const { status, adminNote } = parsed.data;

    const existing = await prisma.memberReport.findFirst({ where: { id, clubId: auth.user.clubId as string } });
    if (!existing) return NextResponse.json({ error: "Rapport introuvable" }, { status: 404 });

    const updateData: Record<string, unknown> = {};
    if (status !== undefined) {
      updateData.status = status as ReportStatus;
      updateData.treatedBy = auth.user.id;
      updateData.treatedAt = new Date();
    }
    if (adminNote !== undefined) updateData.adminNote = adminNote;

    const updated = await prisma.memberReport.update({
      where: { id },
      data: updateData,
      include: { user: { select: { id: true, name: true, email: true, phone: true } } },
    });

    return NextResponse.json({ report: updated });
  } catch (error) {
    console.error("Admin member-reports PATCH error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

// DELETE /api/admin/member-reports/[id] — remove a report entirely
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.ok) return NextResponse.json({ error: "Accès refusé" }, { status: auth.status });
    if (!(await hasPermission(auth.user, "reports.view"))) {
      return NextResponse.json({ error: "Permission requise : consulter les rapports" }, { status: 403 });
    }

    const { id } = await params;
    const existing = await prisma.memberReport.findFirst({ where: { id, clubId: auth.user.clubId as string } });
    if (!existing) return NextResponse.json({ error: "Rapport introuvable" }, { status: 404 });

    await prisma.memberReport.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Admin member-reports DELETE error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
