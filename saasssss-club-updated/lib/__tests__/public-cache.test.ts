import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cachedPublic, invalidatePublicCache, clearPublicCache } from "../public-cache";

beforeEach(() => {
  clearPublicCache();
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());

describe("cachedPublic", () => {
  it("serves repeated reads from memory (one query) while fresh", async () => {
    const loader = vi.fn().mockResolvedValue(["a"]);
    expect(await cachedPublic("club-1", "plans", loader)).toEqual(["a"]);
    expect(await cachedPublic("club-1", "plans", loader)).toEqual(["a"]);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("shares ONE query between concurrent misses", async () => {
    let resolve!: (v: string) => void;
    const loader = vi.fn(() => new Promise<string>((r) => { resolve = r; }));
    const p1 = cachedPublic("club-1", "coaches", loader);
    const p2 = cachedPublic("club-1", "coaches", loader);
    resolve("x");
    expect(await Promise.all([p1, p2])).toEqual(["x", "x"]);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("never mixes two clubs", async () => {
    const a = await cachedPublic("club-a", "plans", async () => "A");
    const b = await cachedPublic("club-b", "plans", async () => "B");
    expect([a, b]).toEqual(["A", "B"]);
  });

  it("serves the stale value instantly after the fresh window and refreshes behind the scenes", async () => {
    const loader = vi.fn().mockResolvedValueOnce("old").mockResolvedValueOnce("new");
    await cachedPublic("club-1", "plans", loader);
    vi.advanceTimersByTime(6_000); // past FRESH (5s), within STALE (60s)
    expect(await cachedPublic("club-1", "plans", loader)).toBe("old"); // instant
    await vi.advanceTimersByTimeAsync(0); // let the background refresh settle
    expect(loader).toHaveBeenCalledTimes(2);
    expect(await cachedPublic("club-1", "plans", loader)).toBe("new");
  });

  it("waits for a fresh load once the stale window is over", async () => {
    const loader = vi.fn().mockResolvedValueOnce("old").mockResolvedValueOnce("new");
    await cachedPublic("club-1", "plans", loader);
    vi.advanceTimersByTime(61_000);
    expect(await cachedPublic("club-1", "plans", loader)).toBe("new");
  });

  it("invalidatePublicCache drops only that club's entries", async () => {
    const la = vi.fn().mockResolvedValue("A1");
    const lb = vi.fn().mockResolvedValue("B1");
    await cachedPublic("club-a", "plans", la);
    await cachedPublic("club-b", "plans", lb);
    invalidatePublicCache("club-a");
    await cachedPublic("club-a", "plans", la);
    await cachedPublic("club-b", "plans", lb);
    expect(la).toHaveBeenCalledTimes(2);
    expect(lb).toHaveBeenCalledTimes(1);
  });

  it("does not cache a failed load", async () => {
    const loader = vi.fn().mockRejectedValueOnce(new Error("db down")).mockResolvedValueOnce("ok");
    await expect(cachedPublic("club-1", "plans", loader)).rejects.toThrow("db down");
    expect(await cachedPublic("club-1", "plans", loader)).toBe("ok");
  });
});
