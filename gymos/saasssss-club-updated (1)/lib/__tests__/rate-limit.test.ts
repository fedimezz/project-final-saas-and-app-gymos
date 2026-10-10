import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// checkRateLimit now delegates to @upstash/ratelimit + @upstash/redis. We
// don't want real network calls in unit tests, and we don't want to test
// Upstash's own sliding-window algorithm (that's their test suite's job) —
// just that our wrapper (lib/rate-limit.ts) wires keys/limits/windows
// through correctly and maps the result shape as expected. So we mock both
// packages with a minimal in-memory sliding-window fake.
vi.mock("@upstash/redis", () => ({
  Redis: { fromEnv: () => ({}) },
}));

vi.mock("@upstash/ratelimit", () => {
  const buckets = new Map<string, { count: number; resetAt: number }>();

  class MockRatelimit {
    // NB: named maxRequests/windowMs (not `limit`) so the instance field
    // doesn't shadow the `limit()` method of the same name.
    private maxRequests: number;
    private windowMs: number;

    constructor(opts: { limiter: { limit: number; windowMs: number } }) {
      this.maxRequests = opts.limiter.limit;
      this.windowMs = opts.limiter.windowMs;
    }

    async limit(key: string) {
      const now = Date.now();
      const existing = buckets.get(key);

      if (!existing || existing.resetAt < now) {
        buckets.set(key, { count: 1, resetAt: now + this.windowMs });
        return { success: true, remaining: this.maxRequests - 1, reset: now + this.windowMs };
      }
      if (existing.count >= this.maxRequests) {
        return { success: false, remaining: 0, reset: existing.resetAt };
      }
      existing.count += 1;
      return {
        success: true,
        remaining: this.maxRequests - existing.count,
        reset: existing.resetAt,
      };
    }

    static slidingWindow(limit: number, window: string) {
      return { limit, windowMs: parseInt(window, 10) };
    }
  }

  return { Ratelimit: MockRatelimit };
});

// The wrapper only talks to Upstash when credentials are configured (it falls
// back to in-memory otherwise — see rate-limit-fallback.test.ts), so give it
// dummy ones here to exercise the Upstash code path against the mocks above.
process.env.UPSTASH_REDIS_REST_URL = "https://mock.upstash.io";
process.env.UPSTASH_REDIS_REST_TOKEN = "mock-token";

const { checkRateLimit, getClientIp } = await import("../rate-limit");

describe("checkRateLimit", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows the first request under a fresh key", async () => {
    const key = `test:${Math.random()}`;
    const result = await checkRateLimit(key, 5, 60_000);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4);
  });

  it("decrements remaining on each call within the window", async () => {
    const key = `test:${Math.random()}`;
    await checkRateLimit(key, 3, 60_000);
    await checkRateLimit(key, 3, 60_000);
    const third = await checkRateLimit(key, 3, 60_000);
    expect(third.allowed).toBe(true);
    expect(third.remaining).toBe(0);
  });

  it("blocks once the limit is exceeded", async () => {
    const key = `test:${Math.random()}`;
    await checkRateLimit(key, 2, 60_000);
    await checkRateLimit(key, 2, 60_000);
    const third = await checkRateLimit(key, 2, 60_000);
    expect(third.allowed).toBe(false);
    expect(third.remaining).toBe(0);
  });

  it("resets the counter once the window has elapsed", async () => {
    const key = `test:${Math.random()}`;
    await checkRateLimit(key, 1, 1_000);
    const blocked = await checkRateLimit(key, 1, 1_000);
    expect(blocked.allowed).toBe(false);

    vi.advanceTimersByTime(1_001);

    const afterWindow = await checkRateLimit(key, 1, 1_000);
    expect(afterWindow.allowed).toBe(true);
  });

  it("tracks separate keys independently", async () => {
    const keyA = `test-a:${Math.random()}`;
    const keyB = `test-b:${Math.random()}`;
    await checkRateLimit(keyA, 1, 60_000);
    const blockedA = await checkRateLimit(keyA, 1, 60_000);
    const allowedB = await checkRateLimit(keyB, 1, 60_000);
    expect(blockedA.allowed).toBe(false);
    expect(allowedB.allowed).toBe(true);
  });
});

describe("getClientIp", () => {
  it("prefers the first entry of x-forwarded-for", () => {
    const request = new Request("https://example.com", {
      headers: { "x-forwarded-for": "203.0.113.5, 70.41.3.18, 150.172.238.178" },
    });
    expect(getClientIp(request)).toBe("203.0.113.5");
  });

  it("falls back to x-real-ip when x-forwarded-for is absent", () => {
    const request = new Request("https://example.com", {
      headers: { "x-real-ip": "203.0.113.9" },
    });
    expect(getClientIp(request)).toBe("203.0.113.9");
  });

  it("falls back to 'unknown' when neither header is present", () => {
    const request = new Request("https://example.com");
    expect(getClientIp(request)).toBe("unknown");
  });
});
