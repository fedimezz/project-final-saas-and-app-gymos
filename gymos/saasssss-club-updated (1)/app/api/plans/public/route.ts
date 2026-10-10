import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { resolveTenantFromRequest } from "@/lib/tenant";

// Public, unauthenticated: only active plans, only the fields a visitor
// should see (no isActive/createdAt/etc), for the gym resolved from the
// current subdomain. Used by the marketing /offres page and the homepage
// PricingSection so real, owner-set prices show up instead of hardcoded copy.
export async function GET(request: NextRequest) {
  try {
    const tenant = await resolveTenantFromRequest(request);
    if (!tenant) return NextResponse.json({ plans: [] });

    const plans = await prisma.membershipPlan.findMany({
      where: { clubId: tenant.id, isActive: true },
      orderBy: { price: "asc" },
      select: {
        id: true,
        name: true,
        description: true,
        price: true,
        currency: true,
        durationDays: true,
        features: true,
      },
    });

    return NextResponse.json({ plans });
  } catch (error) {
    console.error("Public plans GET error:", error);
    return NextResponse.json({ plans: [] });
  }
}
