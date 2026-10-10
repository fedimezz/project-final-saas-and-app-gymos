// GET /api/clubs/search?q=...
//
// Public, unauthenticated, by design: the mobile app has no Host-header
// tenant context yet (unlike the web app, which gets its tenant from the
// subdomain the browser is already on) — this is how it finds one, before
// any login happens. Returns just enough to let the app point itself at
// that club's API host (`https://{slug}.<APP_URL host>` or, if set,
// `https://{customDomain}`) and nothing an operator would consider private.
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { buildTenantOrigin, platformHostname } from "@/lib/tenant-url";
import { safeImageUrl } from "@/lib/image-url";

const MAX_RESULTS = 10;

// CORS: this route is hit cross-origin by the mobile app's web preview
// (Expo web on localhost:8081, and eventually any browser client) — native
// iOS/Android fetch isn't subject to CORS at all, but a browser preflights
// any request carrying Content-Type: application/json with OPTIONS first.
// Without this, Next.js 405s the preflight and the browser blocks the real
// GET before it reaches this handler. Safe to allow any origin: public,
// unauthenticated, no cookies involved.
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-client-type",
};

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(request: NextRequest) {
  // No auth on this endpoint at all, so the only real abuse control is rate
  // limiting — generous enough for a real user searching, tight enough that
  // scraping the whole club list back-to-back isn't practical.
  const rl = await checkRateLimit(`club-search:${getClientIp(request)}`, 30, 60 * 1000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Trop de requêtes" }, { status: 429, headers: CORS_HEADERS });
  }

  // Without APP_URL every club's address resolves to http://{slug}.localhost, which
  // the mobile app (HTTPS-only in production) silently drops — the search then looks
  // "empty" for every query. Fail loudly instead of returning unusable results.
  if (process.env.NODE_ENV === "production" && !platformHostname()) {
    console.error("clubs/search: APP_URL is not set — club addresses cannot be built");
    return NextResponse.json({ error: "Service temporairement indisponible." }, { status: 503, headers: CORS_HEADERS });
  }

  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) {
    return NextResponse.json({ clubs: [] }, { headers: CORS_HEADERS });
  }

  // Match what a member actually types: the club name (Club.name OR the display
  // name the owner set in GymSettings.name — they diverge as soon as the owner
  // renames the club), or its sub-domain slug. "Le Club de Gammarth" is found by
  // "gammarth", "club" or "le-club".
  const slugQuery = q.toLowerCase().replace(/\s+/g, "-");
  const clubs = await prisma.club.findMany({
    where: {
      status: { in: ["TRIAL", "ACTIVE"] }, // never surface a suspended/cancelled club
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { slug: { contains: slugQuery, mode: "insensitive" } },
        { settings: { is: { name: { contains: q, mode: "insensitive" } } } },
      ],
    },
    select: {
      slug: true,
      name: true,
      customDomain: true,
      settings: { select: { logoUrl: true, name: true } },
    },
    take: MAX_RESULTS,
    orderBy: { name: "asc" },
  });

  return NextResponse.json(
      {
        clubs: clubs.map((c) => ({
          slug: c.slug,
          name: c.settings?.name?.trim() || c.name,
          logoUrl: safeImageUrl(c.settings?.logoUrl),
          apiBaseUrl: buildTenantOrigin(c),
        })),
      },
      { headers: { ...CORS_HEADERS, "Cache-Control": "no-store" } }
  );
}