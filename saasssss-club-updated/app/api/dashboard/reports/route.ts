// GET  /api/dashboard/reports — the logged-in member's own reports
// POST /api/dashboard/reports — submit a new report/complaint ("signalement")
//
// This is the member-facing half of the report feature. Staff see and treat
// these from /admin/reports (see app/api/admin/member-reports/route.ts).
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { formatZodError, memberReportSchema } from "@/lib/validation";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if (!auth.ok) return NextResponse.json({ error: "Non autorisé" }, { status: auth.status });

    const reports = await prisma.memberReport.findMany({
      where: { userId: auth.user.id },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ reports });
  } catch (error) {
    console.error("Member reports GET error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if (!auth.ok) return NextResponse.json({ error: "Non autorisé" }, { status: auth.status });

    const rawBody = await request.json().catch(() => null);
    const parsed = memberReportSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 });
    }
    const { subject, message } = parsed.data;

    const report = await prisma.memberReport.create({
      data: {
        clubId: auth.user.clubId as string,
        userId: auth.user.id,
        subject,
        message,
      },
    });

    return NextResponse.json({ report }, { status: 201 });
  } catch (error) {
    console.error("Member reports POST error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
