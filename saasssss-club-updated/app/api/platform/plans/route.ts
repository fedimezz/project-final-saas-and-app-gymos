// GET /api/platform/plans — SUPER_ADMIN only. Same SaasPlan rows as the
// public /api/saas-plans endpoint, plus subscriber counts per tier for
// the platform control dashboard.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/auth";
import { verifyOrigin } from "@/lib/csrf";

const limitsSchema = z.object({
  maxMembers: z.number().int().positive().nullable(),
  maxCoaches: z.number().int().positive().nullable(),
  maxAdmins: z.number().int().positive().nullable(),
  storageGB: z.number().positive(),
  maxBookingsPerMonth: z.number().int().positive().nullable(),
  maxCustomPages: z.number().int().positive().nullable(),
  customDomain: z.boolean(),
  advancedAnalytics: z.boolean(),
  revenueAnalytics: z.boolean(),
  apiAccess: z.boolean(),
  whiteLabel: z.boolean(),
}).strict();

const updateSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(80).optional(),
  priceMonthly: z.number().finite().positive().max(100_000)
    .refine((price) => Math.abs(price * 100 - Math.round(price * 100)) < 1e-7, "Le prix doit avoir au maximum deux décimales.")
    .optional(),
  currency: z.literal("USD").optional(),
  limits: limitsSchema.optional(),
  isActive: z.boolean().optional(),
}).refine((data) => Object.keys(data).some((key) => key !== "id"), {
  message: "Au moins un champ de plan doit être modifié.",
});

export async function GET(request: NextRequest) {
  try {
    const auth = await requireSuperAdmin(request);
    if (!auth.ok) return NextResponse.json({ error: "Accès réservé à la plateforme" }, { status: auth.status });

    const plans = await prisma.saasPlan.findMany({
      orderBy: { priceMonthly: "asc" },
      include: { _count: { select: { clubSubscriptions: true } } },
    });

    return NextResponse.json({
      plans: plans.map((p) => ({
        id: p.id,
        tier: p.tier,
        name: p.name,
        priceMonthly: p.priceMonthly,
        currency: p.currency,
        limits: p.limits,
        isActive: p.isActive,
        subscriberCount: p._count.clubSubscriptions,
      })),
    });
  } catch (error) {
    console.error("Platform plans GET error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const csrfError = verifyOrigin(request);
  if (csrfError) return csrfError;

  try {
    const auth = await requireSuperAdmin(request);
    if (!auth.ok) return NextResponse.json({ error: "Accès réservé à la plateforme" }, { status: auth.status });

    const body = await request.json().catch(() => null);
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Données invalides." }, { status: 400 });
    }

    const { id, ...changes } = parsed.data;
    const current = await prisma.saasPlan.findUnique({
      where: { id },
      select: { id: true, isActive: true },
    });
    if (!current) return NextResponse.json({ error: "Plan introuvable." }, { status: 404 });

    if (current.isActive && changes.isActive === false) {
      const activeCount = await prisma.saasPlan.count({ where: { isActive: true } });
      if (activeCount <= 1) {
        return NextResponse.json({ error: "Gardez au moins un plan actif pour les nouvelles inscriptions." }, { status: 409 });
      }
    }

    const plan = await prisma.saasPlan.update({
      where: { id },
      data: changes,
      select: { id: true, tier: true, name: true, priceMonthly: true, currency: true, limits: true, isActive: true },
    });

    return NextResponse.json({ plan });
  } catch (error) {
    console.error("Platform plans PATCH error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
