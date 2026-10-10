import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireOwner } from "@/lib/auth";

// The activity journal records what every staff member did (including other
// admins), so it is OWNER-only. Regular ADMIN accounts are refused here on the
// server — hiding the menu entry alone would not protect the data. SUPER_ADMIN
// reads club logs through /api/platform/logs (cross-tenant, platform area), and
// has no gym session on this route by design (requireOwner rejects it).
export async function GET(request: NextRequest) {
  try {
    const auth = await requireOwner(request);
    if (!auth.ok) return NextResponse.json({ error: "Accès réservé au propriétaire" }, { status: auth.status });

    // Every log query MUST be scoped to the club's ID — never leak cross-tenant data.
    const clubId = auth.user.clubId;
    if (!clubId) return NextResponse.json({ error: "Club introuvable" }, { status: 400 });

    const { searchParams } = new URL(request.url);

    const requestedPage = Number.parseInt(searchParams.get("page") ?? "1", 10);
    const page      = Number.isFinite(requestedPage) ? Math.min(1000, Math.max(1, requestedPage)) : 1;
    const limit     = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "50", 10)));
    const skip      = (page - 1) * limit;
    const category  = searchParams.get("category") ?? undefined;
    const actorRole = searchParams.get("actorRole") ?? undefined;
    const search    = searchParams.get("search")?.trim() ?? undefined;
    const from      = searchParams.get("from") ?? undefined;
    const to        = searchParams.get("to") ?? undefined;
    const exportAll = searchParams.get("export") === "1";

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = { clubId }; // ← always scoped to this club
    if (category)  where.category  = category;
    if (actorRole) where.actorRole = actorRole;
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to)   where.createdAt.lte = new Date(to + "T23:59:59.999Z");
    }
    if (search) {
      where.OR = [
        { action:     { contains: search, mode: "insensitive" } },
        { actorName:  { contains: search, mode: "insensitive" } },
        { targetName: { contains: search, mode: "insensitive" } },
      ];
    }

    if (exportAll) {
      // Return up to 5 000 rows as JSON for CSV export on the client
      const logs = await prisma.activityLog.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 5000,
      });
      return NextResponse.json({ logs });
    }

    const [logs, total] = await Promise.all([
      prisma.activityLog.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip,
        take: limit,
      }),
      prisma.activityLog.count({ where }),
    ]);

    // Quick stats for the summary bar
    const [totalToday, byCategory] = await Promise.all([
      prisma.activityLog.count({
        where: {
          clubId,
          createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
        },
      }),
      prisma.activityLog.groupBy({
        by: ["category"],
        where: { clubId },
        _count: { _all: true },
        orderBy: { _count: { category: "desc" } },
      }),
    ]);

    return NextResponse.json({
      logs,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      stats: {
        totalToday,
        byCategory: byCategory.map((r: { category: string; _count: { _all: number } }) => ({ category: r.category, count: r._count._all })),
      },
    });
  } catch (error) {
    console.error("Admin logs GET error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

// DELETE — purge logs older than N days (owner only)
export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireOwner(request);
    if (!auth.ok) return NextResponse.json({ error: "Accès réservé au propriétaire" }, { status: auth.status });

    const clubId = auth.user.clubId;
    if (!clubId) return NextResponse.json({ error: "Club introuvable" }, { status: 400 });

    const { days } = await request.json().catch(() => ({ days: 90 }));
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - Math.max(1, Number(days)));

    const { count } = await prisma.activityLog.deleteMany({
      where: { clubId, createdAt: { lt: cutoff } },
    });

    const { logAction } = await import("@/lib/activity-log");
    await logAction(request, {
      actorId: auth.user.id, actorName: auth.user.name, actorRole: auth.user.role,
      action: "LOGS_PURGED",
      category: "SYSTEM",
      detail: { deletedCount: count, olderThanDays: days },
    });

    return NextResponse.json({ deleted: count });
  } catch (error) {
    console.error("Admin logs DELETE error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}