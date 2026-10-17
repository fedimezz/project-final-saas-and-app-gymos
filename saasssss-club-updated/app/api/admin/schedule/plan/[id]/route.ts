import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { requireAdmin } from "@/lib/auth";
import { notifyAllMembers } from "@/lib/notify";
import { sendPushToUsers } from "@/lib/push";
import { runAfter } from "@/lib/after";
import { hasPermission } from "@/lib/permissions";
import { formatZodError, weeklyPlanActionSchema } from "@/lib/validation";

// PATCH /api/admin/schedule/plan/[id] — activate or archive a WeeklyPlan
//
// This was previously missing from this route file (it only had DELETE),
// which caused every "Activer"/"Archiver" click from the admin schedule
// page to hit a 405 Method Not Allowed with an empty body.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.ok) return NextResponse.json({ error: "Accès refusé" }, { status: auth.status });
    const admin = auth.user;
    if (!(await hasPermission(admin, "planning.manage"))) {
      return NextResponse.json({ error: "Permission requise : gérer le planning" }, { status: 403 });
    }

    const { id } = await params;
    const rawBody = await request.json().catch(() => null);
    const parsed = weeklyPlanActionSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 });
    }
    const { action } = parsed.data;

    const clubId = admin.clubId as string;

    if (action === "activate") {
      // Verify the target belongs to THIS club before touching anything.
      // (This used to deactivate the club's current plan first and only then
      // discover the target didn't exist, leaving the club with no active plan.)
      const existing = await prisma.weeklyPlan.findFirst({ where: { id, clubId }, select: { id: true } });
      if (!existing) return NextResponse.json({ error: "Planning introuvable" }, { status: 404 });

      const plan = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        await tx.weeklyPlan.updateMany({
          where: { isActive: true, clubId, id: { not: id } },
          data: { isActive: false },
        });
        await tx.weeklyPlan.updateMany({ where: { id, clubId }, data: { isActive: true } });
        return tx.weeklyPlan.findFirstOrThrow({
          where: { id, clubId },
          include: { _count: { select: { sessions: true } } },
        });
      });

      runAfter(() =>
        notifyAllMembers(clubId, {
          title: "Nouveau planning disponible",
          message: `Le planning de la semaine du ${new Date(plan.weekStart).toLocaleDateString("fr-FR")} est maintenant actif.`,
          type: "SCHEDULE_ACTIVATED",
          data: { planId: plan.id },
        })
      );

      return NextResponse.json({ plan });
    }

    if (action === "archive") {
      const existing = await prisma.weeklyPlan.findFirst({ where: { id, clubId }, select: { id: true } });
      if (!existing) return NextResponse.json({ error: "Planning introuvable" }, { status: 404 });

      await prisma.weeklyPlan.updateMany({
        where: { id, clubId },
        data: { isArchived: true, isActive: false },
      });
      const plan = await prisma.weeklyPlan.findFirstOrThrow({ where: { id, clubId } });
      return NextResponse.json({ plan });
    }

    return NextResponse.json({ error: "Action invalide" }, { status: 400 });
  } catch (error) {
    console.error("Admin plan PATCH error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

// DELETE /api/admin/schedule/plan/[id]
// Cancels all active bookings across every session, notifies affected members,
// then deletes sessions and the plan in one transaction.
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.ok) return NextResponse.json({ error: "Accès refusé" }, { status: auth.status });
    const admin = auth.user;
    if (!(await hasPermission(admin, "planning.manage"))) {
      return NextResponse.json({ error: "Permission requise : gérer le planning" }, { status: 403 });
    }

    const { id: planId } = await params;
    const clubId = admin.clubId as string;

    // Scoped by clubId: without it, an admin of ANY club (anyone can create
    // one through onboarding) could delete another club's plan, sessions and
    // bookings by id. A foreign id is indistinguishable from a missing one.
    const plan = await prisma.weeklyPlan.findFirst({
      where: { id: planId, clubId },
      include: {
        sessions: {
          include: {
            userSessions: {
              where: { isCancelled: false },
              select: { id: true, userId: true },
            },
          },
        },
      },
    });

    if (!plan) {
      return NextResponse.json({ error: "Planning introuvable" }, { status: 404 });
    }

    // One notification per member (deduplicated), regardless of how many
    // sessions they were booked into.
    const affectedUserIds: string[] = [
      ...new Set<string>(
        plan.sessions.flatMap((s: { userSessions: { userId: string }[] }) => s.userSessions.map((us: { userId: string }) => us.userId))
      ),
    ];

    const activeUserSessionIds: string[] = plan.sessions.flatMap((s: { userSessions: { id: string }[] }) =>
      s.userSessions.map((us: { id: string }) => us.id)
    );

    const weekLabel = new Date(plan.weekStart).toLocaleDateString("fr-FR", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });

    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // 1. Cancel all active bookings across all sessions
      if (activeUserSessionIds.length > 0) {
        await tx.userSession.updateMany({
          where: { id: { in: activeUserSessionIds } },
          data: { isCancelled: true, cancelledAt: new Date() },
        });
      }

      // 2. One notification per affected member
      if (affectedUserIds.length > 0) {
        await tx.notification.createMany({
          data: affectedUserIds.map((userId) => ({
            userId,
            clubId,
            title: "Planning annulé",
            message: `Le planning de la semaine du ${weekLabel} a été supprimé. Toutes vos réservations sur cette semaine ont été annulées.`,
            type: "WARNING",
          })),
        });
      }

      // 3. Delete all UserSessions, then Sessions, then the plan
      await tx.userSession.deleteMany({
        where: { clubId, session: { weeklyPlanId: planId, clubId } },
      });
      await tx.session.deleteMany({ where: { weeklyPlanId: planId, clubId } });
      await tx.weeklyPlan.deleteMany({ where: { id: planId, clubId } });
    });

    // Phones of the members whose bookings were just cancelled (the rows above
    // are the in-app notifications; this is the matching real push).
    runAfter(() =>
      sendPushToUsers(clubId, affectedUserIds, {
        title: "Planning annulé",
        body: `Le planning de la semaine du ${weekLabel} a été supprimé. Vos réservations sur cette semaine ont été annulées.`,
        data: { type: "WARNING", kind: "schedule_change" },
      })
    );

    return NextResponse.json({
      success: true,
      notifiedCount: affectedUserIds.length,
    });
  } catch (error) {
    console.error("Admin plan DELETE error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}