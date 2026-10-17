// GET /api/admin/member-reports?status= — list member-submitted reports
// (complaints/issues) for Admin/Owner to review and treat.
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { Prisma, ReportStatus } from "@prisma/client";

const VALID_STATUSES = ["PENDING", "IN_PROGRESS", "RESOLVED"];

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.ok) return NextResponse.json({ error: "Accès refusé" }, { status: auth.status });
    if (!(await hasPermission(auth.user, "reports.view"))) {
      return NextResponse.json({ error: "Permission requise : consulter les rapports" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");

    const where: Prisma.MemberReportWhereInput =
        status && VALID_STATUSES.includes(status)
            ? { clubId: auth.user.clubId as string, status: status as ReportStatus }
            : { clubId: auth.user.clubId as string };

    const reports = await prisma.memberReport.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, email: true, phone: true } },
      },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      take: 200,
    });

    const counts = await prisma.memberReport.groupBy({
      by: ["status"],
      where: { clubId: auth.user.clubId as string },
      _count: { _all: true },
    });
    const countByStatus: Record<string, number> = { PENDING: 0, IN_PROGRESS: 0, RESOLVED: 0 };
    for (const c of counts) countByStatus[c.status] = c._count._all;

    return NextResponse.json({ reports, countByStatus });
  } catch (error) {
    console.error("Admin member-reports GET error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}