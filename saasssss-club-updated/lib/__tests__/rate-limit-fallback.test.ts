import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Covers the two situations that used to produce 500s / disable throttling:
//   1. No Upstash credentials (local dev, fresh install)
//   2. Upstash configured but the call throws (outage)

describe("checkRateLimit — no Redis configured", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("does not throw and enforces the limit in memory", async () => {
    const { checkRateLimit } = await import("../rate-limit");
    const r1 = await checkRateLimit("login:1.1.1.1", 2, 60_000);
    const r2 = await checkRateLimit("login:1.1.1.1", 2, 60_000);
    const r3 = await checkRateLimit("login:1.1.1.1", 2, 60_000);
    expect([r1.allowed, r2.allowed, r3.allowed]).toEqual([true, true, false]);
  });

  it("resets after the window and isolates keys", async () => {
    const { checkRateLimit } = await import("../rate-limit");
    await checkRateLimit("a", 1, 1_000);
    expect((await checkRateLimit("a", 1, 1_000)).allowed).toBe(false);
    expect((await checkRateLimit("b", 1, 1_000)).allowed).toBe(true);
    vi.advanceTimersByTime(1_001);
    expect((await checkRateLimit("a", 1, 1_000)).allowed).toBe(true);
  });

  it("fails closed in production when Redis is not configured", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { checkRateLimit } = await import("../rate-limit");
    expect((await checkRateLimit("login:1.1.1.1", 2, 60_000)).allowed).toBe(false);
  });
});

describe("checkRateLimit — Upstash outage", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.UPSTASH_REDIS_REST_URL = "https://mock.upstash.io";
    process.env.UPSTASH_REDIS_REST_TOKEN = "mock-token";
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.doUnmock("@upstash/ratelimit");
    vi.doUnmock("@upstash/redis");
  });

  it("falls back to in-memory instead of throwing or failing open", async () => {
    vi.doMock("@upstash/redis", () => ({ Redis: { fromEnv: () => ({}) } }));
    vi.doMock("@upstash/ratelimit", () => {
      class Broken {
        async limit() {
          throw new Error("network down");
        }
        static slidingWindow() {
          return {};
        }
      }
      return { Ratelimit: Broken };
    });
    const { checkRateLimit } = await import("../rate-limit");
    const a = await checkRateLimit("k", 1, 60_000);
    const b = await checkRateLimit("k", 1, 60_000);
    expect(a.allowed).toBe(true);
    expect(b.allowed).toBe(false);
  });

  it("fails closed on Redis outage in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.doMock("@upstash/redis", () => ({ Redis: { fromEnv: () => ({}) } }));
    vi.doMock("@upstash/ratelimit", () => {
      class Broken {
        async limit() { throw new Error("network down"); }
        static slidingWindow() { return {}; }
      }
      return { Ratelimit: Broken };
    });
    const { checkRateLimit } = await import("../rate-limit");
    expect((await checkRateLimit("k", 1, 60_000)).allowed).toBe(false);
  });
});
