import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { getSessionDateTime } from "@/lib/session-date";

// GET /api/dashboard — member KPIs, upcoming session, and activity history.
// All queries are scoped by BOTH userId (ownership) AND clubId (tenant isolation).
export async function GET(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if (!auth.ok) return NextResponse.json({ error: "Non autorisé" }, { status: auth.status });
    const userId = auth.user.id;
    const clubId = auth.user.clubId!;
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [
      user,
      totalBookings,
      completedAttendances,
      upcomingUserSessions,
      activeSubscription,
      weeklyAttendances,
      recentAttendances,
    ] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId, clubId },
        select: { name: true },
      }),
      prisma.userSession.count({ where: { userId, clubId, isCancelled: false } }),
      prisma.attendance.count({ where: { userId, clubId } }),
      prisma.userSession.findMany({
        where: {
          userId,
          clubId,
          isCancelled: false,
          session: { weeklyPlan: { isActive: true } },
        },
        include: { session: { include: { weeklyPlan: true } } },
      }),
      prisma.subscription.findFirst({
        where: { userId, clubId, status: "ACTIVE" },
        include: { plan: { select: { name: true } } },
        orderBy: { startDate: "desc" },
      }),
      prisma.attendance.findMany({
        where: { userId, clubId, checkInTime: { gte: sevenDaysAgo } },
        select: { checkInTime: true },
      }),
      prisma.attendance.findMany({
        where: { userId, clubId, checkInTime: { gte: thirtyDaysAgo } },
        select: { id: true, checkInTime: true, session: { select: { activity: true } } },
        orderBy: { checkInTime: "desc" },
        take: 5,
      }),
    ]);

    if (!user) return NextResponse.json({ error: "Utilisateur introuvable" }, { status: 404 });

    // Resolve the real next session
    const upcoming = upcomingUserSessions
      .map((us) => {
        const { session } = us;
        const dt = getSessionDateTime(session.weeklyPlan.weekStart, session.day, session.startTime);
        return { session, dt };
      })
      .filter((entry) => entry.dt.getTime() >= now.getTime())
      .sort((a, b) => a.dt.getTime() - b.dt.getTime());

    const nextSession = upcoming[0]?.session ?? null;

    // 7-day activity histogram (Mon..Sun)
    const dayBuckets = [0, 0, 0, 0, 0, 0, 0];
    weeklyAttendances.forEach((a) => {
      const jsDay = new Date(a.checkInTime).getDay();
      const idx = jsDay === 0 ? 6 : jsDay - 1;
      dayBuckets[idx] += 1;
    });
    const maxBucket = Math.max(...dayBuckets, 1);
    const weeklyActivity = dayBuckets.map((v) => Math.round((v / maxBucket) * 100));

    const membershipStatus =
      activeSubscription &&
      activeSubscription.endDate &&
      new Date(activeSubscription.endDate) >= now
        ? "Active"
        : "Inactive";

    const daysUntilExpiry =
      activeSubscription?.endDate
        ? Math.max(
            0,
            Math.ceil(
              (new Date(activeSubscription.endDate).getTime() - now.getTime()) / 86400000
            )
          )
        : null;

    return NextResponse.json({
      userName: user.name ?? "Membre",
      stats: {
        totalBookings,
        completedAttendances,
        membershipStatus,
        daysUntilExpiry,
        planName: activeSubscription?.plan?.name ?? null,
      },
      upcomingSession: nextSession
        ? {
            activity: nextSession.activity,
            day: nextSession.day,
            startTime: nextSession.startTime,
            endTime: nextSession.endTime,
            coach: nextSession.coach,
            location: nextSession.location,
          }
        : null,
      weeklyActivity,
      recentAttendances: recentAttendances.map((a) => ({
        id: a.id,
        activity: a.session?.activity ?? null,
        checkInTime: a.checkInTime,
      })),
    });
  } catch (error) {
    console.error("Dashboard GET error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
