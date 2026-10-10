// GET /api/saas-plans — list all active SaaS plans for the platform.
// Public and unauthenticated — used by the onboarding wizard and the
// marketing pricing page. Returns only fields safe to expose publicly.
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET() {
  try {
    const plans = await prisma.saasPlan.findMany({
      where: { isActive: true },
      orderBy: { priceMonthly: "asc" },
      select: {
        id: true,
        tier: true,
        name: true,
        priceMonthly: true,
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
