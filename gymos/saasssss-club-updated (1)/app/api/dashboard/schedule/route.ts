import { NextRequest, NextResponse } from "next/server";
import { ActivityType } from "@prisma/client";
import prisma from "@/lib/prisma";
import { requireUser } from "@/lib/auth";

function parseCalendarDate(value: string | null): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date;
}

function mondayOf(date: Date): Date {
  const result = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = result.getUTCDay();
  result.setUTCDate(result.getUTCDate() + (day === 0 ? -6 : 1 - day));
  return result;
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if (!auth.ok) return NextResponse.json({ error: "Non autorisé" }, { status: auth.status });

    const activity = request.nextUrl.searchParams.get("activity");
    const requestedDate = parseCalendarDate(request.nextUrl.searchParams.get("weekStart"));
    const targetMonday = requestedDate ? mondayOf(requestedDate) : null;

    // A member should see the selected calendar week when it exists. If no
    // week is requested, use the one explicitly activated by staff. Never
    // fall back to a different week just because another plan exists.
    const weeklyPlan = targetMonday
      ? await prisma.weeklyPlan.findFirst({
          where: {
            clubId: auth.user.clubId as string,
            weekStart: targetMonday,
            isArchived: false,
          },
          orderBy: { createdAt: "desc" },
        })
      : await prisma.weeklyPlan.findFirst({
          where: { clubId: auth.user.clubId as string, isActive: true, isArchived: false },
          orderBy: { weekStart: "desc" },
        });

    if (!weeklyPlan) {
      const response = NextResponse.json({ weeklyPlan: null, sessions: [] });
      response.headers.set("Cache-Control", "no-store, max-age=0");
      return response;
    }

    const sessions = await prisma.session.findMany({
      where: {
        weeklyPlanId: weeklyPlan.id,
        ...(activity && (Object.values(ActivityType) as string[]).includes(activity) ? { activity: activity as ActivityType } : {}),
      },
      include: {
        userSessions: {
          where: { userId: auth.user.id, isCancelled: false },
          select: { id: true },
        },
      },
      orderBy: [{ day: "asc" }, { startTime: "asc" }],
    });

    const formatted = sessions.map(({ userSessions, ...session }) => ({
      ...session,
      isBookedByUser: userSessions.length > 0,
      isFull: session.currentBookings >= session.capacity,
      spotsLeft: Math.max(0, session.capacity - session.currentBookings),
    }));

    const response = NextResponse.json({
      weeklyPlan: { id: weeklyPlan.id, weekStart: weeklyPlan.weekStart, weekEnd: weeklyPlan.weekEnd },
      sessions: formatted,
    });
    response.headers.set("Cache-Control", "no-store, max-age=0");
    return response;
  } catch (error) {
    console.error("Schedule GET error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
