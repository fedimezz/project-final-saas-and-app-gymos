import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { Prisma, SubscriptionStatus } from "@prisma/client";
import { cuidSchema, formatZodError, subscriptionActionSchema } from "@/lib/validation";
import { z } from "zod";

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

    const where: Prisma.SubscriptionWhereInput = {
      clubId: admin.clubId as string,
      ...(status && (Object.values(SubscriptionStatus) as string[]).includes(status)
        ? { status: status as SubscriptionStatus }
        : {}),
      ...(search && {
        user: {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { email: { contains: search, mode: "insensitive" } },
          ],
        },
      }),
    };

    const [subscriptions, total] = await Promise.all([
      prisma.subscription.findMany({
        where,
        include: {
          user: { select: { id: true, name: true, email: true, avatar: true } },
          plan: true,
          payments: { orderBy: { createdAt: "desc" }, take: 1 },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.subscription.count({ where }),
    ]);

    return NextResponse.json({
      subscriptions,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error("Admin subscriptions GET error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.ok) return NextResponse.json({ error: "Accès refusé" }, { status: auth.status });
    const admin = auth.user;
    if (!(await hasPermission(admin, "memberships.sell"))) {
      return NextResponse.json({ error: "Permission requise : vendre / renouveler" }, { status: 403 });
    }

    const rawBody = await request.json().catch(() => null);
    const parsed = subscriptionActionSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 });
    }
    const { subscriptionId, action } = parsed.data;

    const sub = await prisma.subscription.findFirst({ where: { id: subscriptionId, clubId: admin.clubId as string } });
    if (!sub) return NextResponse.json({ error: "Abonnement introuvable" }, { status: 404 });

    const statusMap: Record<string, SubscriptionStatus> = {
      approve: SubscriptionStatus.ACTIVE,
      cancel: SubscriptionStatus.CANCELLED,
      suspend: SubscriptionStatus.SUSPENDED,
    };

    const newStatus = statusMap[action];
    if (!newStatus) return NextResponse.json({ error: "Action invalide" }, { status: 400 });

    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const updated = await tx.subscription.update({
        where: { id: subscriptionId },
        data: { status: newStatus },
      });
      if (action === "approve") {
        await tx.payment.updateMany({
          where: { subscriptionId, status: "PENDING" },
          data: { status: "PAID", paidAt: new Date() },
        });
      }
      return updated;
    });

    return NextResponse.json({ subscription: result });
  } catch (error) {
    console.error("Admin subscriptions PATCH error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.ok) return NextResponse.json({ error: "Accès refusé" }, { status: auth.status });
    const admin = auth.user;
    if (!(await hasPermission(admin, "memberships.sell"))) {
      return NextResponse.json({ error: "Permission requise : vendre / renouveler" }, { status: 403 });
    }

    const rawBody = await request.json().catch(() => null);
    const parsed = z.object({ id: cuidSchema }).safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 });
    }
    const { id } = parsed.data;

    const existing = await prisma.subscription.findFirst({ where: { id, clubId: admin.clubId as string } });
    if (!existing) return NextResponse.json({ error: "Abonnement introuvable" }, { status: 404 });

    await prisma.subscription.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Admin subscriptions DELETE error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}