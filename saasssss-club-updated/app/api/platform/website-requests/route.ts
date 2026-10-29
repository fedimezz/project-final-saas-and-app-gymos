// GET /api/platform/website-requests — SUPER_ADMIN only, cross-tenant list of
// owner-submitted website change requests, with the requesting club and
// owner attached so staff can triage without a second lookup.
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { Prisma, WebsiteChangeRequestStatus } from "@prisma/client";
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

    const validStatus = status && (Object.values(WebsiteChangeRequestStatus) as string[]).includes(status);
    const where: Prisma.WebsiteChangeRequestWhereInput = validStatus
      ? { status: status as WebsiteChangeRequestStatus }
      : {};

    const [requests, total, byStatus] = await Promise.all([
      prisma.websiteChangeRequest.findMany({
        where,
        include: { club: { select: { id: true, name: true, slug: true } } },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.websiteChangeRequest.count({ where }),
      prisma.websiteChangeRequest.groupBy({ by: ["status"], _count: { _all: true } }),
    ]);

    // Attach the requesting owner's name/email (requestedBy is a plain User
    // id, not a Prisma relation — see the model comment) in one extra query
    // rather than N+1.
    const requesterIds = [...new Set(requests.map((r) => r.requestedBy))];
    const requesters = requesterIds.length
      ? await prisma.user.findMany({ where: { id: { in: requesterIds } }, select: { id: true, name: true, email: true } })
      : [];
    const requesterById = new Map(requesters.map((u) => [u.id, u]));

    const countByStatus: Record<string, number> = { PENDING: 0, APPROVED: 0, REJECTED: 0, APPLIED: 0 };
    for (const row of byStatus) countByStatus[row.status] = row._count._all;

    return NextResponse.json({
      requests: requests.map((r) => ({ ...r, requester: requesterById.get(r.requestedBy) ?? null })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      countByStatus,
    });
  } catch (error) {
    console.error("Platform website-requests GET error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
