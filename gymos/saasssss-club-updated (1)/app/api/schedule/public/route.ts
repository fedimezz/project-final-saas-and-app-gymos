import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { resolveTenantFromRequest } from "@/lib/tenant";

// Public, unauthenticated: the club's ACTIVE weekly plan only, limited to what
// a visitor needs to see (day, hours, activity, coach, place). No capacity or
// booking counts. Scoped to the club resolved from the subdomain.
export async function GET(request: NextRequest) {
  try {
    const tenant = await resolveTenantFromRequest(request);
    if (!tenant) return NextResponse.json({ sessions: [] });

    const sessions = await prisma.session.findMany({
      where: { clubId: tenant.id, weeklyPlan: { isActive: true, clubId: tenant.id } },
      select: {
        id: true,
        day: true,
        startTime: true,
        endTime: true,
        activity: true,
        coach: true,
        location: true,
      },
      orderBy: [{ startTime: "asc" }],
      take: 500,
    });

    return NextResponse.json({ sessions });
  } catch (error) {
    console.error("Public schedule GET error:", error);
    return NextResponse.json({ sessions: [] });
  }
}
