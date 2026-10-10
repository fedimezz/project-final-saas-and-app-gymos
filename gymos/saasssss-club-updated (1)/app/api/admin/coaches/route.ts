import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireAdmin, requireOwner } from "@/lib/auth";
import { createInvitedCoachAccount } from "@/lib/coach-account";
import { emailSchema, formatZodError, nameSchema, phoneSchema, shortTextSchema } from "@/lib/validation";
import { checkLimit } from "@/lib/plan-limits";
import { denyUnlessPermitted } from "@/lib/permission-guard";
import { logAction } from "@/lib/activity-log";
import { runAfter } from "@/lib/after";
import { safeImageUrl } from "@/lib/image-url";

// The admin form sends null / "" for fields left empty. zod would answer
// "Invalid input: expected string, received null" — treat them as "not provided".
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((v) => (v === null || v === "" ? undefined : v), schema.optional());

const createCoachSchema = z
  .object({
    name: nameSchema,
    bio: optional(shortTextSchema(2000)),
    photoUrl: optional(
      z.string().trim().max(2000)
        .refine((v) => safeImageUrl(v) !== null, "URL de photo non autorisée (utilisez l'envoi de fichier)")
    ),
    specialties: optional(z.array(z.string().trim().min(1).max(50)).max(20)),
    phone: optional(phoneSchema),
    // Make an existing ADMIN/OWNER of this club selectable as an instructor in the planning.
    linkUserId: optional(z.string().trim().min(1).max(60)),
    createAccount: optional(z.boolean()),
    email: optional(emailSchema),
  })
  // The coach sets their own password from the emailed invitation: email only.
  .refine((data) => !data.createAccount || Boolean(data.email), {
    message: "Email requis pour inviter le coach",
    path: ["email"],
  });

// GET /api/admin/coaches — every coach (active + inactive), with their
// sessions in the currently active weekly plan attached so Admin/Owner get
// a real "who's teaching what, when" view without a separate lookup.
// Replaces the old read-only version of this route, which derived a coach
// "list" purely from grouping Session.coach free-text names — there was no
// real Coach entity to CRUD against yet.
export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return NextResponse.json({ error: "Accès refusé" }, { status: auth.status });
  // The coach list feeds both the team screen and the schedule editor, so
  // either permission is enough to read it.
  const denied = await denyUnlessPermitted(auth.user, ["staff.manage", "planning.manage"]);
  if (denied) return denied;

  try {
    const coaches = await prisma.coach.findMany({
      where: { clubId: auth.user.clubId as string },
      include: {
        user: { select: { id: true, email: true, isActive: true } },
        sessions: {
          where: { weeklyPlan: { isActive: true, clubId: auth.user.clubId as string } },
          select: { id: true, activity: true, day: true, startTime: true, endTime: true, location: true },
          orderBy: [{ day: "asc" }, { startTime: "asc" }],
          take: 250,
        },
      },
      orderBy: { name: "asc" },
      take: 250,
    });

    return NextResponse.json({ coaches });
  } catch (error) {
    console.error("Admin coaches GET error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

// POST /api/admin/coaches — create a coach profile. OWNER only, same trust
// boundary as /api/admin/staff, since creating one can also create a login
// account. `createAccount` + `email` + `password` are optional — a coach
// profile can exist purely for display (schedule/coaching page) without a
// login, and a login can be added later via PUT.
export async function POST(request: NextRequest) {
  const auth = await requireOwner(request);
  if (!auth.ok) return NextResponse.json({ error: "Accès refusé — réservé au propriétaire" }, { status: auth.status });

  try {
    const rawBody = await request.json().catch(() => null);
    const parsed = createCoachSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 });
    }

    // ── Plan limit check ────────────────────────────────────────────────────
    const limitCheck = await checkLimit(auth.user.clubId as string, "maxCoaches");
    if (!limitCheck.ok) {
      return NextResponse.json({ error: limitCheck.reason }, { status: 402 });
    }

    const { name, bio, photoUrl, specialties, phone, createAccount, email, linkUserId } = parsed.data;

    let userId: string | null = null;
    let invitationSent: boolean | null = null; // null = no account was invited

    if (linkUserId) {
      // An admin/owner who also teaches: the Coach profile points at their existing
      // account (their role stays ADMIN/OWNER — no coach login is created).
      const staff = await prisma.user.findFirst({
        where: { id: linkUserId, clubId: auth.user.clubId as string, role: { in: ["ADMIN", "OWNER"] } },
        select: { id: true },
      });
      if (!staff) return NextResponse.json({ error: "Compte admin introuvable" }, { status: 400 });
      const already = await prisma.coach.findFirst({ where: { userId: staff.id }, select: { id: true } });
      if (already) return NextResponse.json({ error: "Ce compte a déjà un profil coach" }, { status: 409 });
      userId = staff.id;
    } else if (createAccount) {
      const account = await createInvitedCoachAccount({
        clubId: auth.user.clubId as string,
        name,
        email: email as string,
        phone,
        inviter: { id: auth.user.id, name: auth.user.name },
        requestUrl: request.url,
      });
      if (!account.ok) return NextResponse.json({ error: account.error }, { status: account.status });
      userId = account.userId;
      invitationSent = account.invitationSent;
    }

    const coach = await prisma.coach.create({
      data: {
        clubId: auth.user.clubId as string,
        name,
        bio: bio || null,
        photoUrl: photoUrl || null,
        specialties: specialties ?? [],
        phone: phone || null,
        userId,
      },
    });

    runAfter(() =>
      logAction(request, {
        clubId: auth.user.clubId as string,
        actorId: auth.user.id, actorName: auth.user.name, actorRole: auth.user.role,
        action: "COACH_CREATED",
        category: "STAFF",
        targetId: coach.id,
        targetName: coach.name,
      })
    )

    return NextResponse.json({ coach, invitationSent }, { status: 201 });
  } catch (error) {
    console.error("Admin coaches POST error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
