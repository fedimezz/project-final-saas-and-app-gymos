import { NextRequest, NextResponse } from "next/server";
import { runAfter } from "@/lib/after";
import { sqltag as sql } from "@prisma/client/runtime/library";
import prisma from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { bookSessionSchema, formatZodError } from "@/lib/validation";
import { logAction } from "@/lib/activity-log";
import { checkLimit } from "@/lib/plan-limits";
import { notifyBookingCreated, notifyBookingCancelled } from "@/lib/booking-notify";

type SessionCapacityRow = {
  id: string;
  currentBookings: number;
  capacity: number;
  weeklyPlanId: string;
  day: string;
  startTime: string;
  endTime: string;
  activity: string;
  coach: string;
  coachId: string | null;
  description: string | null;
  location: string;
  createdAt: Date;
  updatedAt: Date;
};

// POST /api/dashboard/schedule/book  { sessionId }
export async function POST(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if (!auth.ok) return NextResponse.json({ error: "Non autorisé" }, { status: auth.status });
    const userId = auth.user.id;
    const clubId = auth.user.clubId as string; // requireUser guarantees a gym user has one

    const rawBody = await request.json().catch(() => null);
    const parsed = bookSessionSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 });
    }
    const { sessionId } = parsed.data;

    // ── Plan limit check — maxBookingsPerMonth ──────────────────────────────
    const limitCheck = await checkLimit(clubId, "maxBookingsPerMonth");
    if (!limitCheck.ok) {
      return NextResponse.json({ error: limitCheck.reason }, { status: 402 });
    }

    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Check for an existing (possibly cancelled) booking first — this is
      // a cheap early-out, NOT the correctness guarantee for capacity.
      const existing = await tx.userSession.findUnique({
        where: { userId_sessionId: { userId, sessionId } },
      });

      if (existing && !existing.isCancelled) {
        throw new Error("ALREADY_BOOKED");
      }

      // Race-free capacity check: previously this route did
      // `findUnique` (read currentBookings in JS) then a separate
      // `update({ increment: 1 })`. Under concurrent requests, two
      // transactions could both read currentBookings=19/20, both pass the
      // JS check, and both increment — landing on 21/20.
      //
      // A plain UPDATE's WHERE clause is instead evaluated by Postgres
      // against the current row at UPDATE time and takes a row lock, so
      // concurrent requests for the last spot serialize here: whichever
      // commits first flips currentBookings to 20, and the second
      // transaction's WHERE "currentBookings" < "capacity" then evaluates
      // false and updates zero rows. That's what makes this atomic.
      //
      // "clubId" is included in the WHERE (not just checked separately)
      // so this can never touch another gym's session even under a race —
      // it's the same row-level guarantee as the capacity check itself,
      // not a separate read-then-trust step.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const updatedRows = (await (tx as any).$queryRaw(
        sql`
          UPDATE "sessions"
          SET "currentBookings" = "currentBookings" + 1
          WHERE "id" = ${sessionId} AND "clubId" = ${clubId} AND "currentBookings" < "capacity"
          RETURNING *
        `
      )) as SessionCapacityRow[];

      if (updatedRows.length === 0) {
        const session = await tx.session.findFirst({
          where: { id: sessionId, clubId },
          select: { id: true },
        });
        if (!session) throw new Error("SESSION_NOT_FOUND");
        throw new Error("SESSION_FULL");
      }

      if (existing && existing.isCancelled) {
        await tx.userSession.update({
          where: { id: existing.id },
          data: { isCancelled: false, cancelledAt: null, bookedAt: new Date() },
        });
      } else {
        // If two requests from the same user race past the `existing`
        // check above (e.g. a double-click with no prior row), the
        // @@unique([userId, sessionId]) constraint makes the second
        // `create` throw P2002 here. That throw aborts the transaction,
        // which also rolls back the capacity increment above — so a
        // rejected duplicate never leaves a phantom reserved spot.
        await tx.userSession.create({
          data: { clubId, userId, sessionId },
        });
      }

      return updatedRows[0];
    });

    runAfter(() =>
      logAction(request, {
        actorId: userId,
        actorName: auth.user.name,
        actorRole: "MEMBER",
        action: "BOOKING_CREATED",
        category: "BOOKING",
        targetId: result.id,
        targetName: `${result.activity} – ${result.coach} (${result.day} ${result.startTime})`,
      })
    );

    runAfter(() => notifyBookingCreated(clubId, { id: userId, name: auth.user.name }, result));

    return NextResponse.json({
      message: "Session réservée avec succès",
      session: {
        ...result,
        isFull: result.currentBookings >= result.capacity,
        spotsLeft: Math.max(0, result.capacity - result.currentBookings),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "SESSION_NOT_FOUND") {
      return NextResponse.json({ error: "Session introuvable" }, { status: 404 });
    }
    if (message === "SESSION_FULL") {
      return NextResponse.json({ error: "Cette session est complète" }, { status: 409 });
    }
    if (message === "ALREADY_BOOKED") {
      return NextResponse.json({ error: "Vous avez déjà réservé cette session" }, { status: 409 });
    }
    console.error("Schedule book POST error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

// DELETE /api/dashboard/schedule/book  { sessionId }
export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if (!auth.ok) return NextResponse.json({ error: "Non autorisé" }, { status: auth.status });
    const userId = auth.user.id;
    const clubId = auth.user.clubId as string;

    const rawBody = await request.json().catch(() => null);
    const parsed = bookSessionSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 });
    }
    const { sessionId } = parsed.data;

    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const existing = await tx.userSession.findUnique({
        where: { userId_sessionId: { userId, sessionId } },
      });

      if (!existing || existing.isCancelled) {
        throw new Error("NOT_BOOKED");
      }

      await tx.userSession.update({
        where: { id: existing.id },
        data: { isCancelled: true, cancelledAt: new Date() },
      });

      // Same atomic-UPDATE pattern as booking, and guarded at 0 so a
      // duplicate/racing cancel can never push currentBookings negative.
      // clubId in the WHERE clause for the same reason as the booking
      // route above — never trust that a sessionId that matched the
      // (userId, sessionId) unique above actually belongs to this gym
      // without checking it explicitly at the row level.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const updatedRows = (await (tx as any).$queryRaw(
        sql`
          UPDATE "sessions"
          SET "currentBookings" = "currentBookings" - 1
          WHERE "id" = ${sessionId} AND "clubId" = ${clubId} AND "currentBookings" > 0
          RETURNING *
        `
      )) as SessionCapacityRow[];

      if (updatedRows.length === 0) {
        const session = await tx.session.findFirst({ where: { id: sessionId, clubId } });
        if (!session) throw new Error("SESSION_NOT_FOUND_ON_CANCEL");
        return session; // already at 0 — nothing to decrement, not an error
      }

      return updatedRows[0];
    });

    runAfter(() =>
      logAction(request, {
        actorId: userId,
        actorName: auth.user.name,
        actorRole: "MEMBER",
        action: "BOOKING_CANCELLED",
        category: "BOOKING",
        targetId: result.id,
        targetName: `${result.activity} – ${result.coach} (${result.day} ${result.startTime})`,
      })
    );

    runAfter(() => notifyBookingCancelled(clubId, { id: userId, name: auth.user.name }, result));

    return NextResponse.json({
      message: "Réservation annulée",
      session: {
        ...result,
        isFull: result.currentBookings >= result.capacity,
        spotsLeft: Math.max(0, result.capacity - result.currentBookings),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "NOT_BOOKED") {
      return NextResponse.json({ error: "Vous n'avez pas réservé cette session" }, { status: 409 });
    }
    if (message === "SESSION_NOT_FOUND_ON_CANCEL") {
      return NextResponse.json({ error: "Session introuvable" }, { status: 404 });
    }
    console.error("Schedule book DELETE error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
