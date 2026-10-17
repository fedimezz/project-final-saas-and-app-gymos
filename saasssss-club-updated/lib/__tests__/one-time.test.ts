import { afterEach, describe, expect, it, vi } from "vitest";

async function loadLocalConsumer() {
  vi.resetModules();
  vi.stubEnv("NODE_ENV", "development");
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  return import("../one-time");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("consumeOnce without configured Redis", () => {
  it("allows local in-memory single-use tokens in development", async () => {
    const { consumeOnce } = await loadLocalConsumer();
    expect(await consumeOnce("dev-token", 60)).toBe(true);
    expect(await consumeOnce("dev-token", 60)).toBe(false);
  });

  it("returns true only for the first caller", async () => {
    const { consumeOnce } = await loadLocalConsumer();
    expect(await consumeOnce("k-1", 60)).toBe(true);
    expect(await consumeOnce("k-1", 60)).toBe(false);
    expect(await consumeOnce("k-1", 60)).toBe(false);
  });

  it("keeps keys independent", async () => {
    const { consumeOnce } = await loadLocalConsumer();
    expect(await consumeOnce("k-a", 60)).toBe(true);
    expect(await consumeOnce("k-b", 60)).toBe(true);
  });

  it("allows exactly one concurrent caller", async () => {
    const { consumeOnce } = await loadLocalConsumer();
    const results = await Promise.all(Array.from({ length: 20 }, () => consumeOnce("k-race", 60)));
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it("refuses single-use token consumption in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    vi.resetModules();
    const { consumeOnce } = await import("../one-time");
    expect(await consumeOnce("prod-token", 60)).toBe(false);
  });
});
