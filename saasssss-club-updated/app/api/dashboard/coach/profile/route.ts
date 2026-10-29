// /api/dashboard/coach/profile — a coach reads / edits THEIR OWN coach profile.
//
//  GET   → { profile, editable }
//  PATCH → { name?, phone?, bio?, specialties?, photoUrl? }
//
// What a coach may change (the "permitted" fields): display name, phone, bio,
// specialties and photo. Never: email, role, active flag, club, linked user,
// password (separate flows) — those keys are not in the schema, and zod
// strips unknown keys, so a crafted body cannot reach them.
//
// Persistence: the Coach row (what the public coaches page / home section
// render) AND the linked User row (name, phone, avatar used by the apps) are
// updated in ONE transaction, so the two never drift apart. The coach row is
// always looked up by (userId = session user, clubId = session club) — there
// is no id in the URL or body to tamper with.
//
// The owner can switch the whole tool off per club with the
// "coach.profile.edit" coach permission (default: allowed).
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireCoach, invalidateAccountCache } from "@/lib/auth";
import { hasCoachPermission } from "@/lib/permissions";
import { formatZodError, nameSchema, phoneSchema } from "@/lib/validation";
import { safeImageUrl } from "@/lib/image-url";
import { logAction } from "@/lib/activity-log";
import { runAfter } from "@/lib/after";

const MAX_SPECIALTIES = 8;

const patchSchema = z
  .object({
    name: nameSchema.optional(),
    phone: z.union([phoneSchema, z.literal("")]).optional(),
    bio: z.string().trim().max(1000, "La bio ne peut pas dépasser 1000 caractères").optional(),
    specialties: z
      .array(z.string().trim().min(1).max(40, "Une spécialité ne peut pas dépasser 40 caractères"))
      .max(MAX_SPECIALTIES, `Maximum ${MAX_SPECIALTIES} spécialités`)
      .optional(),
    photoUrl: z
      .union([z.string().refine((v) => safeImageUrl(v) !== null, "Photo invalide (image hébergée uniquement)"), z.null()])
      .optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "Aucune modification fournie");

const EDITABLE_FIELDS = ["name", "phone", "bio", "specialties", "photoUrl"] as const;

async function loadCoach(userId: string, clubId: string) {
  return prisma.coach.findFirst({
    where: { userId, clubId },
    select: {
      id: true, name: true, bio: true, photoUrl: true, specialties: true, phone: true, isActive: true,
      user: { select: { email: true, avatar: true } },
    },
  });
}

export async function GET(request: NextRequest) {
  const auth = await requireCoach(request);
  if (!auth.ok) return NextResponse.json({ error: "Accès refusé" }, { status: auth.status });
  try {
    const clubId = auth.user.clubId as string;
    const coach = await loadCoach(auth.user.id, clubId);
    if (!coach) return NextResponse.json({ error: "Aucun profil coach lié à ce compte" }, { status: 404 });
    const canEdit = await hasCoachPermission(auth.user, "coach.profile.edit");
    return NextResponse.json({
      profile: {
        name: coach.name,
        email: coach.user?.email ?? auth.user.email,
        phone: coach.phone ?? "",
        bio: coach.bio ?? "",
        specialties: coach.specialties,
        photoUrl: coach.photoUrl ?? coach.user?.avatar ?? null,
        isPublished: coach.isActive,
      },
      editable: canEdit ? [...EDITABLE_FIELDS] : [],
    });
  } catch (error) {
    console.error("Coach profile GET error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await requireCoach(request);
  if (!auth.ok) return NextResponse.json({ error: "Accès refusé" }, { status: auth.status });
  try {
    if (!(await hasCoachPermission(auth.user, "coach.profile.edit"))) {
      return NextResponse.json({ error: "La modification du profil est désactivée par le club" }, { status: 403 });
    }

    const parsed = patchSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 });
    const input = parsed.data;

    const clubId = auth.user.clubId as string;
    const existing = await loadCoach(auth.user.id, clubId);
    if (!existing) return NextResponse.json({ error: "Aucun profil coach lié à ce compte" }, { status: 404 });

    const phone = input.phone === undefined ? undefined : input.phone === "" ? null : input.phone;
    const photoUrl = input.photoUrl === undefined ? undefined : input.photoUrl === null ? null : safeImageUrl(input.photoUrl);
    const specialties = input.specialties
      ? Array.from(new Set(input.specialties.map((s) => s.trim()).filter(Boolean)))
      : undefined;

    const [coach] = await prisma.$transaction([
      prisma.coach.update({
        where: { id: existing.id },
        data: {
          ...(input.name !== undefined && { name: input.name }),
          ...(phone !== undefined && { phone }),
          ...(input.bio !== undefined && { bio: input.bio === "" ? null : input.bio }),
          ...(specialties !== undefined && { specialties }),
          ...(photoUrl !== undefined && { photoUrl }),
        },
        select: { name: true, bio: true, photoUrl: true, specialties: true, phone: true, isActive: true },
      }),
      prisma.user.update({
        where: { id: auth.user.id },
        data: {
          ...(input.name !== undefined && { name: input.name }),
          ...(phone !== undefined && { phone }),
          ...(photoUrl !== undefined && { avatar: photoUrl }),
        },
        select: { id: true },
      }),
    ]);

    invalidateAccountCache(auth.user.id); // the display name changed

    runAfter(() =>
      logAction(request, {
        actorId: auth.user.id,
        actorName: input.name ?? auth.user.name,
        actorRole: "COACH",
        action: "COACH_PROFILE_UPDATED",
        category: "STAFF",
        targetId: existing.id,
        targetName: coach.name,
        detail: { fields: Object.keys(input) },
      })
    );

    return NextResponse.json({
      profile: {
        name: coach.name,
        email: existing.user?.email ?? auth.user.email,
        phone: coach.phone ?? "",
        bio: coach.bio ?? "",
        specialties: coach.specialties,
        photoUrl: coach.photoUrl,
        isPublished: coach.isActive,
      },
    });
  } catch (error) {
    console.error("Coach profile PATCH error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
