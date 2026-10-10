import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { resolveTenantFromRequest } from "@/lib/tenant";

const NO_STORE = { "Cache-Control": "no-store, max-age=0" };

// Public, unauthenticated: the promotional offers a club chose to advertise,
// for the club resolved from the CURRENT host (subdomain / custom domain) —
// never from a query parameter, so one club can't read another's offers.
//
// An offer is shown only when ALL of these hold:
//   - it belongs to this club              (clubId = tenant.id)
//   - the owner/admin published it         (isPublic)
//   - it is switched on                    (isActive)
//   - today is inside its date window      (startDate <= now, endDate empty or not before today)
//   - it still has uses left               (maxUses null or usedCount < maxUses)
// Internal fields (usedCount, maxUses, createdBy, ids of other tables) are not
// returned. The promo code IS returned: publishing an offer means advertising
// the code; owners who want a private code simply leave "Afficher sur le site" off.
export async function GET(request: NextRequest) {
  try {
    const tenant = await resolveTenantFromRequest(request);
    if (!tenant) return NextResponse.json({ promotions: [] }, { headers: NO_STORE });

    const now = new Date();
    // The admin form stores an end DATE (midnight UTC). The offer must stay
    // visible for that whole last day, so compare against the start of today.
    const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const rows = await prisma.promotion.findMany({
      where: {
        clubId: tenant.id,
        isActive: true,
        isPublic: true,
        startDate: { lte: now },
        OR: [{ endDate: null }, { endDate: { gte: startOfToday } }],
      },
      select: {
        id: true,
        code: true,
        title: true,
        description: true,
        discountType: true,
        discountValue: true,
        startDate: true,
        endDate: true,
        maxUses: true,
        usedCount: true,
      },
      orderBy: [{ endDate: "asc" }, { createdAt: "desc" }],
      take: 24,
    });

    const promotions = rows
      .filter((p) => p.maxUses == null || p.usedCount < p.maxUses)
      .map((p) => ({
        id: p.id,
        code: p.code,
        title: p.title,
        description: p.description,
        discountType: p.discountType,
        discountValue: p.discountValue,
        startDate: p.startDate,
        endDate: p.endDate,
        usesLeft: p.maxUses == null ? null : Math.max(0, p.maxUses - p.usedCount),
      }));

    return NextResponse.json({ promotions }, { headers: NO_STORE });
  } catch (error) {
    console.error("Public promotions GET error:", error);
    return NextResponse.json({ promotions: [] }, { headers: NO_STORE });
  }
}
