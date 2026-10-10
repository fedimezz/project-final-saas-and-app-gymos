import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const clubFindUnique = vi.fn();
const clubFindFirst = vi.fn();
vi.mock("@/lib/prisma", () => ({
  default: {
    club: {
      findUnique: (...a: unknown[]) => clubFindUnique(...a),
      findFirst: (...a: unknown[]) => clubFindFirst(...a),
    },
  },
}));

const { resolveClubBySlug, resolveTenantFromRequest, invalidateClubCache } = await import("../tenant");

beforeEach(() => {
  clubFindUnique.mockReset();
  clubFindFirst.mockReset();
  clubFindUnique.mockImplementation(async ({ where }: { where: { slug: string } }) =>
    where.slug.startsWith("real-") ? { id: where.slug, slug: where.slug, name: where.slug, status: "ACTIVE" } : null
  );
  clubFindFirst.mockResolvedValue(null);
});
afterEach(() => vi.unstubAllEnvs());

describe("tenant cache", () => {
  it("caches hits: second lookup doesn't touch the DB", async () => {
    await resolveClubBySlug("real-cache-hit");
    await resolveClubBySlug("real-cache-hit");
    expect(clubFindUnique).toHaveBeenCalledTimes(1);
  });

  it("caches misses too (so a random-subdomain flood costs one query per slug per window)", async () => {
    await resolveClubBySlug("nope-miss");
    await resolveClubBySlug("nope-miss");
    expect(clubFindUnique).toHaveBeenCalledTimes(1);
  });

  it("rejects non-DNS-label slugs without querying the database", async () => {
    for (const bad of ["UPPER", "has space", "a".repeat(64), "-lead", "trail-", "under_score", "", "x/../y", "a.b"]) {
      expect(await resolveClubBySlug(bad)).toBeNull();
    }
    expect(clubFindUnique).not.toHaveBeenCalled();
  });

  it("is bounded: a flood of unique slugs can't grow it past the cap (oldest evicted)", async () => {
    // 1200 distinct hosts > the 500 cap. Then re-request the FIRST one: it must
    // have been evicted, i.e. hit the DB again.
    for (let i = 0; i < 1200; i++) await resolveClubBySlug(`flood-${i}`);
    clubFindUnique.mockClear();
    await resolveClubBySlug("flood-0");
    expect(clubFindUnique).toHaveBeenCalledTimes(1);
    // ...while a recent one is still cached.
    clubFindUnique.mockClear();
    await resolveClubBySlug("flood-1199");
    expect(clubFindUnique).not.toHaveBeenCalled();
  });

  it("invalidateClubCache forces a fresh lookup", async () => {
    await resolveClubBySlug("real-invalidate");
    invalidateClubCache("real-invalidate");
    await resolveClubBySlug("real-invalidate");
    expect(clubFindUnique).toHaveBeenCalledTimes(2);
  });
});

describe("custom-domain lookup (production)", () => {
  const req = (host: string) => new Request(`https://${host}/`, { headers: { host } });

  it("never queries the DB for the platform apex or www", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_URL", "https://yoursaas.test");
    expect(await resolveTenantFromRequest(req("yoursaas.test"))).toBeNull();
    expect(await resolveTenantFromRequest(req("www.yoursaas.test"))).toBeNull();
    expect(clubFindFirst).not.toHaveBeenCalled();
    expect(clubFindUnique).not.toHaveBeenCalled();
  });

  it("resolves a custom domain, and caches the lookup", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_URL", "https://yoursaas.test");
    clubFindFirst.mockResolvedValue({ id: "c1", slug: "gym", name: "Gym", status: "ACTIVE", customDomain: "gym-cache.example.com" });
    const a = await resolveTenantFromRequest(req("gym-cache.example.com"));
    const b = await resolveTenantFromRequest(req("gym-cache.example.com"));
    expect(a?.id).toBe("c1");
    expect(b?.id).toBe("c1");
    expect(clubFindFirst).toHaveBeenCalledTimes(1);
  });

  it("a 3-label custom domain (app.mygym.tn) is no longer mistaken for a tenant slug", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_URL", "https://yoursaas.test");
    clubFindFirst.mockResolvedValue({ id: "c2", slug: "mygym", name: "My Gym", status: "ACTIVE", customDomain: "app.mygym.tn" });
    const club = await resolveTenantFromRequest(req("app.mygym.tn"));
    expect(club?.id).toBe("c2");
  });

  it("a known tenant subdomain still wins and never queries custom domains", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_URL", "https://yoursaas.test");
    const club = await resolveTenantFromRequest(req("real-sub.yoursaas.test"));
    expect(club?.slug).toBe("real-sub");
    expect(clubFindFirst).not.toHaveBeenCalled();
  });

  it("ignores garbage Host values instead of querying with them", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_URL", "https://yoursaas.test");
    expect(await resolveTenantFromRequest(new Request("https://x.test/", { headers: { host: "not a host!!" } }))).toBeNull();
    expect(clubFindFirst).not.toHaveBeenCalled();
  });
});
