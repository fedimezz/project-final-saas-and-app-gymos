import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireCoach } from "@/lib/auth";

// GET /api/dashboard/coach/sessions — this coach's sessions in the active
// weekly plan, so they can see their own week without any admin access.
export async function GET(request: NextRequest) {
  const auth = await requireCoach(request);
  if (!auth.ok) return NextResponse.json({ error: "Accès refusé" }, { status: auth.status });

  try {
    const coach = await prisma.coach.findFirst({ where: { userId: auth.user.id, clubId: auth.user.clubId! } });
    if (!coach) {
      return NextResponse.json({ error: "Aucun profil coach lié à ce compte" }, { status: 404 });
    }

    const sessions = await prisma.session.findMany({
      where: { coachId: coach.id, clubId: auth.user.clubId!, weeklyPlan: { isActive: true } },
      select: {
        id: true,
        day: true,
        startTime: true,
        endTime: true,
        activity: true,
        location: true,
        capacity: true,
        currentBookings: true,
      },
      orderBy: [{ day: "asc" }, { startTime: "asc" }],
      take: 100,
    });

    return NextResponse.json({ coach: { id: coach.id, name: coach.name }, sessions });
  } catch (error) {
    console.error("Coach sessions GET error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
