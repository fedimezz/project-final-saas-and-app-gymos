import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireUser, isAuthResponse } from "@/lib/auth-server";
import { formatZodError, planUpdateSchema } from "@/lib/validation";
import { isValidMembershipPrice } from "@/lib/payment-currencies";
import { logAction } from "@/lib/activity-log";
import { runAfter } from "@/lib/after";

// Price changes are business-sensitive (same tier as Promotions/Analytics),
// so only OWNER can edit or retire a plan. ADMIN can still read plans
// (GET on /api/admin/plans) to build subscribe-modal dropdowns.
async function requireOwner(request: NextRequest) {
  const auth = await requireUser(request);
  if (isAuthResponse(auth)) return auth;
  if (auth.role !== "OWNER") {
    return NextResponse.json({ error: "Accès refusé — réservé au propriétaire" }, { status: 403 });
  }
  return auth;
}

// PUT /api/admin/plans/[id] — edit a plan (name, description, price, durationDays, features, isActive)
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireOwner(request);
  if (isAuthResponse(auth)) return auth;

  try {
    const { id } = await params;
    const rawBody = await request.json().catch(() => null);
    const parsed = planUpdateSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 });
    }
    const { name, description, price, currency, durationDays, features, isActive } = parsed.data;
    if (price !== undefined || currency !== undefined) {
      const current = await prisma.membershipPlan.findFirst({
        where: { id, clubId: auth.clubId as string },
        select: { price: true, currency: true },
      });
      if (!current) return NextResponse.json({ error: "Offre introuvable" }, { status: 404 });
      const nextPrice = price ?? current.price;
      const nextCurrency = currency ?? current.currency;
      if (!isValidMembershipPrice(nextPrice, nextCurrency)) {
        return NextResponse.json({ error: `Le prix doit respecter la précision autorisée pour ${nextCurrency}.` }, { status: 400 });
      }
    }

    const existing = await prisma.membershipPlan.findFirst({ where: { id, clubId: auth.clubId as string } });
    if (!existing) {
      return NextResponse.json({ error: "Offre introuvable" }, { status: 404 });
    }

    const plan = await prisma.membershipPlan.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description: description || null }),
        ...(price !== undefined && { price }),
        ...(currency !== undefined && { currency }),
        ...(durationDays !== undefined && { durationDays }),
        ...(features !== undefined && { features }),
        ...(isActive !== undefined && { isActive }),
      },
    });

    runAfter(() =>
      logAction(request, {
        clubId: auth.clubId as string,
        actorId: auth.id, actorName: auth.name, actorRole: auth.role,
        action: "PLAN_UPDATED",
        category: "SUBSCRIPTION",
        targetId: plan.id,
        targetName: plan.name,
      })
    )

    return NextResponse.json({ plan });
  } catch (error) {
    console.error("Admin plan PUT error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

// DELETE /api/admin/plans/[id] — retire a plan. We never hard-delete a plan
// that has subscriptions attached (would orphan payment history), so this
// soft-deletes via isActive:false unless the plan has zero subscriptions ever.
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireOwner(request);
  if (isAuthResponse(auth)) return auth;

  try {
    const { id } = await params;
    const existing = await prisma.membershipPlan.findFirst({ where: { id, clubId: auth.clubId as string } });
    if (!existing) {
      return NextResponse.json({ error: "Offre introuvable" }, { status: 404 });
    }
    const subCount = await prisma.subscription.count({ where: { planId: id } });

    if (subCount > 0) {
      const plan = await prisma.membershipPlan.update({ where: { id }, data: { isActive: false } });
      runAfter(() =>
        logAction(request, {
          clubId: auth.clubId as string,
          actorId: auth.id, actorName: auth.name, actorRole: auth.role,
          action: "PLAN_DEACTIVATED",
          category: "SUBSCRIPTION",
          targetId: plan.id,
          targetName: plan.name,
        })
      )

      return NextResponse.json({ plan, softDeleted: true });
    }

    await prisma.membershipPlan.delete({ where: { id } });
    runAfter(() =>
      logAction(request, {
        clubId: auth.clubId as string,
        actorId: auth.id, actorName: auth.name, actorRole: auth.role,
        action: "PLAN_DELETED",
        category: "SUBSCRIPTION",
        targetId: id,
        targetName: existing.name,
      })
    )

    return NextResponse.json({ deleted: true });
  } catch (error) {
    console.error("Admin plan DELETE error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
