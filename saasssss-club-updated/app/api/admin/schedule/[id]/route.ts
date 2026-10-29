import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { formatZodError, shortTextSchema } from "@/lib/validation";
import { getSessionDateTime } from "@/lib/session-date";
import { resolveCoachLink } from "@/lib/coach-link";

const DAYS = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"] as const;
const ACTIVITIES = ["BODYBUILDING", "FITNESS", "CARDIO", "CROSSFIT", "YOGA", "PILATES", "BOXE", "MMA", "AQUAGYM", "PADEL", "ZUMBA", "SPINNING"] as const;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

const createSessionSchema = z.object({
  day: z.enum(DAYS),
  startTime: z.string().regex(TIME_RE, "Format d'heure invalide (HH:MM)"),
  endTime: z.string().regex(TIME_RE, "Format d'heure invalide (HH:MM)"),
  activity: z.enum(ACTIVITIES),
  coach: z.string().trim().max(100).default(""),
  coachId: z.string().trim().min(1).optional().or(z.literal("")).nullable(),
  capacity: z.coerce.number().int().min(1).max(500).default(20),
  location: shortTextSchema(200).optional().or(z.literal("")),
  description: shortTextSchema(2000).optional().or(z.literal("")),
}).refine((data) => data.startTime < data.endTime, { message: "L'heure de fin doit être après l'heure de début", path: ["endTime"] });

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.ok) return NextResponse.json({ error: "Accès refusé" }, { status: auth.status });
    if (!(await hasPermission(auth.user, "planning.manage"))) return NextResponse.json({ error: "Permission requise : gérer le planning" }, { status: 403 });

    const { id: weeklyPlanId } = await params;
    const parsed = createSessionSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 });
    const { day, startTime, endTime, activity, coach, coachId, capacity, location, description } = parsed.data;

    const plan = await prisma.weeklyPlan.findFirst({ where: { id: weeklyPlanId, clubId: auth.user.clubId as string }, select: { id: true, isArchived: true, weekStart: true } });
    if (!plan) return NextResponse.json({ error: "Planning introuvable" }, { status: 404 });
    if (plan.isArchived) return NextResponse.json({ error: "Impossible d'ajouter une session à un planning archivé" }, { status: 400 });

    // Without this, a session created with a past start time was accepted
    // here, then silently deleted by the next cleanup pass (GET
    // /api/admin/schedule) — from the admin's point of view it looked
    // like the session was "never added". Reject it up front instead,
    // with a clear message, using the same club-timezone-aware helper the
    // cleanup job uses so both agree on what counts as "past".
    const sessionInstant = getSessionDateTime(plan.weekStart, day, startTime);
    if (sessionInstant < new Date()) {
      return NextResponse.json(
        { error: "Cet horaire est déjà passé. Choisissez un horaire à venir." },
        { status: 400 }
      );
    }

    // Link the session to a real coach (picked from the list, or matched by name).
    const link = await resolveCoachLink(auth.user.clubId as string, coach, coachId);
    if (!link.ok) return NextResponse.json({ error: link.error }, { status: 400 });

    // Prevent overlapping sessions for the same plan/day. This also makes
    // malformed duplicate slots much easier to detect before members see them.
    const overlap = await prisma.session.findFirst({
      where: { weeklyPlanId, day, startTime: { lt: endTime }, endTime: { gt: startTime } },
      select: { id: true },
    });
    if (overlap) return NextResponse.json({ error: "Une session chevauche déjà cet horaire" }, { status: 409 });

    const session = await prisma.session.create({
      data: { clubId: auth.user.clubId as string, weeklyPlanId, day, startTime, endTime, activity, coach: link.coach, coachId: link.coachId, capacity, location: location || "Salle principale", description: description || null },
    });
    return NextResponse.json({ session }, { status: 201 });
  } catch (error) {
    console.error("Admin session POST error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
