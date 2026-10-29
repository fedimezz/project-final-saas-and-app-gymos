import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";

// lib/auth.ts imports the Prisma client at module scope, and (via
// lib/tenant.ts) also queries Club. Mock both so these tests exercise the
// real requireUser/requireAdmin/requireOwner/requireCoach/requireSuperAdmin
// logic — including real tenant-isolation checks — without a live database.
const userFindUniqueMock = vi.fn();
const clubFindUniqueMock = vi.fn();
vi.mock("@/lib/prisma", () => ({
  default: {
    user: { findUnique: (...args: unknown[]) => userFindUniqueMock(...args) },
    club: { findUnique: (...args: unknown[]) => clubFindUniqueMock(...args) },
  },
}));

beforeAll(() => {
  process.env.JWT_SECRET = "test-secret-do-not-use-in-production";
});

const { generateToken, requireUser, requireAdmin, requireOwner, requireCoach, requireSuperAdmin, clearAccountCache } =
  await import("../auth");

// The per-request account check is cached for a few seconds; without this a
// previous test's user (same id) would be served to the next test.
beforeEach(() => clearAccountCache());

// Each test registers its own club under a unique slug so the short-TTL
// cache in lib/tenant.ts can never leak state between tests (no need to
// reset it — different slug, different cache entry, every time).
let slugCounter = 0;
function registerClub(status: "ACTIVE" | "TRIAL" | "SUSPENDED" | "CANCELLED" = "ACTIVE") {
  slugCounter += 1;
  const slug = `club-${slugCounter}`;
  const club = { id: `${slug}_id`, slug, name: slug, status };
  clubFindUniqueMock.mockImplementation(async ({ where }: { where: { slug: string } }) =>
    where.slug === slug ? club : null
  );
  return club;
}

function makeRequest(token: string | undefined, host: string): Request {
  const headers: Record<string, string> = { host };
  if (token) headers["cookie"] = `token=${token}`;
  return new Request(`https://${host}/api/whatever`, { headers });
}

describe("requireUser", () => {
  it("rejects a request with no token", async () => {
    const club = registerClub();
    const result = await requireUser(makeRequest(undefined, `${club.slug}.example.test`));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(401);
  });

  it("rejects a syntactically invalid token", async () => {
    const club = registerClub();
    const result = await requireUser(makeRequest("not-a-real-jwt", `${club.slug}.example.test`));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(401);
  });

  it("accepts a valid token for an active account on its own gym's subdomain", async () => {
    const club = registerClub();
    userFindUniqueMock.mockResolvedValueOnce({
      id: "user_1", email: "a@b.com", role: "MEMBER", name: "Test User", isActive: true, clubId: club.id,
    });
    const token = generateToken({ id: "user_1", email: "a@b.com", role: "MEMBER", name: "Test User", clubId: club.id });
    const result = await requireUser(makeRequest(token, `${club.slug}.example.test`));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.user.id).toBe("user_1");
  });

  // This is the core tenant-isolation guarantee: a valid, unexpired token
  // for Gym A's member must NOT work against Gym B's subdomain, even
  // though the JWT signature itself is perfectly valid.
  it("REJECTS a Gym A user's token presented against Gym B's subdomain", async () => {
    const clubA = registerClub();
    const clubB = registerClub();
    userFindUniqueMock.mockResolvedValueOnce({
      id: "user_1", email: "a@b.com", role: "MEMBER", name: "Test User", isActive: true, clubId: clubA.id,
    });
    const tokenForA = generateToken({ id: "user_1", email: "a@b.com", role: "MEMBER", name: "Test User", clubId: clubA.id });
    const result = await requireUser(makeRequest(tokenForA, `${clubB.slug}.example.test`));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(403);
  });

  it("rejects access to a suspended gym even for that gym's own member", async () => {
    const club = registerClub("SUSPENDED");
    userFindUniqueMock.mockResolvedValueOnce({
      id: "user_1", email: "a@b.com", role: "MEMBER", name: "Test User", isActive: true, clubId: club.id,
    });
    const token = generateToken({ id: "user_1", email: "a@b.com", role: "MEMBER", name: "Test User", clubId: club.id });
    const result = await requireUser(makeRequest(token, `${club.slug}.example.test`));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(403);
  });

  // Regression: before multi-tenancy, a suspended (isActive: false) account's
  // still-unexpired JWT kept working for up to 7 days because nothing
  // re-checked the database. Confirms that's still caught, independent of
  // the new tenant check.
  it("REJECTS a valid, unexpired token for an account suspended after the token was issued", async () => {
    const club = registerClub();
    userFindUniqueMock.mockResolvedValueOnce({
      id: "user_1", email: "a@b.com", role: "MEMBER", name: "Test User", isActive: false, clubId: club.id,
    });
    const token = generateToken({ id: "user_1", email: "a@b.com", role: "MEMBER", name: "Test User", clubId: club.id });
    const result = await requireUser(makeRequest(token, `${club.slug}.example.test`));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(403);
  });

  it("rejects a token for a user that no longer exists (e.g. deleted account)", async () => {
    const club = registerClub();
    userFindUniqueMock.mockResolvedValueOnce(null);
    const token = generateToken({ id: "user_1", email: "a@b.com", role: "MEMBER", name: "Test User", clubId: club.id });
    const result = await requireUser(makeRequest(token, `${club.slug}.example.test`));
    expect(result.ok).toBe(false);
  });

  it("uses the CURRENT db role, not a stale JWT role claim", async () => {
    const club = registerClub();
    // Token was issued while this user was a MEMBER...
    const token = generateToken({ id: "user_1", email: "a@b.com", role: "MEMBER", name: "Test User", clubId: club.id });
    // ...but the DB now says they've since been promoted to ADMIN.
    userFindUniqueMock.mockResolvedValueOnce({
      id: "user_1", email: "a@b.com", role: "ADMIN", name: "Test User", isActive: true, clubId: club.id,
    });
    const result = await requireUser(makeRequest(token, `${club.slug}.example.test`));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.user.role).toBe("ADMIN");
  });

  it("rejects a SUPER_ADMIN token — platform admins are not gym users", async () => {
    const club = registerClub();
    userFindUniqueMock.mockResolvedValueOnce({
      id: "super_1", email: "root@platform.local", role: "SUPER_ADMIN", name: "Root", isActive: true, clubId: null,
    });
    const token = generateToken({ id: "super_1", email: "root@platform.local", role: "SUPER_ADMIN", name: "Root", clubId: null });
    const result = await requireUser(makeRequest(token, `${club.slug}.example.test`));
    expect(result.ok).toBe(false);
  });
});

describe("requireAdmin", () => {
  it("rejects an active MEMBER account (correct role check)", async () => {
    const club = registerClub();
    userFindUniqueMock.mockResolvedValueOnce({
      id: "user_1", email: "a@b.com", role: "MEMBER", name: "Test", isActive: true, clubId: club.id,
    });
    const token = generateToken({ id: "user_1", email: "a@b.com", role: "MEMBER", name: "Test", clubId: club.id });
    const result = await requireAdmin(makeRequest(token, `${club.slug}.example.test`));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(403);
  });

  it("accepts an active ADMIN account on its own gym's subdomain", async () => {
    const club = registerClub();
    userFindUniqueMock.mockResolvedValueOnce({
      id: "user_1", email: "a@b.com", role: "ADMIN", name: "Test", isActive: true, clubId: club.id,
    });
    const token = generateToken({ id: "user_1", email: "a@b.com", role: "ADMIN", name: "Test", clubId: club.id });
    const result = await requireAdmin(makeRequest(token, `${club.slug}.example.test`));
    expect(result.ok).toBe(true);
  });

  it("rejects an ADMIN of Gym A hitting Gym B's admin API", async () => {
    const clubA = registerClub();
    const clubB = registerClub();
    userFindUniqueMock.mockResolvedValueOnce({
      id: "user_1", email: "a@b.com", role: "ADMIN", name: "Test", isActive: true, clubId: clubA.id,
    });
    const token = generateToken({ id: "user_1", email: "a@b.com", role: "ADMIN", name: "Test", clubId: clubA.id });
    const result = await requireAdmin(makeRequest(token, `${clubB.slug}.example.test`));
    expect(result.ok).toBe(false);
  });

  // Regression: an admin demoted to MEMBER (or suspended) must lose admin
  // access even while still holding their old admin-issued token.
  it("rejects a token claiming ADMIN if the db now says the account was demoted", async () => {
    const club = registerClub();
    userFindUniqueMock.mockResolvedValueOnce({
      id: "user_1", email: "a@b.com", role: "MEMBER", name: "Test", isActive: true, clubId: club.id,
    });
    const token = generateToken({ id: "user_1", email: "a@b.com", role: "ADMIN", name: "Test", clubId: club.id }); // stale, claims admin
    const result = await requireAdmin(makeRequest(token, `${club.slug}.example.test`));
    expect(result.ok).toBe(false);
  });
});

describe("requireOwner", () => {
  it("rejects an active ADMIN account (OWNER is a stricter tier)", async () => {
    const club = registerClub();
    userFindUniqueMock.mockResolvedValueOnce({
      id: "user_1", email: "a@b.com", role: "ADMIN", name: "Test", isActive: true, clubId: club.id,
    });
    const token = generateToken({ id: "user_1", email: "a@b.com", role: "ADMIN", name: "Test", clubId: club.id });
    const result = await requireOwner(makeRequest(token, `${club.slug}.example.test`));
    expect(result.ok).toBe(false);
  });

  it("accepts an active OWNER account on its own gym's subdomain", async () => {
    const club = registerClub();
    userFindUniqueMock.mockResolvedValueOnce({
      id: "user_1", email: "a@b.com", role: "OWNER", name: "Test", isActive: true, clubId: club.id,
    });
    const token = generateToken({ id: "user_1", email: "a@b.com", role: "OWNER", name: "Test", clubId: club.id });
    const result = await requireOwner(makeRequest(token, `${club.slug}.example.test`));
    expect(result.ok).toBe(true);
  });
});

describe("requireCoach", () => {
  it("rejects an ADMIN account (staff manage coaches, they don't act as one)", async () => {
    const club = registerClub();
    userFindUniqueMock.mockResolvedValueOnce({
      id: "user_1", email: "a@b.com", role: "ADMIN", name: "Test", isActive: true, clubId: club.id,
    });
    const token = generateToken({ id: "user_1", email: "a@b.com", role: "ADMIN", name: "Test", clubId: club.id });
    const result = await requireCoach(makeRequest(token, `${club.slug}.example.test`));
    expect(result.ok).toBe(false);
  });

  it("accepts an active COACH account on its own gym's subdomain", async () => {
    const club = registerClub();
    userFindUniqueMock.mockResolvedValueOnce({
      id: "user_1", email: "a@b.com", role: "COACH", name: "Test", isActive: true, clubId: club.id,
    });
    const token = generateToken({ id: "user_1", email: "a@b.com", role: "COACH", name: "Test", clubId: club.id });
    const result = await requireCoach(makeRequest(token, `${club.slug}.example.test`));
    expect(result.ok).toBe(true);
  });

  it("rejects a suspended COACH account", async () => {
    const club = registerClub();
    userFindUniqueMock.mockResolvedValueOnce({
      id: "user_1", email: "a@b.com", role: "COACH", name: "Test", isActive: false, clubId: club.id,
    });
    const token = generateToken({ id: "user_1", email: "a@b.com", role: "COACH", name: "Test", clubId: club.id });
    const result = await requireCoach(makeRequest(token, `${club.slug}.example.test`));
    expect(result.ok).toBe(false);
  });
});

describe("requireSuperAdmin", () => {
  it("accepts a SUPER_ADMIN token regardless of host — platform admins have no tenant", async () => {
    userFindUniqueMock.mockResolvedValueOnce({
      id: "super_1", email: "root@platform.local", role: "SUPER_ADMIN", name: "Root", isActive: true, clubId: null,
    });
    const token = generateToken({ id: "super_1", email: "root@platform.local", role: "SUPER_ADMIN", name: "Root", clubId: null });
    const result = await requireSuperAdmin(makeRequest(token, "platform.example.test"));
    expect(result.ok).toBe(true);
  });

  it("rejects a gym OWNER token — gym admins are not platform admins", async () => {
    const club = registerClub();
    userFindUniqueMock.mockResolvedValueOnce({
      id: "user_1", email: "a@b.com", role: "OWNER", name: "Test", isActive: true, clubId: club.id,
    });
    const token = generateToken({ id: "user_1", email: "a@b.com", role: "OWNER", name: "Test", clubId: club.id });
    const result = await requireSuperAdmin(makeRequest(token, "platform.example.test"));
    expect(result.ok).toBe(false);
  });
});
