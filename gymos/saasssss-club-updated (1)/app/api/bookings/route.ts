import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireUser } from "@/lib/auth";

// GET /api/bookings
// Returns all of the user's bookings, classified into upcoming / past / cancelled.
//
// "Upcoming" vs "past" is determined relative to the session's weekly plan:
// a session belongs to an active (non-archived) weekly plan is treated as
// upcoming unless explicitly cancelled; everything tied to an archived plan
// is treated as past. This matches how WeeklyPlan/Session are used elsewhere
// (no per-session absolute date exists in the schema — only day-of-week +
// time within a given week).
export async function GET(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if (!auth.ok) {
      return NextResponse.json({ error: "Non autorisé" }, { status: auth.status });
    }
    const userId = auth.user.id;

    const userSessions = await prisma.userSession.findMany({
      where: { userId },
      include: {
        session: {
          include: { weeklyPlan: true },
        },
      },
      orderBy: { bookedAt: "desc" },
      take: 1000,
    });

    const upcoming: typeof userSessions = [];
    const past: typeof userSessions = [];
    const cancelled: typeof userSessions = [];

    for (const us of userSessions) {
      if (us.isCancelled) {
        cancelled.push(us);
      } else if (us.session.weeklyPlan.isArchived) {
        past.push(us);
      } else {
        upcoming.push(us);
      }
    }

    const format = (list: typeof userSessions) =>
      list.map((us) => ({
        id: us.id,
        sessionId: us.sessionId,
        bookedAt: us.bookedAt,
        cancelledAt: us.cancelledAt,
        isCancelled: us.isCancelled,
        session: {
          id: us.session.id,
          day: us.session.day,
          startTime: us.session.startTime,
          endTime: us.session.endTime,
          activity: us.session.activity,
          coach: us.session.coach,
          location: us.session.location,
        },
        weeklyPlan: {
          weekStart: us.session.weeklyPlan.weekStart,
          weekEnd: us.session.weeklyPlan.weekEnd,
          isArchived: us.session.weeklyPlan.isArchived,
        },
      }));

    return NextResponse.json({
      upcoming: format(upcoming),
      past: format(past),
      cancelled: format(cancelled),
    });
  } catch (error) {
    console.error("Bookings GET error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}