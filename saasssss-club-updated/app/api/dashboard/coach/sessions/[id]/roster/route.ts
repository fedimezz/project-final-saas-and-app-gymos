import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireCoach } from "@/lib/auth";
import { hasCoachPermission } from "@/lib/permissions";

// GET /api/dashboard/coach/sessions/[id]/roster — members booked into one
// of THIS coach's own sessions, with their attendance status for today's
// occurrence. Scoped to sessions owned by the requesting coach so a coach
// can't pull another coach's roster by guessing a session id.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireCoach(request);
  if (!auth.ok) return NextResponse.json({ error: "Accès refusé" }, { status: auth.status });
  if (!(await hasCoachPermission(auth.user, "coach.roster.view"))) {
    return NextResponse.json({ error: "Permission désactivée par le propriétaire" }, { status: 403 });
  }

  try {
    const { id: sessionId } = await params;

    const coach = await prisma.coach.findFirst({ where: { userId: auth.user.id, clubId: auth.user.clubId! } });
    if (!coach) {
      return NextResponse.json({ error: "Aucun profil coach lié à ce compte" }, { status: 404 });
    }

    // clubId enforced: session must belong to this gym AND this coach
    const session = await prisma.session.findFirst({ where: { id: sessionId, clubId: auth.user.clubId!, coachId: coach.id } });
    if (!session) {
      return NextResponse.json({ error: "Séance introuvable" }, { status: 404 });
    }

    const bookings = await prisma.userSession.findMany({
      where: { sessionId, clubId: auth.user.clubId!, isCancelled: false },
      include: { user: { select: { id: true, name: true, avatar: true } } },
      orderBy: { bookedAt: "asc" },
      take: 500,
    });

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const attendances = await prisma.attendance.findMany({
      where: { sessionId, checkInTime: { gte: todayStart } },
    });
    const checkedInUserIds = new Set(attendances.map((a) => a.userId));

    const roster = bookings.map((b) => ({
      userId: b.user.id,
      name: b.user.name,
      avatar: b.user.avatar,
      checkedIn: checkedInUserIds.has(b.user.id),
    }));

    return NextResponse.json({ session: { id: session.id, activity: session.activity, day: session.day, startTime: session.startTime }, roster });
  } catch (error) {
    console.error("Coach roster GET error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
