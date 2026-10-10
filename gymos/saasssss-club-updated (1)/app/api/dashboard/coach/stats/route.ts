// GET /api/dashboard/coach/stats — KPIs for the coach dashboard widget.
// Scoped to the requesting coach's own sessions in this gym.
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireCoach } from "@/lib/auth";
import { hasCoachPermission } from "@/lib/permissions";

export async function GET(request: NextRequest) {
  const auth = await requireCoach(request);
  if (!auth.ok) return NextResponse.json({ error: "Accès refusé" }, { status: auth.status });
  if (!(await hasCoachPermission(auth.user, "coach.stats.view"))) {
    return NextResponse.json({ error: "Permission désactivée par le propriétaire" }, { status: 403 });
  }

  try {
    const clubId = auth.user.clubId!;

    const coach = await prisma.coach.findFirst({ where: { userId: auth.user.id, clubId } });
    if (!coach) return NextResponse.json({ error: "Profil coach introuvable" }, { status: 404 });

    const [
      totalSessions,
      totalBookings,
      totalAttendances,
    ] = await Promise.all([
      prisma.session.count({ where: { coachId: coach.id, clubId } }),
      prisma.userSession.count({ where: { session: { coachId: coach.id, clubId }, isCancelled: false } }),
      prisma.attendance.count({ where: { session: { coachId: coach.id, clubId } } }),
    ]);

    // Fill rate across all sessions: total bookings / (sum of capacity across all sessions)
    const capacityAgg = await prisma.session.aggregate({
      where: { coachId: coach.id, clubId },
      _sum: { capacity: true },
    });
    const totalCapacity = capacityAgg._sum.capacity ?? 0;
    const fillRate = totalCapacity > 0
      ? Math.round((totalBookings / totalCapacity) * 100)
      : 0;

    return NextResponse.json({
      coachId: coach.id,
      coachName: coach.name,
      totalSessions,
      totalBookings,
      totalAttendances,
      fillRate,
    });
  } catch (error) {
    console.error("Coach stats GET error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
