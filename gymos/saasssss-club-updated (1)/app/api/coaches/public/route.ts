import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { resolveTenantFromRequest } from "@/lib/tenant";
import { safeImageUrl } from "@/lib/image-url";

const NO_STORE = { "Cache-Control": "no-store, max-age=0" };

// Public, unauthenticated: active coaches only, no email/phone/userId —
// just what a visitor should see (name, photo, bio, specialties, and which
// activities they currently teach in the active weekly plan), for the gym
// resolved from the current subdomain.
export async function GET(request: NextRequest) {
  try {
    const tenant = await resolveTenantFromRequest(request);
    if (!tenant) return NextResponse.json({ coaches: [] }, { headers: NO_STORE });

    const coaches = await prisma.coach.findMany({
      where: { clubId: tenant.id, isActive: true },
      select: {
        id: true,
        name: true,
        bio: true,
        photoUrl: true,
        specialties: true,
        sessions: {
          where: { weeklyPlan: { isActive: true, clubId: tenant.id } },
          select: { activity: true },
        },
      },
      orderBy: { name: "asc" },
    });

    const shaped = coaches.map((c: {
      id: string;
      name: string;
      bio: string | null;
      photoUrl: string | null;
      specialties: string[];
      sessions: { activity: string }[];
    }) => ({
      id: c.id,
      name: c.name,
      bio: c.bio,
      // A photo on a host next/image doesn't allow used to crash the whole coaches page.
      photoUrl: safeImageUrl(c.photoUrl),
      specialties: c.specialties,
      activities: Array.from(new Set(c.sessions.map((s: { activity: string }) => s.activity))),
    }));

    return NextResponse.json({ coaches: shaped }, { headers: NO_STORE });
  } catch (error) {
    console.error("Public coaches GET error:", error);
    return NextResponse.json({ coaches: [] }, { headers: NO_STORE });
  }
}
