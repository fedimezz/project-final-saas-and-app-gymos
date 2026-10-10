import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { resolveCoachLink } from "@/lib/coach-link";
import prisma from "@/lib/prisma";
import { runAfter } from "@/lib/after";
import { Prisma } from "@prisma/client";
import { requireAdmin } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { notifyUsers } from "@/lib/notify";
import { formatZodError, shortTextSchema } from "@/lib/validation";

const DAYS = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"] as const;
const ACTIVITIES = [
  "BODYBUILDING", "FITNESS", "CARDIO", "CROSSFIT", "YOGA", "PILATES",
  "BOXE", "MMA", "AQUAGYM", "PADEL", "ZUMBA", "SPINNING",
] as const;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

const updateSessionSchema = z
  .object({
    day: z.enum(DAYS),
    startTime: z.string().regex(TIME_RE, "Format d'heure invalide (HH:MM)"),
    endTime: z.string().regex(TIME_RE, "Format d'heure invalide (HH:MM)"),
    activity: z.enum(ACTIVITIES),
    coach: z.string().trim().max(100).default(""),
    coachId: z.string().trim().min(1).optional().or(z.literal("")).nullable(),
    capacity: z.coerce.number().int().min(1).max(500),
    location: shortTextSchema(200).optional().or(z.literal("")),
    description: shortTextSchema(2000).optional().or(z.literal("")),
  })
  .refine((data) => data.startTime < data.endTime, {
    message: "L'heure de fin doit être après l'heure de début",
    path: ["endTime"],
  });

// PATCH /api/admin/sessions/[id]
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.ok) return NextResponse.json({ error: "Accès refusé" }, { status: auth.status });
    const admin = auth.user;
    // This check was missing entirely — the POST (create) route already
    // gates on "planning.manage", but this PATCH (edit) route only
    // checked requireAdmin, so any ADMIN could reschedule/edit sessions
    // via a direct API call regardless of their granted permissions.
    if (!(await hasPermission(admin, "planning.manage"))) {
      return NextResponse.json({ error: "Permission requise : gérer le planning" }, { status: 403 });
    }

    const { id } = await params;
    const rawBody = await request.json().catch(() => null);
    const parsed = updateSessionSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 });
    }
    const { day, startTime, endTime, activity, coach, coachId, capacity, location, description } = parsed.data;

    const existing = await prisma.session.findFirst({
      where: { id, clubId: admin.clubId as string },
      select: { currentBookings: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Session introuvable" }, { status: 404 });
    }
    // Previously nothing stopped an admin from setting capacity below the
    // number of members already booked into the session, which would
    // silently corrupt the invariant the booking route's atomic
    // currentBookings < capacity check relies on.
    if (capacity < existing.currentBookings) {
      return NextResponse.json(
        { error: `La capacité ne peut pas être inférieure au nombre de réservations actuelles (${existing.currentBookings})` },
        { status: 400 }
      );
    }

    const link = await resolveCoachLink(admin.clubId as string, coach, coachId);
    if (!link.ok) {
      return NextResponse.json({ error: link.error }, { status: 400 });
    }

    const session = await prisma.session.update({
      where: { id },
      data: {
        day,
        startTime,
        endTime,
        activity,
        coach: link.coach,
        coachId: link.coachId,
        capacity,
        location: location || "Main Hall",
        description: description || null,
      },
    });

    return NextResponse.json({ session });
  } catch (error) {
    console.error("Admin session PATCH error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

// DELETE /api/admin/sessions/[id]
// Cancels every active booking on this session, notifies the affected
// members, then deletes the bookings and the session itself.
//
// This handler was previously missing entirely — the admin schedule page
// called it (at the wrong URL, now fixed) but even a correct URL would
// have hit a 405, which is why deleting/editing a session's time from the
// admin panel silently failed.
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.ok) return NextResponse.json({ error: "Accès refusé" }, { status: auth.status });
    if (!(await hasPermission(auth.user, "planning.manage"))) {
      return NextResponse.json({ error: "Permission requise : gérer le planning" }, { status: 403 });
    }

    const { id } = await params;

    const session = await prisma.session.findFirst({
      where: { id, clubId: auth.user.clubId as string },
      include: {
        userSessions: {
          where: { isCancelled: false },
          select: { id: true, userId: true },
        },
        weeklyPlan: { select: { weekStart: true } },
      },
    });

    if (!session) {
      return NextResponse.json({ error: "Session introuvable" }, { status: 404 });
    }

    const affectedUserIds: string[] = [...new Set<string>(session.userSessions.map((us: { userId: string }) => us.userId))];
    const activeUserSessionIds: string[] = session.userSessions.map((us: { id: string }) => us.id);

    const weekLabel = new Date(session.weeklyPlan.weekStart).toLocaleDateString("fr-FR", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });

    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      if (activeUserSessionIds.length > 0) {
        await tx.userSession.updateMany({
          where: { id: { in: activeUserSessionIds } },
          data: { isCancelled: true, cancelledAt: new Date() },
        });
      }
      await tx.session.delete({ where: { id } });
    });

    if (affectedUserIds.length > 0) {
      const clubId = auth.user.clubId!;
      runAfter(() =>
        notifyUsers(clubId, affectedUserIds, {
          title: "Session annulée",
          message: `La session du ${weekLabel} à ${session.startTime} a été annulée. Votre réservation a été annulée.`,
          type: "WARNING",
        })
      );
    }

    return NextResponse.json({ success: true, notifiedCount: affectedUserIds.length });
  } catch (error) {
    console.error("Admin session DELETE error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}