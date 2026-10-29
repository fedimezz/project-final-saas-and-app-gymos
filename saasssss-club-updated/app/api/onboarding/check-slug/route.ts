import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { slugSchema } from "@/lib/slug";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

// GET /api/onboarding/check-slug?slug=my-gym
// Uses the SAME schema as create-club and the platform club CRUD
// (lib/slug.ts), so "available" here can never disagree with what
// create-club will accept — reserved names (admin, billing, mail, ...) are
// reported unavailable instead of being offered and then rejected.
export async function GET(request: NextRequest) {
  // Public + unauthenticated + hits the DB: cap it per IP so it can't be used
  // to enumerate every club slug on the platform.
  const rl = await checkRateLimit(`check-slug:${getClientIp(request)}`, 30, 60 * 1000);
  if (!rl.allowed) {
    return NextResponse.json({ available: false, error: "Trop de requêtes" }, { status: 429 });
  }

  const slug = new URL(request.url).searchParams.get("slug") ?? "";
  const parsed = slugSchema.safeParse(slug);
  if (!parsed.success) {
    return NextResponse.json(
      { available: false, error: parsed.error.issues[0]?.message ?? "Slug invalide" },
      { status: 400 }
    );
  }

  const club = await prisma.club.findUnique({ where: { slug: parsed.data }, select: { id: true } });
  return NextResponse.json({ available: !club, slug: parsed.data });
}
