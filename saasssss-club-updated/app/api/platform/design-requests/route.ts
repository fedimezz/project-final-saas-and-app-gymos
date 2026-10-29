// GET /api/platform/design-requests — SUPER_ADMIN only. Cross-tenant queue of theme / 3D-model
// change requests, newest first, with club + requester attached.
import { NextRequest, NextResponse } from "next/server";
import { DesignChangeStatus, Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireSuperAdmin(request);
    if (!auth.ok) return NextResponse.json({ error: "Accès réservé à la plateforme" }, { status: auth.status });

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const page = Math.max(1, Number(searchParams.get("page")) || 1);
    const limit = 25;
    const where: Prisma.DesignChangeRequestWhereInput =
      status && (Object.values(DesignChangeStatus) as string[]).includes(status) ? { status: status as DesignChangeStatus } : {};

    const [requests, total, byStatus] = await Promise.all([
      prisma.designChangeRequest.findMany({
        where,
        include: { club: { select: { id: true, name: true, slug: true } } },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.designChangeRequest.count({ where }),
      prisma.designChangeRequest.groupBy({ by: ["status"], _count: { _all: true } }),
    ]);
    const requesterIds = [...new Set(requests.map((r) => r.requestedBy))];
    const requesters = requesterIds.length
      ? await prisma.user.findMany({ where: { id: { in: requesterIds } }, select: { id: true, name: true, email: true } })
      : [];
    const byId = new Map(requesters.map((u) => [u.id, u]));
    const countByStatus: Record<string, number> = {};
    for (const row of byStatus) countByStatus[row.status] = row._count._all;

    return NextResponse.json({
      requests: requests.map((r) => ({ ...r, consumedTxid: undefined, requester: byId.get(r.requestedBy) ?? null })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      countByStatus,
    });
  } catch (error) {
    console.error("Platform design-requests GET error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
