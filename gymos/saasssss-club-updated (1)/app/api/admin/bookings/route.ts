import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { denyUnlessPermitted } from "@/lib/permission-guard";
import { ActivityType, Prisma } from "@prisma/client";

const CANCELLED_RETENTION_MS = 24 * 60 * 60 * 1000;

async function sweepOldCancelledBookings(clubId: string) {
  const cutoff = new Date(Date.now() - CANCELLED_RETENTION_MS);
  await prisma.userSession.deleteMany({
    where: { clubId, isCancelled: true, cancelledAt: { lte: cutoff } },
  });
}

type SortKey = "bookedAt" | "userName" | "activity";
type SortDir = "asc" | "desc";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.ok) return NextResponse.json({ error: "Accès refusé" }, { status: auth.status });
    const admin = auth.user;
    const denied = await denyUnlessPermitted(admin, "bookings.manage");
    if (denied) return denied;

    await sweepOldCancelledBookings(admin.clubId as string).catch((err) =>
      console.error("sweepOldCancelledBookings failed:", err)
    );

    const { searchParams } = new URL(request.url);
    const search     = searchParams.get("search") ?? "";
    const activity   = searchParams.get("activity");
    const coach      = searchParams.get("coach");
    const weekStart  = searchParams.get("weekStart");
    const cancelled  = searchParams.get("cancelled");
    const page       = Math.max(1, Number(searchParams.get("page")) || 1);
    const rawSortKey = (searchParams.get("sortKey") ?? "bookedAt") as SortKey;
    const rawSortDir = (searchParams.get("sortDir") ?? "desc") as SortDir;
    const limit = 25;

    const validSortKeys: SortKey[] = ["bookedAt", "userName", "activity"];
    const sortKey: SortKey = validSortKeys.includes(rawSortKey) ? rawSortKey : "bookedAt";
    const sortDir: SortDir = rawSortDir === "asc" ? "asc" : "desc";

    // Build session sub-filter (activity + coach + weekStart merged into one)
    const sessionFilter: Prisma.SessionWhereInput = {};
    if (activity && (Object.values(ActivityType) as string[]).includes(activity)) {
      sessionFilter.activity = activity as ActivityType;
    }
    if (coach) sessionFilter.coach = coach;
    if (weekStart) sessionFilter.weeklyPlan = { weekStart: new Date(weekStart) };

    const resolvedBaseWhere: Prisma.UserSessionWhereInput = {
      clubId: admin.clubId as string,
      ...(search && {
        user: {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { email: { contains: search, mode: "insensitive" } },
          ],
        },
      }),
      ...(Object.keys(sessionFilter).length > 0 && { session: sessionFilter }),
    };

    const where: Prisma.UserSessionWhereInput = {
      ...resolvedBaseWhere,
      ...(cancelled === "true"
        ? { isCancelled: true }
        : cancelled === "false"
        ? { isCancelled: false }
        : {}),
    };

    const orderBy: Prisma.UserSessionOrderByWithRelationInput =
      sortKey === "userName"
        ? { user: { name: sortDir } }
        : sortKey === "activity"
        ? { session: { activity: sortDir } }
        : { bookedAt: sortDir };

    const [bookings, total, activeCount, cancelledCount, allCoaches] = await Promise.all([
      prisma.userSession.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              avatar: true,
              _count: { select: { userSessions: true } },
            },
          },
          session: {
            include: {
              weeklyPlan: { select: { weekStart: true, weekEnd: true } },
            },
          },
        },
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.userSession.count({ where }),
      prisma.userSession.count({ where: { ...resolvedBaseWhere, isCancelled: false } }),
      prisma.userSession.count({ where: { ...resolvedBaseWhere, isCancelled: true } }),
      prisma.session.findMany({
        where: { clubId: admin.clubId as string },
        select: { coach: true },
        distinct: ["coach"],
        orderBy: { coach: "asc" },
      }),
    ]);

    return NextResponse.json({
      bookings,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      stats: { active: activeCount, cancelled: cancelledCount, total: activeCount + cancelledCount },
      coaches: allCoaches.map((s: { coach: string }) => s.coach),
    });
  } catch (error) {
    console.error("Admin bookings GET error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.ok) return NextResponse.json({ error: "Accès refusé" }, { status: auth.status });
    const admin = auth.user;
    const denied = await denyUnlessPermitted(admin, "bookings.manage");
    if (denied) return denied;

    const { count } = await prisma.userSession.deleteMany({ where: { clubId: admin.clubId as string, isCancelled: true } });
    return NextResponse.json({ deleted: count });
  } catch (error) {
    console.error("Admin bookings bulk DELETE error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}