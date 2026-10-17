import { NextRequest, NextResponse } from "next/server";
import { runAfter } from "@/lib/after";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireAdmin, requireOwner, invalidateAccountCache } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { formatZodError, nameSchema, phoneSchema } from "@/lib/validation";
import { logAction } from "@/lib/activity-log";
import { checkLimit } from "@/lib/plan-limits";

const memberPatchSchema = z.object({
  action: z.enum(["block", "suspend", "reactivate", "edit", "setRole"]),
  name: nameSchema.optional(),
  phone: phoneSchema.optional().or(z.literal("")),
  // Only used with action "setRole" (OWNER only).
  role: z.enum(["MEMBER", "COACH", "ADMIN"]).optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.ok) return NextResponse.json({ error: "Accès refusé" }, { status: auth.status });
    const admin = auth.user;

    const { id } = await params;
    const rawBody = await request.json().catch(() => null);
    const parsed = memberPatchSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 });
    }
    const { action, name, phone, role } = parsed.data;

    // Changing someone's role is a staff decision: OWNER only, never ADMIN.
    if (action === "setRole" && admin.role !== "OWNER") {
      return NextResponse.json({ error: "Seul le propriétaire peut changer un rôle" }, { status: 403 });
    }

    const requiredPermission = action === "edit" ? "members.write" : "members.suspend";
    if (action !== "setRole" && !(await hasPermission(admin, requiredPermission))) {
      return NextResponse.json({ error: "Permission insuffisante" }, { status: 403 });
    }

    const target = await prisma.user.findFirst({ where: { id, clubId: admin.clubId } });
    if (!target) return NextResponse.json({ error: "Membre introuvable" }, { status: 404 });

    if (admin.role === "ADMIN" && ["ADMIN", "OWNER"].includes(target.role)) {
      return NextResponse.json({ error: "Permission insuffisante" }, { status: 403 });
    }

    if (action === "setRole") {
      if (!role) {
        return NextResponse.json({ error: "Rôle requis" }, { status: 400 });
      }
      if (target.id === admin.id || target.role === "OWNER" || target.role === "SUPER_ADMIN") {
        return NextResponse.json({ error: "Ce compte ne peut pas changer de rôle ici" }, { status: 400 });
      }
      if (target.role === role) {
        return NextResponse.json({ member: { id: target.id, name: target.name, email: target.email, phone: target.phone, isActive: target.isActive, role: target.role } });
      }
      const clubId = admin.clubId as string;

      // Respect the SaaS plan limits when promoting someone into staff.
      if (role === "ADMIN" || role === "COACH") {
        const limit = await checkLimit(clubId, role === "ADMIN" ? "maxAdmins" : "maxCoaches");
        if (!limit.ok) {
          return NextResponse.json({ error: limit.reason, upgrade: Boolean(limit.upgrade) }, { status: 402 });
        }
      }

      const previousRole = target.role;
      const changed = await prisma.$transaction(async (tx) => {
        const u = await tx.user.update({
          where: { id },
          data: { role },
          select: { id: true, name: true, email: true, phone: true, isActive: true, role: true },
        });
        if (role === "COACH") {
          // A COACH login needs its coach profile (re-use it if it already exists).
          const existing = await tx.coach.findFirst({ where: { userId: id, clubId } });
          if (existing) {
            await tx.coach.update({ where: { id: existing.id }, data: { isActive: true } });
          } else {
            await tx.coach.create({
              data: { clubId, name: u.name, phone: u.phone, specialties: [], userId: u.id },
            });
          }
        } else if (previousRole === "COACH") {
          // Leaving the coach role: hide the public profile but keep its history.
          await tx.coach.updateMany({ where: { userId: id, clubId }, data: { isActive: false } });
        }
        return u;
      });
      invalidateAccountCache(changed.id);
      runAfter(() =>
        logAction(request, {
          clubId,
          actorId: admin.id, actorName: admin.name, actorRole: admin.role,
          action: "STAFF_PROMOTED",
          category: "STAFF",
          targetId: changed.id, targetName: changed.name,
          detail: { from: previousRole, to: role },
        })
      );
      return NextResponse.json({ member: changed });
    }

    let updateData: Record<string, unknown> = {};

    switch (action) {
      case "block":
      case "suspend":
        updateData = { isActive: false };
        break;
      case "reactivate":
        updateData = { isActive: true };
        break;
      case "edit":
        if (name !== undefined) updateData.name = name;
        if (phone !== undefined) updateData.phone = phone || null;
        break;
    }

    const updated = await prisma.user.update({
      where: { id },
      data: updateData,
      select: { id: true, name: true, email: true, phone: true, isActive: true, role: true },
    });
    invalidateAccountCache(updated.id);

    const actionMap: Record<string, string> = {
      block: "MEMBER_BLOCKED", suspend: "MEMBER_SUSPENDED",
      reactivate: "MEMBER_REACTIVATED", edit: "MEMBER_EDITED",
    };
    runAfter(() =>
      logAction(request, {
        actorId: admin.id, actorName: admin.name, actorRole: admin.role,
        action: actionMap[action] ?? "MEMBER_UPDATED",
        category: "MEMBER",
        targetId: updated.id, targetName: updated.name,
        detail: action === "edit" ? { fields: Object.keys(updateData) } : undefined,
      })
    );

    return NextResponse.json({ member: updated });
  } catch (error) {
    console.error("Admin member PATCH error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Deleting a member is Owner-only — Admin can suspend/reactivate but
    // not permanently delete (see the role permission matrix).
    const auth = await requireOwner(request);
    if (!auth.ok) return NextResponse.json({ error: "Accès refusé" }, { status: auth.status });

    const { id } = await params;

    const target = await prisma.user.findFirst({ where: { id, clubId: auth.user.clubId } });
    if (!target) return NextResponse.json({ error: "Membre introuvable" }, { status: 404 });

    if (["ADMIN", "OWNER"].includes(target.role)) {
      return NextResponse.json({ error: "Impossible de supprimer un admin" }, { status: 403 });
    }

    await prisma.user.delete({ where: { id } });

    const owner = auth.user;
    runAfter(() =>
      logAction(request, {
        actorId: owner.id, actorName: owner.name, actorRole: owner.role,
        action: "MEMBER_DELETED",
        category: "MEMBER",
        targetId: id, targetName: target.name,
        detail: { email: target.email, role: target.role },
      })
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Admin member DELETE error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}