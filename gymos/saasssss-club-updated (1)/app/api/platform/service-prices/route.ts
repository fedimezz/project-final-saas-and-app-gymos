// GET /api/platform/service-prices — full price list (SUPER_ADMIN only).
// PUT /api/platform/service-prices { serviceType, price, currency, isActive? }
// The ONLY place prices for optional services change. Existing requests keep
// the price snapshotted when they were created (priceAtRequest/currency).
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/auth";
import { verifyOrigin } from "@/lib/csrf";
import { isValidMembershipPrice } from "@/lib/payment-currencies";
import { logAction } from "@/lib/activity-log";
import { formatZodError, servicePriceUpdateSchema } from "@/lib/validation";

const DENIED = "Accès réservé à la plateforme";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireSuperAdmin(request);
    if (!auth.ok) return NextResponse.json({ error: DENIED }, { status: auth.status });
    const prices = await prisma.servicePrice.findMany({ orderBy: { serviceType: "asc" } });
    return NextResponse.json({ prices });
  } catch (error) {
    console.error("Platform service-prices GET error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await requireSuperAdmin(request);
    if (!auth.ok) return NextResponse.json({ error: DENIED }, { status: auth.status });
    const csrf = verifyOrigin(request);
    if (csrf) return csrf;

    const parsed = servicePriceUpdateSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 });
    }
    const { serviceType, price, currency, isActive } = parsed.data;
    if (!isValidMembershipPrice(price, currency)) {
      return NextResponse.json({ error: "Montant invalide pour cette devise" }, { status: 400 });
    }

    const updated = await prisma.servicePrice.upsert({
      where: { serviceType },
      update: { price, currency, updatedBy: auth.user.id, ...(isActive !== undefined && { isActive }) },
      create: { serviceType, price, currency, isActive: isActive ?? true, updatedBy: auth.user.id },
    });

    await logAction(request, {
      clubId: null,
      actorId: auth.user.id, actorName: auth.user.name, actorRole: "SUPER_ADMIN",
      action: "SERVICE_PRICE_UPDATED", category: "SETTINGS", targetName: serviceType,
      detail: { price, currency, isActive: updated.isActive },
    });

    return NextResponse.json({ price: updated });
  } catch (error) {
    console.error("Platform service-prices PUT error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
