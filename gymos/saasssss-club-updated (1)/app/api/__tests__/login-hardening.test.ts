/**
 * /api/auth/login + /api/auth/logout hardening:
 * enumeration, timing equalisation, per-email throttle, multi-club owner
 * portal, host-only SUPER_ADMIN cookie, logout clears the cookie for real.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";

const rateLimit = vi.fn();
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: (...a: unknown[]) => rateLimit(...a),
  getClientIp: () => "1.2.3.4",
}));
vi.mock("@/lib/activity-log", () => ({ logAction: vi.fn().mockResolvedValue(undefined) }));

const userFindMany = vi.fn();
const clubFindUnique = vi.fn();
vi.mock("@/lib/prisma", () => ({
  default: {
    user: { findMany: (...a: unknown[]) => userFindMany(...a) },
    club: { findUnique: (...a: unknown[]) => clubFindUnique(...a) },
  },
}));

const dummyCheck = vi.fn().mockResolvedValue(false);
vi.mock("@/lib/bcrypt", async (orig) => {
  const real = await orig<typeof import("@/lib/bcrypt")>();
  return { ...real, dummyPasswordCheck: (...a: unknown[]) => dummyCheck(...a) };
});

const PASSWORD = "correct-horse-battery";
let HASH = "";
beforeAll(() => {
  process.env.JWT_SECRET = "test-secret-minimum-32-chars-xxxxxxxxx";
  HASH = bcrypt.hashSync(PASSWORD, 4);
});

const CLUB = { id: "club-1", slug: "club-1", name: "Club 1", status: "ACTIVE" };
const baseUser = (over: Record<string, unknown> = {}) => ({
  id: "u1", email: "u@c.test", name: "U", role: "MEMBER", clubId: CLUB.id, phone: null, avatar: null,
  password: HASH, isActive: true, emailVerified: new Date(), createdAt: new Date(),
  club: { slug: CLUB.slug, name: CLUB.name }, subscriptions: [], membershipCard: null, ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  rateLimit.mockResolvedValue({ allowed: true, remaining: 5, resetAt: 0 });
  clubFindUnique.mockImplementation(async ({ where }: { where: { slug?: string } }) => (where.slug === CLUB.slug ? CLUB : null));
  userFindMany.mockResolvedValue([baseUser()]);
});

function loginReq(body: Record<string, unknown>, host = "club-1.yoursaas.test") {
  return new NextRequest(`https://${host}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json", host },
    body: JSON.stringify(body),
  });
}
async function login(body: Record<string, unknown>, host?: string) {
  const { POST } = await import("@/app/api/auth/login/route");
  return POST(loginReq(body, host));
}

describe("credential failures are indistinguishable", () => {
  it("unknown email, wrong password and Google-only account return the SAME status and message", async () => {
    userFindMany.mockResolvedValueOnce([]);
    const unknown = await login({ email: "nobody@c.test", password: PASSWORD });
    const wrongPw = await login({ email: "u@c.test", password: "not-the-password" });
    userFindMany.mockResolvedValueOnce([baseUser({ password: null })]);
    const googleOnly = await login({ email: "g@c.test", password: PASSWORD });

    const bodies = await Promise.all([unknown, wrongPw, googleOnly].map((r) => r.json()));
    expect([unknown.status, wrongPw.status, googleOnly.status]).toEqual([401, 401, 401]);
    expect(new Set(bodies.map((b) => b.error)).size).toBe(1);
  });

  it("burns a dummy bcrypt compare when the account doesn't exist or has no password", async () => {
    userFindMany.mockResolvedValueOnce([]);
    await login({ email: "nobody@c.test", password: PASSWORD });
    expect(dummyCheck).toHaveBeenCalledTimes(1);

    dummyCheck.mockClear();
    userFindMany.mockResolvedValueOnce([baseUser({ password: null })]);
    await login({ email: "g@c.test", password: PASSWORD });
    expect(dummyCheck).toHaveBeenCalledTimes(1);
  });

  it("a deactivated account only learns it's deactivated AFTER proving the password", async () => {
    userFindMany.mockResolvedValue([baseUser({ isActive: false })]);
    const wrong = await login({ email: "u@c.test", password: "nope" });
    const right = await login({ email: "u@c.test", password: PASSWORD });

    expect((await wrong.json()).error).toMatch(/incorrect/i);
    expect((await right.json()).error).toMatch(/désactivé/i);
  });
});

describe("throttling", () => {
  it("is also limited per target account, not just per IP", async () => {
    await login({ email: "u@c.test", password: "x" });
    const keys = rateLimit.mock.calls.map((c) => c[0] as string);
    expect(keys).toContain("login:1.2.3.4");
    expect(keys).toContain(`login-email:${CLUB.id}:u@c.test`);
  });

  it("429 when the per-email budget is spent — before any bcrypt work", async () => {
    rateLimit.mockImplementation(async (key: string) => ({ allowed: !key.startsWith("login-email:"), remaining: 0, resetAt: 0 }));
    const res = await login({ email: "u@c.test", password: PASSWORD });
    expect(res.status).toBe(429);
    expect(userFindMany).not.toHaveBeenCalled();
  });
});

describe("owner portal (apex host, same email in several clubs)", () => {
  it("looks candidates up in a deterministic order", async () => {
    userFindMany.mockResolvedValue([baseUser({ role: "OWNER" })]);
    await login({ email: "u@c.test", password: PASSWORD, portal: "owner" }, "yoursaas.test");
    expect(userFindMany).toHaveBeenCalledWith(expect.objectContaining({ orderBy: { createdAt: "asc" } }));
  });

  it("same password in two clubs → 409 with the club list, never a random pick, no cookie", async () => {
    userFindMany.mockResolvedValue([
      baseUser({ id: "a", role: "OWNER", clubId: "c1", club: { slug: "alpha", name: "Alpha" } }),
      baseUser({ id: "b", role: "OWNER", clubId: "c2", club: { slug: "beta", name: "Beta" } }),
    ]);
    const res = await login({ email: "u@c.test", password: PASSWORD, portal: "owner" }, "yoursaas.test");
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.clubs.map((c: { slug: string }) => c.slug)).toEqual(["alpha", "beta"]);
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("two clubs but the password only matches one → logs into THAT one", async () => {
    userFindMany.mockResolvedValue([
      baseUser({ id: "a", role: "OWNER", clubId: "c1", password: bcrypt.hashSync("other-password", 4) }),
      baseUser({ id: "b", role: "OWNER", clubId: "c2" }),
    ]);
    const res = await login({ email: "u@c.test", password: PASSWORD, portal: "owner" }, "yoursaas.test");
    expect(res.status).toBe(200);
    expect((await res.json()).user.id).toBe("b");
  });
});

describe("mobile client (x-client-type: mobile-app)", () => {
  it("the web client (no header) never gets the raw token in the body", async () => {
    const res = await login({ email: "u@c.test", password: PASSWORD });
    const json = await res.json();
    expect(json.token).toBeUndefined();
    expect(res.headers.get("set-cookie")).toMatch(/token=[^;]+/); // still gets the cookie
  });

  it("a mobile client gets the token in the JSON body, in ADDITION to the cookie", async () => {
    const { POST } = await import("@/app/api/auth/login/route");
    const res = await POST(
      new NextRequest("https://club-1.yoursaas.test/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json", host: "club-1.yoursaas.test", "x-client-type": "mobile-app" },
        body: JSON.stringify({ email: "u@c.test", password: PASSWORD }),
      })
    );
    const json = await res.json();
    expect(typeof json.token).toBe("string");
    expect(json.token.split(".")).toHaveLength(3); // looks like a JWT
  });

  it("a failed login never leaks a token, mobile or not", async () => {
    const { POST } = await import("@/app/api/auth/login/route");
    const res = await POST(
      new NextRequest("https://club-1.yoursaas.test/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json", host: "club-1.yoursaas.test", "x-client-type": "mobile-app" },
        body: JSON.stringify({ email: "u@c.test", password: "wrong" }),
      })
    );
    expect((await res.json()).token).toBeUndefined();
  });
});

describe("session cookie scope", () => {
  it("club users get the shared-domain cookie", async () => {
    const res = await login({ email: "u@c.test", password: PASSWORD });
    expect(res.headers.get("set-cookie")).toContain("Domain=.club-1.yoursaas.test");
  });

  it("SUPER_ADMIN gets a HOST-ONLY cookie (never sent to tenant subdomains)", async () => {
    userFindMany.mockResolvedValue([baseUser({ role: "SUPER_ADMIN", clubId: null, club: null })]);
    const res = await login({ email: "root@c.test", password: PASSWORD }, "yoursaas.test");
    const cookie = res.headers.get("set-cookie")!;
    expect(res.status).toBe(200);
    expect(cookie).toMatch(/token=[^;]+/);
    expect(cookie).not.toMatch(/Domain=/i);
  });
});

describe("POST /api/auth/logout", () => {
  it("expires the cookie in the shared-domain AND host-only variants", async () => {
    const { POST } = await import("@/app/api/auth/logout/route");
    const res = await POST(new Request("https://club-1.yoursaas.test/api/auth/logout", { method: "POST" }));
    const cookies = res.headers.getSetCookie();

    expect(cookies.some((c) => c.includes("Domain=.club-1.yoursaas.test") && c.includes("Max-Age=0"))).toBe(true);
    expect(cookies.some((c) => !c.includes("Domain=") && c.includes("Max-Age=0"))).toBe(true);
  });
});
