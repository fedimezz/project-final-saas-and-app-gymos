// lib/booking-notify.ts
//
// Notifications fired by member bookings: the member gets a confirmation and
// the coach running the session is told about a new booking / cancellation.
// Each goes through notifyUser(), so it is stored (bell), streamed live (SSE)
// AND pushed to the person's registered phone(s). Always club-scoped.
import prisma from "@/lib/prisma";
import { notifyUser } from "@/lib/notify";

interface BookedSession {
  id: string;
  activity: string;
  day: string;
  startTime: string;
  coachId: string | null;
  currentBookings: number;
  capacity: number;
}

async function coachUserId(clubId: string, coachId: string | null): Promise<string | null> {
  if (!coachId) return null;
  const coach = await prisma.coach.findFirst({ where: { id: coachId, clubId }, select: { userId: true } });
  return coach?.userId ?? null;
}

export async function notifyBookingCreated(
  clubId: string,
  member: { id: string; name: string },
  session: BookedSession
): Promise<void> {
  const label = `${session.activity} — ${session.day} ${session.startTime}`;
  await notifyUser(clubId, member.id, {
    title: "Réservation confirmée",
    message: `Votre place est réservée : ${label}.`,
    type: "BOOKING",
    data: { sessionId: session.id, kind: "booking_confirmed" },
  });

  const coachUser = await coachUserId(clubId, session.coachId);
  if (coachUser && coachUser !== member.id) {
    await notifyUser(clubId, coachUser, {
      title: "Nouvelle réservation",
      message: `${member.name} a réservé ${label} (${session.currentBookings}/${session.capacity}).`,
      type: "BOOKING",
      data: { sessionId: session.id, kind: "coach_new_booking", audience: "coach" },
    });
  }
}

export async function notifyBookingCancelled(
  clubId: string,
  member: { id: string; name: string },
  session: BookedSession
): Promise<void> {
  const coachUser = await coachUserId(clubId, session.coachId);
  if (!coachUser || coachUser === member.id) return;
  await notifyUser(clubId, coachUser, {
    title: "Réservation annulée",
    message: `${member.name} a annulé ${session.activity} — ${session.day} ${session.startTime} (${session.currentBookings}/${session.capacity}).`,
    type: "BOOKING",
    data: { sessionId: session.id, kind: "coach_booking_cancelled", audience: "coach" },
  });
}
