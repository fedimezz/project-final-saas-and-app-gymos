import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { Prisma, DomainRequestStatus } from "@prisma/client";
import { requireSuperAdmin } from "@/lib/auth";

const DENIED = "Accès réservé à la plateforme";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireSuperAdmin(request);
    if (!auth.ok) return NextResponse.json({ error: DENIED }, { status: auth.status });

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const page = Math.max(1, Number(searchParams.get("page")) || 1);
    const limit = 25;

    const validStatus = status && (Object.values(DomainRequestStatus) as string[]).includes(status);
    const where: Prisma.DomainRequestWhereInput = validStatus
      ? { status: status as DomainRequestStatus }
      : {};

    const [requests, total, byStatus] = await Promise.all([
      prisma.domainRequest.findMany({
        where,
        include: { club: { select: { id: true, name: true, slug: true } } },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.domainRequest.count({ where }),
      prisma.domainRequest.groupBy({ by: ["status"], _count: { _all: true } }),
    ]);

    const requesterIds = [...new Set(requests.map((r) => r.requestedBy))];
    const requesters = requesterIds.length
      ? await prisma.user.findMany({ where: { id: { in: requesterIds } }, select: { id: true, name: true, email: true } })
      : [];
    const requesterById = new Map(requesters.map((u) => [u.id, u]));

    const countByStatus: Record<string, number> = { PENDING: 0, APPROVED: 0, REJECTED: 0, CONFIGURING: 0, ACTIVE: 0 };
    for (const row of byStatus) countByStatus[row.status] = row._count._all;

    return NextResponse.json({
      requests: requests.map((r) => ({ ...r, requester: requesterById.get(r.requestedBy) ?? null })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      countByStatus,
    });
  } catch (error) {
    console.error("Platform domain-requests GET error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
