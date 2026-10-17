/**
 * Google OAuth crosses a domain boundary: the flow starts on a club's own
 * subdomain but Google's fixed redirect_uri always lands on the apex. These
 * tests prove the club survives that round trip (signed `state`, no cookie has
 * to cross hosts) and that the session is issued ON THE CLUB'S OWN HOST by
 * /api/auth/bridge — a response from the apex can't set a cookie for a club
 * subdomain, which is what used to send members back to "localhost".
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

const CLUB = { id: "club-abc", slug: "club-a", name: "Club A", status: "ACTIVE" as const };

const clubFindUnique = vi.fn();
const userFindFirst = vi.fn();
const userFindUnique = vi.fn();
const userUpdate = vi.fn();
vi.mock("@/lib/one-time", () => ({ consumeOnce: vi.fn().mockResolvedValue(true) }));
vi.mock("@/lib/prisma", () => ({
  default: {
    club: { findUnique: (...a: unknown[]) => clubFindUnique(...a) },
    user: {
      findFirst: (...a: unknown[]) => userFindFirst(...a),
      findUnique: (...a: unknown[]) => userFindUnique(...a),
      update: (...a: unknown[]) => userUpdate(...a),
    },
    $transaction: vi.fn(),
  },
}));

const originalFetch = global.fetch;
beforeEach(() => {
  vi.clearAllMocks();
  process.env.JWT_SECRET = "test-secret-minimum-32-chars-xxxxxxxxx";
  process.env.GOOGLE_CLIENT_ID = "gid";
  process.env.GOOGLE_CLIENT_SECRET = "gsecret";
  process.env.APP_URL = "https://yoursaas.test";
  process.env.NEXT_PUBLIC_APP_URL = "https://yoursaas.test";
  clubFindUnique.mockResolvedValue(CLUB);
  global.fetch = vi.fn(async (url: string | URL) => {
    const u = String(url);
    if (u.includes("oauth2.googleapis.com/token")) {
      return new Response(JSON.stringify({ access_token: "tok" }), { status: 200 });
    }
    if (u.includes("googleapis.com/oauth2/v3/userinfo")) {
      return new Response(
        JSON.stringify({ sub: "g-1", email: "m@club-a.test", email_verified: true, name: "M" }),
        { status: 200 }
      );
    }
    throw new Error("unexpected fetch " + u);
  }) as typeof fetch;
});
afterEach(() => {
  global.fetch = originalFetch;
  vi.unstubAllEnvs();
});

const MEMBER = {
  id: "u1", email: "m@club-a.test", role: "MEMBER", clubId: CLUB.id, isActive: true,
  googleId: "g-1", emailVerified: new Date(), name: "M",
};

async function startFlow(host = "club-a.yoursaas.test") {
  const { GET } = await import("@/app/api/auth/google/route");
  const res = await GET(new NextRequest(`https://${host}/api/auth/google`, { headers: { host } }));
  const state = new URL(res.headers.get("location")!).searchParams.get("state")!;
  const nonceCookie = res.headers.getSetCookie().find((c) => c.startsWith("bridge_nonce="))!;
  const nonce = nonceCookie.split(";")[0].slice("bridge_nonce=".length);
  return { res, state, nonceCookie, nonce };
}

describe("GET /api/auth/google (initiation)", () => {
  it("puts the club id + a nonce hash in a SIGNED state, and the raw nonce in a host-only cookie", async () => {
    const { verifyGoogleState } = await import("@/lib/oauth-state");
    const { hashBridgeNonce } = await import("@/lib/auth");
    const { state, nonceCookie, nonce } = await startFlow();

    const verified = verifyGoogleState(state);
    expect(verified?.clubId).toBe(CLUB.id);
    expect(verified?.nonceHash).toBe(hashBridgeNonce(nonce));
    // host-only: no Domain attribute, so it is only ever sent back to the club host
    expect(nonceCookie).not.toContain("Domain=");
    expect(nonceCookie).toContain("HttpOnly");
  });

  it("404s on a host with no club (e.g. the apex itself)", async () => {
    clubFindUnique.mockResolvedValue(null);
    const { GET } = await import("@/app/api/auth/google/route");
    const res = await GET(new NextRequest("https://yoursaas.test/api/auth/google", { headers: { host: "yoursaas.test" } }));
    expect(res.status).toBe(404);
  });
});

describe("GET /api/auth/callback/google", () => {
  function callbackReq(state: string, host = "yoursaas.test", proto = "https") {
    return new NextRequest(
      `${proto}://${host}/api/auth/callback/google?code=abc&state=${encodeURIComponent(state)}`,
      { headers: { host } }
    );
  }
  async function call(req: NextRequest) {
    const { GET } = await import("@/app/api/auth/callback/google/route");
    return GET(req);
  }
  const location = (r: Response) => r.headers.get("location") ?? "";

  it("resolves the tenant from the signed state and hands off to the CLUB host's bridge (no cookie on the apex)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    userFindFirst.mockResolvedValue(MEMBER);
    const { state } = await startFlow();
    const res = await call(callbackReq(state));

    expect(clubFindUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: CLUB.id } }));
    const loc = new URL(location(res));
    expect(loc.origin).toBe("https://club-a.yoursaas.test");
    expect(loc.pathname).toBe("/api/auth/bridge");
    expect(loc.searchParams.get("redirect")).toBe("/auth/sync?next=%2Fdashboard");
    // The apex must NOT try to set the session cookie for the club host.
    expect(res.headers.getSetCookie().find((c) => c.startsWith("token="))).toBeUndefined();

    const { verifyBridgeToken } = await import("@/lib/auth");
    const bridge = verifyBridgeToken(loc.searchParams.get("token")!);
    expect(bridge).toMatchObject({ id: MEMBER.id, clubId: CLUB.id, via: "google" });
  });

  it("local dev: Google lands on http://localhost:3000, the member is sent to http://{slug}.localhost:3000", async () => {
    vi.stubEnv("NODE_ENV", "development");
    userFindFirst.mockResolvedValue(MEMBER);
    const { state } = await startFlow();
    const res = await call(callbackReq(state, "localhost:3000", "http"));
    expect(new URL(location(res)).origin).toBe("http://club-a.localhost:3000");
  });

  it("rejects a forged / tampered state", async () => {
    const { state } = await startFlow();
    const res = await call(callbackReq(state.slice(0, -3) + "AAA"));
    expect(location(res)).toContain("google_state_mismatch");
    expect(location(res)).not.toContain("/api/auth/bridge");
  });

  it("a club that no longer exists / isn't usable: sent to the apex login (nowhere else to send them)", async () => {
    const { createGoogleState } = await import("@/lib/oauth-state");
    clubFindUnique.mockResolvedValue(null);
    const state = createGoogleState({ clubId: "club-does-not-exist", nonceHash: "x" });
    const res = await call(callbackReq(state));
    expect(location(res)).toBe("https://yoursaas.test/user/login?error=club_unavailable");
  });

  it("user declined on Google: back to THEIR club's login, not the apex", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { state } = await startFlow();
    const req = new NextRequest(
      `https://yoursaas.test/api/auth/callback/google?error=access_denied&state=${encodeURIComponent(state)}`,
      { headers: { host: "yoursaas.test" } }
    );
    const res = await call(req);
    expect(location(res)).toBe("https://club-a.yoursaas.test/user/login?error=google_denied");
  });
});

describe("full round trip: initiation -> callback (apex) -> bridge (club host)", () => {
  it("issues the session cookie on the club host and lands on /auth/sync", async () => {
    vi.stubEnv("NODE_ENV", "production");
    userFindFirst.mockResolvedValue(MEMBER);
    userFindUnique.mockResolvedValue(MEMBER);

    const { state, nonce } = await startFlow();
    const { GET: callback } = await import("@/app/api/auth/callback/google/route");
    const cb = await callback(
      new NextRequest(`https://yoursaas.test/api/auth/callback/google?code=abc&state=${encodeURIComponent(state)}`, {
        headers: { host: "yoursaas.test" },
      })
    );

    const bridgeUrl = new URL(cb.headers.get("location")!);
    const { GET: bridge } = await import("@/app/api/auth/bridge/route");
    const ok = await bridge(
      new NextRequest(bridgeUrl, { headers: { host: bridgeUrl.host, cookie: `bridge_nonce=${nonce}` } })
    );
    expect(new URL(ok.headers.get("location")!).pathname).toBe("/auth/sync");
    const session = ok.headers.getSetCookie().find((c) => c.startsWith("token="));
    expect(session).toContain("Domain=.club-a.yoursaas.test");

    // Another browser (no nonce cookie) can't redeem the link: login-CSRF blocked.
    const { state: s2 } = await startFlow();
    const cb2 = await callback(
      new NextRequest(`https://yoursaas.test/api/auth/callback/google?code=abc&state=${encodeURIComponent(s2)}`, {
        headers: { host: "yoursaas.test" },
      })
    );
    const url2 = new URL(cb2.headers.get("location")!);
    const blocked = await bridge(new NextRequest(url2, { headers: { host: url2.host } }));
    expect(new URL(blocked.headers.get("location")!).pathname).toBe("/user/login");
    expect(blocked.headers.getSetCookie().find((c) => c.startsWith("token="))).toBeUndefined();
  });
});
