// GET /api/platform/manual-payments?status=PENDING|CONFIRMED|REJECTED|ALL — SUPER_ADMIN only.
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const auth = await requireSuperAdmin(request);
  if (!auth.ok) return NextResponse.json({ error: "Accès réservé à la plateforme" }, { status: auth.status });
  const status = request.nextUrl.searchParams.get("status") ?? "PENDING";
  const where = ["PENDING", "CONFIRMED", "REJECTED", "CANCELLED"].includes(status)
    ? { status: status as "PENDING" | "CONFIRMED" | "REJECTED" | "CANCELLED" }
    : {};
  const rows = await prisma.manualPaymentRequest.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { club: { select: { id: true, name: true, slug: true, status: true } } },
  });
  const plans = await prisma.saasPlan.findMany({
    where: { id: { in: [...new Set(rows.map((r) => r.planId))] } },
    select: { id: true, name: true },
  });
  const planName = new Map(plans.map((p) => [p.id, p.name]));
  return NextResponse.json({ requests: rows.map((r) => ({ ...r, planName: planName.get(r.planId) ?? r.planId })) });
}
