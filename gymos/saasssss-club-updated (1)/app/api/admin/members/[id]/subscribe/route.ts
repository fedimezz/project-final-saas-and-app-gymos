import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { requireAdmin } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { cuidSchema, formatZodError } from "@/lib/validation";
import { logAction } from "@/lib/activity-log";
import { runAfter } from "@/lib/after";

const subscribeSchema = z.object({
  planId: cuidSchema,
  paymentMethod: z.enum(["CASH", "CARD", "TRANSFER"]),
  // Previously `transactionId?.trim()` — if a client sent a number or
  // object here instead of a string, that threw an uncaught TypeError
  // (500) inside the transaction instead of a clean 400.
  transactionId: z.string().trim().max(200).optional(),
  startDate: z.string().optional(),
});

// POST /api/admin/members/[id]/subscribe
// { planId, paymentMethod: "CASH" | "CARD" | "TRANSFER", transactionId?, startDate }
//
// Admin/front-desk flow for a payment collected in person: unlike the
// member-facing /api/dashboard/membership/subscribe route (which creates a
// PENDING subscription awaiting confirmation), the money has already
// changed hands here, so the subscription and payment are created ACTIVE /
// PAID immediately.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.ok) return NextResponse.json({ error: "Accès refusé" }, { status: auth.status });
    const admin = auth.user;
    if (!(await hasPermission(admin, "memberships.sell"))) {
      return NextResponse.json({ error: "Permission requise : vendre / renouveler" }, { status: 403 });
    }

    const { id: userId } = await params;
    const rawBody = await request.json().catch(() => null);
    const parsed = subscribeSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 });
    }
    const { planId, paymentMethod, transactionId, startDate } = parsed.data;

    const member = await prisma.user.findFirst({ where: { id: userId, clubId: admin.clubId as string } });
    if (!member) {
      return NextResponse.json({ error: "Membre introuvable" }, { status: 404 });
    }

    const plan = await prisma.membershipPlan.findFirst({ where: { id: planId, clubId: admin.clubId as string } });
    if (!plan || !plan.isActive) {
      return NextResponse.json({ error: "Plan introuvable ou inactif" }, { status: 404 });
    }

    const parsedStart = startDate ? new Date(startDate) : new Date();
    if (Number.isNaN(parsedStart.getTime())) {
      return NextResponse.json({ error: "Date de début invalide" }, { status: 400 });
    }

    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const existing = await tx.subscription.findFirst({
        where: {
          clubId: admin.clubId as string,
          userId,
          OR: [{ status: "ACTIVE", endDate: { gt: new Date() } }, { status: "PENDING" }],
        },
      });

      if (existing) {
        throw new Error(existing.status === "PENDING" ? "ALREADY_PENDING" : "ALREADY_ACTIVE");
      }

      const endDate = new Date(parsedStart.getTime() + plan.durationDays * 24 * 60 * 60 * 1000);

      const subscription = await tx.subscription.create({
        data: {
          clubId: admin.clubId as string,
          userId,
          planId: plan.id,
          startDate: parsedStart,
          endDate,
          status: "ACTIVE",
        },
      });

      const payment = await tx.payment.create({
        data: {
          clubId: admin.clubId as string,
          subscriptionId: subscription.id,
          amount: plan.price,
          currency: plan.currency,
          status: "PAID",
          paymentMethod,
          transactionId: transactionId || null,
          paidAt: new Date(),
        },
      });

      return { subscription, payment };
    });

    runAfter(() =>
      logAction(request, {
        clubId: admin.clubId as string,
        actorId: admin.id, actorName: admin.name, actorRole: admin.role,
        action: "SUBSCRIPTION_CREATED",
        category: "SUBSCRIPTION",
        targetId: result.subscription.id,
        detail: { memberId: userId, amount: result.payment.amount },
      })
    )

    return NextResponse.json(
      { message: "Abonnement créé avec succès", ...result },
      { status: 201 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "ALREADY_ACTIVE") {
      return NextResponse.json({ error: "Ce membre a déjà un abonnement actif" }, { status: 409 });
    }
    if (message === "ALREADY_PENDING") {
      return NextResponse.json(
        { error: "Ce membre a déjà une souscription en attente" },
        { status: 409 }
      );
    }
    console.error("Admin member subscribe POST error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
