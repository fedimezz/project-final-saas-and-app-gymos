import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchPublicJson, clearPublicFetchCache } from "../public-fetch";

const ok = (body: unknown) => Promise.resolve({ ok: true, status: 200, json: async () => body } as Response);

beforeEach(() => {
  clearPublicFetchCache();
});
afterEach(() => vi.unstubAllGlobals());

describe("fetchPublicJson", () => {
  it("shares one request between simultaneous callers", async () => {
    const f = vi.fn(() => ok({ plans: [1] }));
    vi.stubGlobal("fetch", f);
    const [a, b, c] = await Promise.all([
      fetchPublicJson("/api/plans/public"),
      fetchPublicJson("/api/plans/public"),
      fetchPublicJson("/api/plans/public"),
    ]);
    expect(f).toHaveBeenCalledTimes(1);
    expect(a).toEqual({ plans: [1] });
    expect(b).toBe(a);
    expect(c).toBe(a);
  });

  it("remembers the answer briefly, and force bypasses it", async () => {
    const f = vi.fn(() => ok({ n: 1 }));
    vi.stubGlobal("fetch", f);
    await fetchPublicJson("/api/x");
    await fetchPublicJson("/api/x");
    expect(f).toHaveBeenCalledTimes(1);
    await fetchPublicJson("/api/x", { force: true });
    expect(f).toHaveBeenCalledTimes(2);
  });

  it("does not remember failures", async () => {
    const f = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) } as Response)
      .mockImplementationOnce(() => ok({ fine: true }));
    vi.stubGlobal("fetch", f);
    await expect(fetchPublicJson("/api/y")).rejects.toThrow("HTTP 500");
    await expect(fetchPublicJson("/api/y")).resolves.toEqual({ fine: true });
  });
});
