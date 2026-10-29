// GET /api/platform/manual-payments?status=PENDING|APPROVED|CONFIRMED|REJECTED|CANCELLED|ALL — SUPER_ADMIN only.
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/auth";

const STATUSES = ["PENDING", "APPROVED", "CONFIRMED", "REJECTED", "CANCELLED"] as const;

export async function GET(request: NextRequest) {
  const auth = await requireSuperAdmin(request);
  if (!auth.ok) return NextResponse.json({ error: "Accès réservé à la plateforme" }, { status: auth.status });
  const status = request.nextUrl.searchParams.get("status") ?? "PENDING";
  const where = (STATUSES as readonly string[]).includes(status) ? { status: status as (typeof STATUSES)[number] } : {};
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
