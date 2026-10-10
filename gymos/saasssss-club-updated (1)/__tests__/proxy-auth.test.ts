import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { SignJWT } from "jose";

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 59, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}));
vi.mock("@/lib/logger", () => ({ log: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

const SECRET = "proxy-test-secret-with-at-least-32-chars";

async function token(role: string) {
  return new SignJWT({ id: "user-1", email: "user@example.test", role, name: "Test", clubId: "club-1" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(new TextEncoder().encode(SECRET));
}

async function runProxy(path: string, authorization?: string) {
  process.env.JWT_SECRET = SECRET;
  process.env.APP_URL = "https://yoursaas.test";
  vi.resetModules();
  const { proxy } = await import("@/proxy");
  return proxy(new NextRequest(`https://club-a.yoursaas.test${path}`, {
    headers: {
      host: "club-a.yoursaas.test",
      ...(authorization ? { authorization } : {}),
    },
  }));
}

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "production");
});
afterEach(() => vi.unstubAllEnvs());

describe("proxy protected API bearer authentication", () => {
  it("allows a valid MEMBER bearer token through to the dashboard handler", async () => {
    const response = await runProxy("/api/dashboard/notifications", `Bearer ${await token("MEMBER")}`);
    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("sets a nonce-based page CSP without unsafe-inline scripts", async () => {
    const response = await runProxy("/");
    const csp = response.headers.get("content-security-policy") ?? "";
    const scriptPolicy = csp.split(";").find((directive) => directive.trim().startsWith("script-src")) ?? "";
    expect(scriptPolicy).toContain("'nonce-");
    expect(scriptPolicy).not.toContain("'unsafe-inline'");
  });

  it("applies role gates to bearer-authenticated API requests", async () => {
    const response = await runProxy("/api/admin/members", `Bearer ${await token("MEMBER")}`);
    expect(response.status).toBe(403);
  });

  it("continues rejecting protected requests without either credential", async () => {
    const response = await runProxy("/api/dashboard/notifications");
    expect(response.status).toBe(401);
  });
});