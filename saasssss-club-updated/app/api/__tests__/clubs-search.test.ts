/**
 * GET /api/clubs/search — the mobile app's entry point before any auth.
 * Public by design; must never surface suspended/cancelled clubs or
 * anything beyond what a "find my gym" screen needs.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const rateLimit = vi.fn();
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: (...a: unknown[]) => rateLimit(...a),
  getClientIp: () => "1.2.3.4",
}));

const clubFindMany = vi.fn();
vi.mock("@/lib/prisma", () => ({ default: { club: { findMany: (...a: unknown[]) => clubFindMany(...a) } } }));

beforeEach(() => {
  vi.clearAllMocks();
  rateLimit.mockResolvedValue({ allowed: true, remaining: 10, resetAt: 0 });
  clubFindMany.mockResolvedValue([
    { slug: "gym-a", name: "Gym Alpha", customDomain: null, settings: { logoUrl: "https://res.cloudinary.com/demo/image/upload/a.png" } },
  ]);
});

async function search(q: string) {
  const { GET } = await import("@/app/api/clubs/search/route");
  return GET(new NextRequest(`https://yoursaas.test/api/clubs/search?q=${encodeURIComponent(q)}`));
}

describe("GET /api/clubs/search", () => {
  it("returns an empty list for a query under 2 chars, without touching the DB", async () => {
    const res = await search("g");
    expect((await res.json()).clubs).toEqual([]);
    expect(clubFindMany).not.toHaveBeenCalled();
  });

  it("only ever queries TRIAL/ACTIVE clubs — never SUSPENDED or CANCELLED", async () => {
    await search("gym");
    expect(clubFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: { in: ["TRIAL", "ACTIVE"] } }) })
    );
  });

  it("returns only safe, minimal fields — no ids, emails, or internal data", async () => {
    const res = await search("gym");
    const { clubs } = await res.json();
    expect(clubs[0]).toEqual({
      slug: "gym-a", name: "Gym Alpha", logoUrl: "https://res.cloudinary.com/demo/image/upload/a.png", apiBaseUrl: expect.any(String),
    });
  });

  it("builds apiBaseUrl from the club's own subdomain", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_URL", "https://yoursaas.test");
    const res = await search("gym");
    const { clubs } = await res.json();
    expect(clubs[0].apiBaseUrl).toBe("https://gym-a.yoursaas.test");
    vi.unstubAllEnvs();
  });

  it("is rate limited per IP", async () => {
    rateLimit.mockResolvedValue({ allowed: false, remaining: 0, resetAt: 0 });
    const res = await search("gym");
    expect(res.status).toBe(429);
    expect(clubFindMany).not.toHaveBeenCalled();
  });

  it("caps results and never returns more than the limit", async () => {
    await search("a");
    // query too short (1 char) already covered; use a 2-char valid query:
    await search("gy");
    expect(clubFindMany).toHaveBeenCalledWith(expect.objectContaining({ take: 10 }));
  });
});
