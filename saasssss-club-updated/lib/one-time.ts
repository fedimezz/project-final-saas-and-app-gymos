// lib/one-time.ts — "use this value at most once" primitive.
//
// consumeOnce(key, ttl) resolves true for the FIRST caller and false for every
// later caller within the TTL. Backed by Upstash Redis (`SET NX EX`) so it is
// atomic across serverless instances; falls back to a per-process Map when
// Redis isn't configured (dev / tests), which is weaker but never wrong for a
// single process.
//
// Fails CLOSED: if Redis is configured but errors, nobody gets to consume.
import { Redis } from "@upstash/redis";

const REDIS_CONFIGURED = Boolean(
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
);
const redis = REDIS_CONFIGURED ? Redis.fromEnv() : null;

const memory = new Map<string, number>();
const MAX_MEMORY_KEYS = 5_000;

export async function consumeOnce(key: string, ttlSeconds: number): Promise<boolean> {
  if (redis) {
    try {
      const result = await redis.set(`once:${key}`, "1", { nx: true, ex: ttlSeconds });
      return result === "OK";
    } catch (err) {
      console.error("[one-time] Redis error, refusing:", err instanceof Error ? err.message : err);
      return false;
    }
  }

  if (process.env.NODE_ENV === "production") {
    console.error("[one-time] Upstash is required in production; refusing single-use token consumption.");
    return false;
  }

  const now = Date.now();
  if (memory.size > MAX_MEMORY_KEYS) {
    for (const [k, exp] of memory) if (exp <= now) memory.delete(k);
    if (memory.size > MAX_MEMORY_KEYS) memory.clear();
  }
  const existing = memory.get(key);
  if (existing && existing > now) return false;
  memory.set(key, now + ttlSeconds * 1000);
  return true;
}
