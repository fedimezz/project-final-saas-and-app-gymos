/**
 * Logout must ALWAYS expire the session cookie (even when auditing fails),
 * and must tell the client where to go based on the VERIFIED role only.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const requireUser = vi.fn();
const logAction = vi.fn();
vi.mock("@/lib/auth", () => ({ requireUser: (...a: unknown[]) => requireUser(...a) }));
vi.mock("@/lib/activity-log", () => ({ logAction: (...a: unknown[]) => logAction(...a) }));

import { POST } from "../auth/logout/route";

const req = (url = "http://localhost:3000/api/auth/logout") => new Request(url, { method: "POST" });

beforeEach(() => {
  vi.clearAllMocks();
  logAction.mockResolvedValue(undefined);
});

describe("POST /api/auth/logout", () => {
  it("expires the cookie and sends a member to the public home", async () => {
    requireUser.mockResolvedValue({ ok: true, user: { id: "u1", name: "A", role: "MEMBER", clubId: "c1" } });
    const res = await POST(req());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.redirectTo).toBe("/");
    const cookies = res.headers.getSetCookie();
    expect(cookies.length).toBeGreaterThan(0);
    expect(cookies.every((c) => c.startsWith("token=;") && c.includes("Max-Age=0"))).toBe(true);
    expect(res.headers.get("cache-control")).toContain("no-store");
    expect(logAction).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ clubId: "c1", action: "USER_LOGOUT" }));
  });

  it("sends SUPER_ADMIN back to the platform login", async () => {
    requireUser.mockResolvedValue({ ok: true, user: { id: "s1", name: "S", role: "SUPER_ADMIN", clubId: null } });
    const body = await (await POST(req())).json();
    expect(body.redirectTo).toBe("/platform/login");
  });

  it("still clears the cookie when there is no / an invalid session", async () => {
    requireUser.mockResolvedValue({ ok: false });
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect((await res.json()).redirectTo).toBe("/");
    expect(res.headers.getSetCookie().some((c) => c.includes("Max-Age=0"))).toBe(true);
    expect(logAction).not.toHaveBeenCalled();
  });

  it("still clears the cookie when the audit log or the auth lookup throws", async () => {
    requireUser.mockResolvedValue({ ok: true, user: { id: "u1", name: "A", role: "ADMIN", clubId: "c1" } });
    logAction.mockRejectedValue(new Error("db down"));
    let res = await POST(req());
    expect(res.status).toBe(200);
    expect(res.headers.getSetCookie().some((c) => c.includes("Max-Age=0"))).toBe(true);

    requireUser.mockRejectedValue(new Error("db down"));
    res = await POST(req());
    expect(res.status).toBe(200);
    expect(res.headers.getSetCookie().some((c) => c.includes("Max-Age=0"))).toBe(true);
  });

  it("expires both the shared-domain and host-only cookie on a club host in production", async () => {
    requireUser.mockResolvedValue({ ok: false });
    const res = await POST(req("https://club-a.yoursaas.test/api/auth/logout"));
    const cookies = res.headers.getSetCookie();
    expect(cookies.some((c) => c.includes("Domain=.club-a.yoursaas.test"))).toBe(true);
    expect(cookies.some((c) => !c.includes("Domain="))).toBe(true);
  });
});
