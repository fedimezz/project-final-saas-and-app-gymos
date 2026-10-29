import { describe, it, expect, afterEach, vi } from "vitest";
import { buildAuthCookieOptions, clearAuthCookie, setAuthCookie, AUTH_COOKIE_NAME } from "../auth-cookie";
import { NextResponse } from "next/server";

afterEach(() => vi.unstubAllEnvs());

describe("buildAuthCookieOptions", () => {
  it("shares the cookie across subdomains in production (Domain=.host)", () => {
    const o = buildAuthCookieOptions("https://yoursaas.test/api/auth/login");
    expect(o.domain).toBe(".yoursaas.test");
    expect(o.secure).toBe(true);
  });

  it("hostOnly drops the Domain attribute (SUPER_ADMIN sessions)", () => {
    const o = buildAuthCookieOptions("https://yoursaas.test/api/auth/login", { hostOnly: true });
    expect(o.domain).toBeUndefined();
  });

  it("hostOnly wins even when COOKIE_DOMAIN is configured", () => {
    vi.stubEnv("COOKIE_DOMAIN", ".yoursaas.test");
    expect(buildAuthCookieOptions("https://yoursaas.test/x", { hostOnly: true }).domain).toBeUndefined();
    expect(buildAuthCookieOptions("https://yoursaas.test/x").domain).toBe(".yoursaas.test");
  });

  it("never sets a Domain on localhost / IPs, and is not Secure over http", () => {
    const o = buildAuthCookieOptions("http://localhost:3000/api/auth/login");
    expect(o.domain).toBeUndefined();
    expect(o.secure).toBe(false);
    expect(buildAuthCookieOptions("http://127.0.0.1:3000/x").domain).toBeUndefined();
  });
});

describe("clearAuthCookie", () => {
  it("expires BOTH the shared-domain cookie and the host-only cookie", () => {
    const res = NextResponse.json({});
    clearAuthCookie(res, "https://yoursaas.test/api/auth/logout");
    const cookies = res.headers.getSetCookie();

    expect(cookies).toHaveLength(2);
    expect(cookies.every((c) => c.startsWith(`${AUTH_COOKIE_NAME}=;`) && c.includes("Max-Age=0"))).toBe(true);
    expect(cookies.some((c) => c.includes("Domain=.yoursaas.test"))).toBe(true);
    expect(cookies.some((c) => !c.includes("Domain="))).toBe(true);
    expect(cookies.every((c) => c.includes("HttpOnly") && c.includes("Secure"))).toBe(true);
  });

  it("on localhost only one (host-only) header is needed", () => {
    const res = NextResponse.json({});
    clearAuthCookie(res, "http://localhost:3000/api/auth/logout");
    const cookies = res.headers.getSetCookie();
    expect(cookies).toHaveLength(1);
    expect(cookies[0]).not.toContain("Domain=");
    expect(cookies[0]).not.toContain("Secure");
  });

  it("logout's Domain matches what login sets (the original bug)", () => {
    const url = "https://yoursaas.test/api/auth/x";
    const login = NextResponse.json({});
    setAuthCookie(login, "jwt", url, { maxAgeSeconds: 60 });
    const logout = NextResponse.json({});
    clearAuthCookie(logout, url);

    const loginDomain = login.headers.get("set-cookie")!.match(/Domain=([^;]+)/i)?.[1];
    expect(loginDomain).toBeTruthy();
    expect(logout.headers.getSetCookie().some((c) => c.includes(`Domain=${loginDomain}`))).toBe(true);
  });
});
