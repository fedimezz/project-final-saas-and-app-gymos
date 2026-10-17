/**
 * /api/auth/bridge — open redirect, session-token replay, single use,
 * wrong-club redemption, login-CSRF nonce.
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

const CLUB = { id: "club-1", slug: "club-1", name: "Club 1", status: "TRIAL" };
const OWNER = { id: "owner-1", email: "o@c.test", role: "OWNER", name: "Owner", clubId: CLUB.id, isActive: true };

const userFindUnique = vi.fn();
const clubFindUnique = vi.fn();
const consumedBridgeKeys = new Set<string>();
vi.mock("@/lib/one-time", () => ({
  consumeOnce: vi.fn(async (key: string) => {
    if (consumedBridgeKeys.has(key)) return false;
    consumedBridgeKeys.add(key);
    return true;
  }),
}));
vi.mock("@/lib/prisma", () => ({
  default: {
    user: { findUnique: (...a: unknown[]) => userFindUnique(...a) },
    club: { findUnique: (...a: unknown[]) => clubFindUnique(...a) },
  },
}));

beforeAll(() => {
  process.env.JWT_SECRET = "test-secret-minimum-32-chars-xxxxxxxxx";
});
beforeEach(() => {
  vi.clearAllMocks();
  consumedBridgeKeys.clear();
  userFindUnique.mockResolvedValue(OWNER);
  clubFindUnique.mockImplementation(async ({ where }: { where: { slug?: string } }) => (where.slug === CLUB.slug ? CLUB : null));
});
afterEach(() => vi.unstubAllEnvs());

const NONCE = "browser-nonce";

async function mint(overrides: Partial<{ id: string; clubId: string; nonce: string }> = {}) {
  const { generateBridgeToken, hashBridgeNonce } = await import("@/lib/auth");
  return generateBridgeToken({
    id: overrides.id ?? OWNER.id,
    clubId: overrides.clubId ?? CLUB.id,
    nonceHash: hashBridgeNonce(overrides.nonce ?? NONCE),
  });
}

function bridgeReq(token: string | null, opts: { redirect?: string; host?: string; nonceCookie?: string } = {}) {
  const host = opts.host ?? "club-1.yoursaas.test";
  const url = new URL(`https://${host}/api/auth/bridge`);
  if (token) url.searchParams.set("token", token);
  if (opts.redirect) url.searchParams.set("redirect", opts.redirect);
  const headers: Record<string, string> = { host };
  if (opts.nonceCookie) headers.cookie = `bridge_nonce=${opts.nonceCookie}`;
  return new NextRequest(url, { headers });
}
async function call(req: NextRequest) {
  const { GET } = await import("@/app/api/auth/bridge/route");
  return GET(req);
}
const location = (r: Response) => r.headers.get("location") ?? "";

describe("bridge route", () => {
  it("happy path (production): sets a session cookie, redirects into the club", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const res = await call(bridgeReq(await mint(), { redirect: "/admin/settings?welcome=1", nonceCookie: NONCE }));

    expect(location(res)).toBe("https://club-1.yoursaas.test/admin/settings?welcome=1");
    const setCookie = res.headers.getSetCookie().join("\n");
    expect(setCookie).toMatch(/token=[^;]+/);
    expect(setCookie).toContain("HttpOnly");
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it.each(["//evil.com", "/\\evil.com", "https://evil.com", "javascript:alert(1)"])(
    "open redirect blocked: redirect=%s stays on the club (falls back to /admin)",
    async (evil) => {
      vi.stubEnv("NODE_ENV", "production");
      const res = await call(bridgeReq(await mint(), { redirect: evil, nonceCookie: NONCE }));
      expect(location(res)).toBe("https://club-1.yoursaas.test/admin");
    }
  );

  it("a normal SESSION token (the old 'stolen token never expires' exploit) is refused", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { generateToken } = await import("@/lib/auth");
    const session = generateToken({ id: OWNER.id, email: OWNER.email, role: "OWNER", name: "Owner", clubId: CLUB.id });
    const res = await call(bridgeReq(session, { nonceCookie: NONCE }));

    expect(location(res)).toContain("/platform/login?expired=1");
    expect(res.headers.getSetCookie().join("\n")).not.toMatch(/token=[^;]+;/);
  });

  it("is SINGLE USE: the second redemption of the same token fails", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const token = await mint();
    const first = await call(bridgeReq(token, { nonceCookie: NONCE }));
    const second = await call(bridgeReq(token, { nonceCookie: NONCE }));

    expect(location(first)).not.toContain("expired");
    expect(location(second)).toContain("expired=1");
  });

  it("refuses a token minted for a different club", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const res = await call(bridgeReq(await mint({ clubId: "some-other-club" }), { nonceCookie: NONCE }));
    expect(location(res)).toContain("expired=1");
  });

  it("login-CSRF: without the browser's nonce cookie the link is useless (production)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const noCookie = await call(bridgeReq(await mint()));
    const wrongCookie = await call(bridgeReq(await mint(), { nonceCookie: "attacker-guess" }));

    expect(location(noCookie)).toContain("expired=1");
    expect(location(wrongCookie)).toContain("expired=1");
  });

  it("refuses when the account was deactivated or is no longer an owner/admin", async () => {
    vi.stubEnv("NODE_ENV", "production");
    userFindUnique.mockResolvedValue({ ...OWNER, isActive: false });
    expect(location(await call(bridgeReq(await mint(), { nonceCookie: NONCE })))).toContain("expired=1");

    userFindUnique.mockResolvedValue({ ...OWNER, role: "MEMBER" });
    expect(location(await call(bridgeReq(await mint(), { nonceCookie: NONCE })))).toContain("expired=1");
  });

  it("no token → login page; garbage token → expired", async () => {
    expect(location(await call(bridgeReq(null)))).toContain("/platform/login");
    expect(location(await call(bridgeReq("garbage")))).toContain("expired=1");
  });
});
