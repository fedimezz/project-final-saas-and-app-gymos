// GET /api/platform/logs — SUPER_ADMIN only, cross-tenant activity log
// (deliberately NOT scoped by clubId, unlike GET /api/admin/logs).

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/auth";
import { Prisma } from "@prisma/client";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireSuperAdmin(request);
    if (!auth.ok) return NextResponse.json({ error: "Accès réservé à la plateforme" }, { status: auth.status });

    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category") || undefined;
    const search   = searchParams.get("search")?.trim() || undefined;
    const page     = Math.max(1, Number(searchParams.get("page")) || 1);
    const limit    = 30;

    const where: Prisma.ActivityLogWhereInput = {
      ...(category ? { category } : {}),
      ...(search
        ? {
            OR: [
              { action:     { contains: search, mode: "insensitive" } },
              { actorName:  { contains: search, mode: "insensitive" } },
              { targetName: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const [logs, total, totalToday] = await Promise.all([
      prisma.activityLog.findMany({
        where,
        include: { club: { select: { name: true, slug: true } } },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.activityLog.count({ where }),
      prisma.activityLog.count({
        where: { createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } },
      }),
    ]);

    return NextResponse.json({
      logs,
      totalToday,
      pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    });
  } catch (error) {
    console.error("Platform logs GET error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}