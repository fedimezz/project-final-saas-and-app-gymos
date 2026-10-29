import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { Prisma, SubscriptionStatus } from "@prisma/client";
import { cuidSchema, formatZodError, recordPaymentSchema } from "@/lib/validation";
import { logAction } from "@/lib/activity-log";
import { runAfter } from "@/lib/after";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.ok) return NextResponse.json({ error: "Accès refusé" }, { status: auth.status });
    const admin = auth.user;

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const search = searchParams.get("search") ?? "";
    const page = Math.max(1, Number(searchParams.get("page")) || 1);
    const limit = 20;

    const where: Prisma.PaymentWhereInput = {
      clubId: admin.clubId as string,
      ...(status ? { status } : {}),
      ...(search && {
        subscription: {
          user: {
            OR: [
              { name: { contains: search, mode: "insensitive" } },
              { email: { contains: search, mode: "insensitive" } },
            ],
          },
        },
      }),
    };

    const [payments, total] = await Promise.all([
      prisma.payment.findMany({
        where,
        include: {
          subscription: {
            include: {
              user: { select: { id: true, name: true, email: true } },
              plan: { select: { name: true } },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.payment.count({ where }),
    ]);

    return NextResponse.json({
      payments,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error("Admin payments GET error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.ok) return NextResponse.json({ error: "Accès refusé" }, { status: auth.status });
    const admin = auth.user;
    if (!(await hasPermission(admin, "payments.record"))) {
      return NextResponse.json({ error: "Permission requise : enregistrer des paiements" }, { status: 403 });
    }

    const rawBody = await request.json().catch(() => null);
    const parsed = recordPaymentSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 });
    }
    const { subscriptionId, amount, paymentMethod, transactionId } = parsed.data;

    const sub = await prisma.subscription.findFirst({
      where: { id: subscriptionId, clubId: admin.clubId as string },
      include: { plan: { select: { currency: true } } },
    });
    if (!sub) return NextResponse.json({ error: "Abonnement introuvable" }, { status: 404 });

    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const payment = await tx.payment.create({
        data: {
          clubId: admin.clubId as string,
          subscriptionId,
          amount,
          currency: sub.plan.currency,
          status: "PAID",
          paymentMethod,
          transactionId: transactionId || null,
          paidAt: new Date(),
        },
      });
      await tx.subscription.update({
        where: { id: subscriptionId },
        data: { status: SubscriptionStatus.ACTIVE },
      });
      return payment;
    });

    runAfter(() =>
      logAction(request, {
        clubId: admin.clubId as string,
        actorId: admin.id, actorName: admin.name, actorRole: admin.role,
        action: "PAYMENT_RECORDED",
        category: "PAYMENT",
        targetId: result.id,
        detail: { amount, paymentMethod },
      })
    )

    return NextResponse.json({ payment: result }, { status: 201 });
  } catch (error) {
    console.error("Admin payments POST error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.ok) return NextResponse.json({ error: "Accès refusé" }, { status: auth.status });
    const admin = auth.user;
    if (!(await hasPermission(admin, "payments.refund"))) {
      return NextResponse.json({ error: "Permission requise : rembourser" }, { status: 403 });
    }

    const rawBody = await request.json().catch(() => null);
    const parsed = z.object({ id: cuidSchema }).safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 });
    }
    const { id } = parsed.data;

    const existing = await prisma.payment.findFirst({ where: { id, clubId: admin.clubId as string } });
    if (!existing) return NextResponse.json({ error: "Paiement introuvable" }, { status: 404 });

    await prisma.payment.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Admin payments DELETE error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}