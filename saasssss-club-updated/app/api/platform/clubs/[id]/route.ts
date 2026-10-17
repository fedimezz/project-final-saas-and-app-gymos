// /api/platform/clubs/[id] — SUPER_ADMIN only.
//
//   GET     one club, full detail (owner, subscription, usage counts, recent SaaS payments)
//   PUT     edit { name?, slug?, customDomain?, owner?: { name?, email?, phone? } }
//   PATCH   lifecycle actions:
//             { action: "suspend" | "activate" | "ban", reason? }      ("freeze"/"unfreeze" = legacy aliases)
//             { action: "change_plan", planId }
//             { action: "extend_trial", days }
//             { action: "reset_owner_password", password }
//   DELETE  permanent removal — body { confirmSlug } must equal the club's slug

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/auth";
import { hashPassword } from "@/lib/bcrypt";
import { logAction } from "@/lib/activity-log";
import { verifyOrigin } from "@/lib/csrf";
import { formatZodError } from "@/lib/validation";
import { invalidateClubCache } from "@/lib/tenant";
import { log } from "@/lib/logger";
import {
  clubActionSchema,
  updateClubSchema,
  deleteClubSchema,
  deleteClubCascade,
  computeExtendedTrialEnd,
  isUniqueViolation,
  TRIAL_EXPIRED_REASON,
} from "@/lib/platform-clubs";

const DENIED = "Accès réservé à la plateforme";
type Ctx = { params: Promise<{ id: string }> };

const NOT_FOUND = () => NextResponse.json({ error: "Club introuvable" }, { status: 404 });
const SERVER_ERROR = () => NextResponse.json({ error: "Erreur serveur" }, { status: 500 });

// ─── GET ─────────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest, { params }: Ctx) {
  try {
    const auth = await requireSuperAdmin(request);
    if (!auth.ok) return NextResponse.json({ error: DENIED }, { status: auth.status });

    const { id } = await params;
    const club = await prisma.club.findUnique({
      where: { id },
      select: {
        id: true, name: true, slug: true, status: true, customDomain: true,
        trialEndsAt: true, suspendedAt: true, suspendedReason: true, createdAt: true, updatedAt: true,
        subscription: {
          select: {
            status: true, trialEndsAt: true, currentPeriodStart: true, currentPeriodEnd: true,
            cancelAtPeriodEnd: true, canceledAt: true,
            plan: { select: { id: true, tier: true, name: true, priceMonthly: true, currency: true, limits: true } },
          },
        },
        settings: { select: { name: true, logoUrl: true } },
        users: {
          where: { role: "OWNER" },
          orderBy: { createdAt: "asc" },
          take: 1,
          select: { id: true, name: true, email: true, phone: true, isActive: true, createdAt: true },
        },
        saasPayments: {
          orderBy: { createdAt: "desc" },
          take: 5,
          select: { id: true, amount: true, currency: true, status: true, paidAt: true, createdAt: true },
        },
        _count: { select: { users: true, sessions: true, payments: true } },
      },
    });
    if (!club) return NOT_FOUND();

    const roleRows = await prisma.user.groupBy({ by: ["role"], where: { clubId: id }, _count: { _all: true } });
    const roleCounts: Record<string, number> = {};
    for (const row of roleRows) roleCounts[row.role] = row._count._all;

    return NextResponse.json({ club, roleCounts });
  } catch (error) {
    log.error("platform.club.get_failed", { error: String(error) });
    return SERVER_ERROR();
  }
}

// ─── PUT (edit) ──────────────────────────────────────────────────────────────

export async function PUT(request: NextRequest, { params }: Ctx) {
  try {
    const csrfError = verifyOrigin(request);
    if (csrfError) return csrfError;

    const auth = await requireSuperAdmin(request);
    if (!auth.ok) return NextResponse.json({ error: DENIED }, { status: auth.status });

    const { id } = await params;
    const parsed = updateClubSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 });
    const { name, slug, customDomain, owner: ownerPatch } = parsed.data;

    const existing = await prisma.club.findUnique({
      where: { id },
      select: {
        id: true, name: true, slug: true, customDomain: true,
        settings: { select: { name: true } },
        users: { where: { role: "OWNER" }, orderBy: { createdAt: "asc" }, take: 1, select: { id: true, email: true } },
      },
    });
    if (!existing) return NOT_FOUND();
    const currentOwner = existing.users[0];

    if (slug !== undefined && slug !== existing.slug) {
      const conflict = await prisma.club.findFirst({ where: { slug, id: { not: id } }, select: { id: true } });
      if (conflict) return NextResponse.json({ error: "Ce slug est déjà utilisé", field: "slug" }, { status: 409 });
    }
    if (customDomain && customDomain !== existing.customDomain) {
      const conflict = await prisma.club.findFirst({ where: { customDomain, id: { not: id } }, select: { id: true } });
      if (conflict) return NextResponse.json({ error: "Ce domaine est déjà utilisé", field: "customDomain" }, { status: 409 });
    }
    if (ownerPatch && !currentOwner) {
      return NextResponse.json({ error: "Ce club n'a pas de propriétaire à modifier" }, { status: 409 });
    }
    if (ownerPatch?.email && currentOwner && ownerPatch.email !== currentOwner.email) {
      const conflict = await prisma.user.findFirst({ where: { email: ownerPatch.email, id: { not: currentOwner.id } }, select: { id: true } });
      if (conflict) return NextResponse.json({ error: "Cet email est déjà associé à un compte", field: "ownerEmail" }, { status: 409 });
    }

    const clubData = {
      ...(name !== undefined ? { name } : {}),
      ...(slug !== undefined ? { slug } : {}),
      ...(customDomain !== undefined ? { customDomain } : {}),
    };
    const ownerData = ownerPatch
      ? {
          ...(ownerPatch.name !== undefined ? { name: ownerPatch.name } : {}),
          ...(ownerPatch.email !== undefined ? { email: ownerPatch.email } : {}),
          ...(ownerPatch.phone !== undefined ? { phone: ownerPatch.phone || null } : {}),
        }
      : {};

    try {
      const operations = [];
      if (Object.keys(clubData).length > 0) operations.push(prisma.club.update({ where: { id }, data: clubData }));
      // Keep the public site's display name in sync when it was still the club name.
      if (name !== undefined && existing.settings?.name === existing.name) {
        operations.push(prisma.gymSettings.updateMany({ where: { clubId: id }, data: { name } }));
      }
      if (currentOwner && Object.keys(ownerData).length > 0) {
        operations.push(prisma.user.update({ where: { id: currentOwner.id }, data: ownerData }));
      }
      await prisma.$transaction(operations);
    } catch (error) {
      if (isUniqueViolation(error, "slug")) return NextResponse.json({ error: "Ce slug est déjà utilisé", field: "slug" }, { status: 409 });
      if (isUniqueViolation(error, "customDomain")) return NextResponse.json({ error: "Ce domaine est déjà utilisé", field: "customDomain" }, { status: 409 });
      if (isUniqueViolation(error, "email")) return NextResponse.json({ error: "Cet email est déjà associé à un compte", field: "ownerEmail" }, { status: 409 });
      throw error;
    }

    invalidateClubCache(existing.slug);
    if (slug) invalidateClubCache(slug);

    const club = await prisma.club.findUnique({
      where: { id },
      select: { id: true, name: true, slug: true, status: true, customDomain: true },
    });

    await logAction(request, {
      clubId: id,
      actorId: auth.user.id, actorName: auth.user.name, actorRole: auth.user.role,
      action: "PLATFORM_CLUB_UPDATED", category: "SUBSCRIPTION",
      targetId: id, targetName: club?.name ?? existing.name,
      detail: {
        ...(name !== undefined ? { name } : {}),
        ...(slug !== undefined ? { slug, previousSlug: existing.slug } : {}),
        ...(customDomain !== undefined ? { customDomain } : {}),
        ...(ownerPatch ? { owner: { ...ownerData } } : {}),
      },
    });

    return NextResponse.json({ ok: true, club });
  } catch (error) {
    log.error("platform.club.update_failed", { error: String(error) });
    return SERVER_ERROR();
  }
}

// ─── PATCH (lifecycle actions) ───────────────────────────────────────────────

export async function PATCH(request: NextRequest, { params }: Ctx) {
  try {
    const csrfError = verifyOrigin(request);
    if (csrfError) return csrfError;

    const auth = await requireSuperAdmin(request);
    if (!auth.ok) return NextResponse.json({ error: DENIED }, { status: auth.status });
    const actor = {
      actorId: auth.user.id, actorName: auth.user.name, actorRole: auth.user.role,
    };

    const { id } = await params;
    const parsed = clubActionSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 });
    const input = parsed.data;

    const club = await prisma.club.findUnique({
      where: { id },
      select: {
        id: true, name: true, slug: true, status: true, trialEndsAt: true, suspendedReason: true,
        subscription: { select: { status: true, trialEndsAt: true } },
      },
    });
    if (!club) return NOT_FOUND();

    const now = new Date();
    const base = { clubId: id, ...actor, category: "SUBSCRIPTION" as const, targetId: id, targetName: club.name };

    switch (input.action) {
      case "suspend":
      case "freeze": {
        if (club.status === "CANCELLED") {
          return NextResponse.json({ error: "Ce club est annulé — réactivez-le avant de le suspendre" }, { status: 409 });
        }
        const reason = input.reason || "Suspendu par la plateforme";
        await prisma.$transaction([
          prisma.club.update({ where: { id }, data: { status: "SUSPENDED", suspendedAt: now, suspendedReason: reason } }),
          prisma.clubSubscription.updateMany({ where: { clubId: id }, data: { status: "SUSPENDED" } }),
        ]);
        invalidateClubCache(club.slug);
        await logAction(request, { ...base, action: "PLATFORM_CLUB_SUSPENDED", detail: { reason } });
        return NextResponse.json({ ok: true, status: "SUSPENDED" });
      }

      case "activate":
      case "unfreeze": {
        await prisma.$transaction([
          prisma.club.update({ where: { id }, data: { status: "ACTIVE", suspendedAt: null, suspendedReason: null } }),
          prisma.clubSubscription.updateMany({ where: { clubId: id }, data: { status: "ACTIVE", canceledAt: null } }),
        ]);
        invalidateClubCache(club.slug);
        await logAction(request, { ...base, action: "PLATFORM_CLUB_ACTIVATED", detail: { from: club.status } });
        return NextResponse.json({ ok: true, status: "ACTIVE" });
      }

      case "ban": {
        // Login and every requireX() guard already reject non-ACTIVE/TRIAL clubs,
        // so users are NOT deactivated one by one: that would be irreversible on
        // reactivation (we couldn't tell them apart from individually-disabled ones).
        const reason = input.reason || "Banni par la plateforme";
        await prisma.$transaction([
          prisma.club.update({ where: { id }, data: { status: "CANCELLED", suspendedAt: now, suspendedReason: reason } }),
          prisma.clubSubscription.updateMany({ where: { clubId: id }, data: { status: "CANCELED", canceledAt: now } }),
        ]);
        invalidateClubCache(club.slug);
        await logAction(request, { ...base, action: "PLATFORM_CLUB_BANNED", detail: { reason } });
        return NextResponse.json({ ok: true, status: "CANCELLED" });
      }

      case "change_plan": {
        const plan = await prisma.saasPlan.findFirst({ where: { id: input.planId, isActive: true } });
        if (!plan) return NextResponse.json({ error: "Plan introuvable ou inactif" }, { status: 404 });

        // upsert: legacy / manually-created clubs may have no subscription row yet.
        await prisma.clubSubscription.upsert({
          where: { clubId: id },
          update: { planId: plan.id },
          create: {
            clubId: id,
            planId: plan.id,
            status: club.status === "TRIAL" ? "TRIALING" : "ACTIVE",
            trialEndsAt: club.trialEndsAt,
            currentPeriodStart: now,
            currentPeriodEnd: club.trialEndsAt,
          },
        });
        await logAction(request, { ...base, action: "PLATFORM_CLUB_PLAN_CHANGED", detail: { toPlan: plan.tier } });
        return NextResponse.json({ ok: true, plan: { id: plan.id, tier: plan.tier, name: plan.name } });
      }

      case "extend_trial": {
        const trialExpired = club.status === "SUSPENDED" && club.suspendedReason === TRIAL_EXPIRED_REASON;
        if (club.status !== "TRIAL" && !trialExpired) {
          return NextResponse.json(
            { error: "Seul un club en période d'essai (ou suspendu pour essai expiré) peut être prolongé" },
            { status: 409 },
          );
        }
        const trialEndsAt = computeExtendedTrialEnd(club.trialEndsAt, input.days, now);
        await prisma.$transaction([
          prisma.club.update({
            where: { id },
            data: { trialEndsAt, status: "TRIAL", suspendedAt: null, suspendedReason: null },
          }),
          prisma.clubSubscription.updateMany({
            where: { clubId: id },
            data: { trialEndsAt, currentPeriodEnd: trialEndsAt, status: "TRIALING" },
          }),
        ]);
        invalidateClubCache(club.slug);
        await logAction(request, {
          ...base, action: "PLATFORM_CLUB_TRIAL_EXTENDED",
          detail: { days: input.days, trialEndsAt: trialEndsAt.toISOString(), reactivated: trialExpired },
        });
        return NextResponse.json({ ok: true, status: "TRIAL", trialEndsAt });
      }

      case "reset_owner_password": {
        const owner = await prisma.user.findFirst({
          where: { clubId: id, role: "OWNER" },
          orderBy: { createdAt: "asc" },
          select: { id: true, email: true },
        });
        if (!owner) return NextResponse.json({ error: "Ce club n'a pas de propriétaire" }, { status: 409 });

        const password = await hashPassword(input.password);
        await prisma.user.update({
          where: { id: owner.id },
          data: { password, resetTokenHash: null, resetTokenExpiry: null },
        });
        // Never log the password itself.
        await logAction(request, { ...base, action: "PLATFORM_CLUB_OWNER_PASSWORD_RESET", detail: { ownerEmail: owner.email } });
        return NextResponse.json({ ok: true });
      }
    }
  } catch (error) {
    log.error("platform.club.action_failed", { error: String(error) });
    return SERVER_ERROR();
  }
}

// ─── DELETE ──────────────────────────────────────────────────────────────────

export async function DELETE(request: NextRequest, { params }: Ctx) {
  try {
    const csrfError = verifyOrigin(request);
    if (csrfError) return csrfError;

    const auth = await requireSuperAdmin(request);
    if (!auth.ok) return NextResponse.json({ error: DENIED }, { status: auth.status });

    const { id } = await params;
    const club = await prisma.club.findUnique({
      where: { id },
      select: { id: true, name: true, slug: true, _count: { select: { users: true, payments: true } } },
    });
    if (!club) return NOT_FOUND();

    // Irreversible: the caller must prove intent by echoing the slug.
    const parsed = deleteClubSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success || parsed.data.confirmSlug.toLowerCase() !== club.slug) {
      return NextResponse.json({ error: "Confirmation invalide : saisissez le slug exact du club", field: "confirmSlug" }, { status: 400 });
    }

    await deleteClubCascade(id);
    invalidateClubCache(club.slug);

    // clubId: null — the club's own log rows are removed with it (ON DELETE CASCADE),
    // so this entry must live outside the tenant to survive.
    await logAction(request, {
      clubId: null,
      actorId: auth.user.id, actorName: auth.user.name, actorRole: auth.user.role,
      action: "PLATFORM_CLUB_DELETED", category: "SUBSCRIPTION",
      targetId: id, targetName: club.name,
      detail: { slug: club.slug, users: club._count.users, payments: club._count.payments },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    log.error("platform.club.delete_failed", { error: String(error) });
    return NextResponse.json({ error: "Impossible de supprimer ce club" }, { status: 500 });
  }
}