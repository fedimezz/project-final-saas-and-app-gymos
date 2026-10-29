// GET /api/saas-plans — list the SaaS plans NEW customers may pick (active + public).
// Public and unauthenticated — used by the onboarding wizard and the
// marketing pricing page. Returns only fields safe to expose publicly.
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { PUBLIC_PLAN_WHERE } from "@/lib/saas-plan-access";

export async function GET() {
  try {
    const plans = await prisma.saasPlan.findMany({
      where: PUBLIC_PLAN_WHERE,
      orderBy: { priceMonthly: "asc" },
      select: {
        id: true,
        tier: true,
        name: true,
        priceMonthly: true,
        priceYearly: true,
        currency: true,
        limits: true,
      },
    });

    return NextResponse.json({ plans });
  } catch (error) {
    console.error("SaaS plans GET error:", error);
    return NextResponse.json({ plans: [] });
  }
}
