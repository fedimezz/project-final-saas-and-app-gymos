import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { denyUnlessPermitted } from "@/lib/permission-guard";
import { formatZodError, promotionSchema } from "@/lib/validation";
import { logAction } from "@/lib/activity-log";
import { runAfter } from "@/lib/after";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.ok) return NextResponse.json({ error: "Accès refusé" }, { status: auth.status });
    const denied = await denyUnlessPermitted(auth.user, "promotions.manage");
    if (denied) return denied;

    const promotions = await prisma.promotion.findMany({
      where: { clubId: auth.user.clubId as string },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ promotions });
  } catch (error) {
    console.error("Admin promotions GET error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.ok) return NextResponse.json({ error: "Accès refusé" }, { status: auth.status });
    const denied = await denyUnlessPermitted(auth.user, "promotions.manage");
    if (denied) return denied;
    const owner = auth.user;
    const clubId = owner.clubId as string;

    const rawBody = await request.json().catch(() => null);
    const parsed = promotionSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 });
    }
    const { code, title, description, discountType, discountValue, startDate, endDate, maxUses, isActive, isPublic } = parsed.data;

    const normalizedCode = code.toUpperCase();

    const existing = await prisma.promotion.findUnique({ where: { clubId_code: { clubId, code: normalizedCode } } });
    if (existing) {
      return NextResponse.json({ error: "Ce code promo existe déjà" }, { status: 409 });
    }

    const promotion = await prisma.promotion.create({
      data: {
        clubId,
        code: normalizedCode,
        title,
        description: description || null,
        discountType,
        discountValue,
        startDate: startDate ?? new Date(),
        endDate: endDate ?? null,
        maxUses: maxUses ?? null,
        isActive: isActive ?? true,
        isPublic: isPublic ?? true,
        createdBy: owner.id,
      },
    });

    runAfter(() =>
      logAction(request, {
        clubId: clubId,
        actorId: owner.id, actorName: owner.name, actorRole: owner.role,
        action: "PROMOTION_CREATED",
        category: "PAYMENT",
        targetId: promotion.id,
        targetName: promotion.code,
      })
    )

    return NextResponse.json({ promotion }, { status: 201 });
  } catch (error) {
    console.error("Admin promotions POST error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
