import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireCoach } from "@/lib/auth";
import { hasCoachPermission } from "@/lib/permissions";
import { attendanceCheckinSchema, formatZodError } from "@/lib/validation";
import { logAction } from "@/lib/activity-log";

// POST /api/dashboard/coach/attendance — check a member in for one of the
// coach's own sessions (or un-check them in, by passing undo:true).
// Scoped to the requesting coach's own sessions, same as the roster route.
export async function POST(request: NextRequest) {
  const auth = await requireCoach(request);
  if (!auth.ok) return NextResponse.json({ error: "Accès refusé" }, { status: auth.status });
  if (!(await hasCoachPermission(auth.user, "coach.attendance.mark"))) {
    return NextResponse.json({ error: "Permission désactivée par le propriétaire" }, { status: 403 });
  }

  try {
    const rawBody = await request.json().catch(() => null);
    const parsed = attendanceCheckinSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 });
    }
    const { sessionId, userId, undo } = parsed.data;

    const coach = await prisma.coach.findFirst({ where: { userId: auth.user.id, clubId: auth.user.clubId as string } });
    if (!coach) {
      return NextResponse.json({ error: "Aucun profil coach lié à ce compte" }, { status: 404 });
    }

    const session = await prisma.session.findFirst({ where: { id: sessionId, clubId: auth.user.clubId as string } });
    if (!session || session.coachId !== coach.id) {
      return NextResponse.json({ error: "Séance introuvable" }, { status: 404 });
    }

    const booking = await prisma.userSession.findFirst({
      where: { sessionId, userId, isCancelled: false },
    });
    if (!booking) {
      return NextResponse.json({ error: "Ce membre n'est pas inscrit à cette séance" }, { status: 400 });
    }

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    if (undo) {
      const { count } = await prisma.attendance.deleteMany({
        where: { sessionId, userId, checkInTime: { gte: todayStart } },
      });
      if (count > 0) {
        const member = await prisma.user.findFirst({ where: { id: userId, clubId: auth.user.clubId }, select: { name: true } });
        await logAction(request, {
          clubId: auth.user.clubId,
          actorId: auth.user.id,
          actorName: auth.user.name,
          actorRole: auth.user.role,
          action: "ATTENDANCE_UNDONE",
          category: "SESSION",
          targetId: userId,
          targetName: member?.name,
          detail: { sessionId, activity: session.activity },
        });
      }
      return NextResponse.json({ checkedIn: false });
    }

    const existing = await prisma.attendance.findFirst({
      where: { sessionId, userId, checkInTime: { gte: todayStart } },
    });
    if (!existing) {
      await prisma.attendance.create({
        data: { userId, sessionId, clubId: auth.user.clubId as string, createdBy: auth.user.id },
      });
      const member = await prisma.user.findFirst({ where: { id: userId, clubId: auth.user.clubId }, select: { name: true } });
      await logAction(request, {
        clubId: auth.user.clubId,
        actorId: auth.user.id,
        actorName: auth.user.name,
        actorRole: auth.user.role,
        action: "ATTENDANCE_CHECKED_IN",
        category: "SESSION",
        targetId: userId,
        targetName: member?.name,
        detail: { sessionId, activity: session.activity },
      });
    }

    return NextResponse.json({ checkedIn: true });
  } catch (error) {
    console.error("Coach attendance POST error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
