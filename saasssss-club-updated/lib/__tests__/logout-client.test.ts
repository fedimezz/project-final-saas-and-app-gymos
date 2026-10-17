/**
 * The client half of logout, as an ordered sequence: the UI is emptied first,
 * the server cookie clear is AWAITED (retry once, verify) BEFORE navigating,
 * every account/club cache is wiped, preferences survive, and the destination
 * can never be an external URL.
 */
import { describe, it, expect, vi } from "vitest";
import { performLogout, safeInternalPath, clearClientState, type StorageLike } from "../logout-client";

function store(initial: Record<string, string> = {}): StorageLike & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    removeItem: (k) => { delete data[k]; },
    clear: () => { for (const k of Object.keys(data)) delete data[k]; },
    keys: () => Object.keys(data),
  };
}
const ok = (body: unknown = { redirectTo: "/" }) => ({ ok: true, json: async () => body });

function setup(overrides: Partial<Parameters<typeof performLogout>[0]> = {}) {
  const events: string[] = [];
  const local = store({ token: "t", role: "ADMIN", user: "{}", userName: "A", theme: "dark", lang: "fr", "gymos:setup-checklist-dismissed": "1", "club:abc:cache": "x", unrelated: "keep" });
  const session = store({ s: "1" });
  const deps = {
    postLogout: vi.fn(async () => { events.push("post"); return ok(); }),
    sessionStillActive: vi.fn(async () => { events.push("verify"); return false; }),
    local, session,
    onCleared: vi.fn(() => events.push("cleared")),
    navigate: vi.fn((p: string) => events.push(`navigate:${p}`)),
    ...overrides,
  };
  return { deps, events, local, session };
}

describe("performLogout", () => {
  it("empties the UI first, waits for the server, verifies, then navigates", async () => {
    const { deps, events } = setup();
    await performLogout(deps, { previousRole: "ADMIN" });
    expect(events).toEqual(["cleared", "post", "verify", "navigate:/"]);
  });

  it("wipes auth + tenant caches and sessionStorage but keeps theme/lang and unrelated keys", async () => {
    const { deps, local, session } = setup();
    await performLogout(deps, {});
    expect(Object.keys(local.data).sort()).toEqual(["lang", "theme", "unrelated"]);
    expect(Object.keys(session.data)).toEqual([]);
  });

  it("retries once when the first request fails, and navigates anyway if both fail", async () => {
    const failing = setup({ postLogout: vi.fn(async () => null) });
    await performLogout(failing.deps, { previousRole: "MEMBER" });
    expect(failing.deps.postLogout).toHaveBeenCalledTimes(2);
    expect(failing.deps.navigate).toHaveBeenCalledWith("/");
    expect(failing.deps.sessionStillActive).not.toHaveBeenCalled();

    const flaky = setup({ postLogout: vi.fn().mockResolvedValueOnce({ ok: false, json: async () => ({}) }).mockResolvedValue(ok()) });
    await performLogout(flaky.deps, {});
    expect(flaky.deps.postLogout).toHaveBeenCalledTimes(2);
  });

  it("calls the server again if the session is still active after logout", async () => {
    const { deps } = setup({ sessionStillActive: vi.fn(async () => true) });
    await performLogout(deps, {});
    expect(deps.postLogout).toHaveBeenCalledTimes(2);
  });

  it("sends platform staff to the platform login, honouring the server's answer", async () => {
    const a = setup({ postLogout: vi.fn(async () => null) });
    expect(await performLogout(a.deps, { previousRole: "SUPER_ADMIN" })).toBe("/platform/login");
    const b = setup({ postLogout: vi.fn(async () => ok({ redirectTo: "/platform/login" })) });
    expect(await performLogout(b.deps, { previousRole: "MEMBER" })).toBe("/platform/login");
  });

  it("an explicit same-origin redirect wins; external/protocol-relative ones are refused", async () => {
    const a = setup();
    expect(await performLogout(a.deps, { redirectTo: "/user/login" })).toBe("/user/login");
    const b = setup({ postLogout: vi.fn(async () => ok({ redirectTo: "https://evil.example" })) });
    expect(await performLogout(b.deps, {})).toBe("/");
    expect(safeInternalPath("//evil.example", "/")).toBe("/");
    expect(safeInternalPath("/\\evil.example", "/")).toBe("/");
    expect(safeInternalPath("javascript:alert(1)", "/")).toBe("/");
    expect(safeInternalPath(undefined, "/x")).toBe("/x");
  });

  it("never throws when storage is unavailable", () => {
    const broken: StorageLike = { removeItem: () => { throw new Error("denied"); }, clear: () => { throw new Error("denied"); }, keys: () => { throw new Error("denied"); } };
    expect(() => clearClientState(broken, broken)).not.toThrow();
  });
});
