// lib/coach-link.ts
//
// A planning session must be LINKED to a real Coach (Session.coachId): that link
// is what makes the session show up in the coach's own dashboard and in the
// public coaches page ("activities taught"). The admin form lets the owner type a
// free-text name too; this helper turns that name into the link whenever it matches
// a coach of the same club, so a typed name never silently leaves a session orphaned.
import prisma from "@/lib/prisma";

export interface CoachLink {
  ok: true;
  coach: string;          // display name stored on the session
  coachId: string | null; // linked coach, or null for a genuinely external instructor
}
export interface CoachLinkError { ok: false; error: string }

export async function resolveCoachLink(
  clubId: string,
  coachName: string,
  coachId?: string | null
): Promise<CoachLink | CoachLinkError> {
  if (coachId) {
    const found = await prisma.coach.findFirst({
      where: { id: coachId, clubId },
      select: { id: true, name: true, isActive: true },
    });
    if (!found) return { ok: false, error: "Coach introuvable" };
    if (!found.isActive) return { ok: false, error: "Ce coach est désactivé" };
    return { ok: true, coach: found.name, coachId: found.id };
  }

  const name = coachName.trim();
  if (!name) return { ok: false, error: "Choisissez un coach" };
  const byName = await prisma.coach.findFirst({
    where: { clubId, isActive: true, name: { equals: name, mode: "insensitive" } },
    select: { id: true, name: true },
  });
  return byName
    ? { ok: true, coach: byName.name, coachId: byName.id }
    : { ok: true, coach: name, coachId: null };
}
