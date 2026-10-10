// PUT    /api/admin/staff/[id] — update a staff account (role, active state, profile)
// DELETE /api/admin/staff/[id] — remove a staff account
// OWNER only.
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireOwner, invalidateAccountCache } from "@/lib/auth";
import { formatZodError, nameSchema, phoneSchema } from "@/lib/validation";
import { checkLimit } from "@/lib/plan-limits";
import { logAction } from "@/lib/activity-log";
import { runAfter } from "@/lib/after";

const updateStaffSchema = z.object({
  name: nameSchema.optional(),
  phone: phoneSchema.optional().or(z.literal("")),
  role: z.enum(["ADMIN", "OWNER"]).optional(),
  isActive: z.boolean().optional(),
});

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireOwner(request);
    if (!auth.ok) {
      return NextResponse.json({ error: "Accès refusé" }, { status: auth.status });
    }
    const { id } = await params;

    const target = await prisma.user.findFirst({ where: { id, clubId: auth.user.clubId } });
    if (!target) {
      return NextResponse.json({ error: "Membre du personnel introuvable" }, { status: 404 });
    }

    const rawBody = await request.json().catch(() => null);
    const parsed = updateStaffSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 });
    }
    const { name, phone, role, isActive } = parsed.data;

    // Promote an existing club member to ADMIN (owner-only staff management).
    if (target.role === "MEMBER") {
      if (role !== "ADMIN") {
        return NextResponse.json(
          { error: "Seule la promotion au rôle ADMIN est autorisée pour un membre" },
          { status: 400 }
        );
      }
      const limitCheck = await checkLimit(auth.user.clubId as string, "maxAdmins");
      if (!limitCheck.ok) {
        return NextResponse.json({ error: limitCheck.reason }, { status: 402 });
      }
      const updated = await prisma.user.update({
        where: { id },
        data: { role: "ADMIN" },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          role: true,
          isActive: true,
          createdAt: true,
        },
      });
      invalidateAccountCache(updated.id);
      runAfter(() =>
        logAction(request, {
          clubId: auth.user.clubId,
          actorId: auth.user.id, actorName: auth.user.name, actorRole: auth.user.role,
          action: "STAFF_PROMOTED", category: "STAFF",
          targetId: updated.id, targetName: updated.name,
          detail: { from: "MEMBER", to: "ADMIN" },
        })
      );
      return NextResponse.json(updated);
    }

    if (!["ADMIN", "OWNER"].includes(target.role)) {
      return NextResponse.json({ error: "Membre du personnel introuvable" }, { status: 404 });
    }

    // An owner can't demote or deactivate themselves — that would leave
    // no one able to manage staff. Force that to happen via another owner.
    if (target.id === auth.user.id) {
      return NextResponse.json(
        { error: "Vous ne pouvez pas modifier votre propre compte ici" },
        { status: 400 }
      );
    }

    const data: Record<string, unknown> = {};
    if (name !== undefined) data.name = name;
    if (phone !== undefined) data.phone = phone || null;
    if (role !== undefined) data.role = role;
    if (isActive !== undefined) data.isActive = isActive;

    const updated = await prisma.user.update({
      where: { id },
      data,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    });
    invalidateAccountCache(updated.id);

    runAfter(() =>
      logAction(request, {
        clubId: auth.user.clubId,
        actorId: auth.user.id, actorName: auth.user.name, actorRole: auth.user.role,
        action: "STAFF_UPDATED", category: "STAFF",
        targetId: updated.id, targetName: updated.name,
        detail: { fields: Object.keys(data) },
      })
    );

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Update staff error:", error);
    return NextResponse.json({ error: "Une erreur est survenue" }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  return PUT(request, ctx);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireOwner(request);
    if (!auth.ok) {
      return NextResponse.json({ error: "Accès refusé" }, { status: auth.status });
    }
    const { id } = await params;

    if (id === auth.user.id) {
      return NextResponse.json(
        { error: "Vous ne pouvez pas supprimer votre propre compte" },
        { status: 400 }
      );
    }

    const target = await prisma.user.findFirst({ where: { id, clubId: auth.user.clubId } });
    if (!target || !["ADMIN", "OWNER"].includes(target.role)) {
      return NextResponse.json({ error: "Membre du personnel introuvable" }, { status: 404 });
    }

    await prisma.user.delete({ where: { id } });

    runAfter(() =>
      logAction(request, {
        clubId: auth.user.clubId,
        actorId: auth.user.id, actorName: auth.user.name, actorRole: auth.user.role,
        action: "STAFF_DELETED", category: "STAFF",
        targetId: target.id, targetName: target.name,
      })
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete staff error:", error);
    return NextResponse.json({ error: "Une erreur est survenue" }, { status: 500 });
  }
}
