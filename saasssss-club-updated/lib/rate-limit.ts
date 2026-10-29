// lib/rate-limit.ts
//
// Distributed rate limiter backed by Upstash Redis (@upstash/ratelimit), with
// a per-process in-memory fallback.
//
// Why the fallback exists:
//   - Local dev / fresh installs have no Upstash credentials. Previously
//     `Redis.fromEnv()` succeeded silently but every `limiter.limit()` call
//     then threw, so /api/auth/login, register, onboarding… all returned 500.
//   - A Redis outage in production shouldn't disable throttling entirely
//     (the proxy's write limiter used to "fail open" on any error). The
//     in-memory limiter is per-instance, so it is weaker than Redis, but it
//     still blocks brute force from a single source hitting one instance.
//
// Production should always set UPSTASH_REDIS_REST_URL / _TOKEN.

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

const REDIS_CONFIGURED = Boolean(
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
);

const redis = REDIS_CONFIGURED ? Redis.fromEnv() : null;

let warnedNoRedis = false;
function warnOnce(message: string) {
  if (warnedNoRedis) return;
  warnedNoRedis = true;
  const level = process.env.NODE_ENV === "production" ? "error" : "warn";
  console[level](`[rate-limit] ${message}`);
}

// ── Upstash path ────────────────────────────────────────────────────────────
// One Ratelimit instance per distinct (limit, windowMs) pair, cached so we
// don't recreate the sliding-window algorithm object on every call.
const limiters = new Map<string, Ratelimit>();

function getLimiter(limit: number, windowMs: number): Ratelimit {
  const cacheKey = `${limit}:${windowMs}`;
  let limiter = limiters.get(cacheKey);
  if (!limiter) {
    limiter = new Ratelimit({
      redis: redis!,
      limiter: Ratelimit.slidingWindow(limit, `${windowMs} ms`),
      // Keys are already namespaced by the caller (e.g. `login:${ip}`);
      // this prefix just avoids collisions with any other Redis usage.
      prefix: "ratelimit",
    });
    limiters.set(cacheKey, limiter);
  }
  return limiter;
}

// ── In-memory fallback (fixed window, per process) ──────────────────────────
const buckets = new Map<string, { count: number; resetAt: number }>();
const MAX_BUCKETS = 10_000;

function checkInMemory(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();

  // Opportunistic cleanup so the Map can't grow without bound.
  if (buckets.size > MAX_BUCKETS) {
    for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
    if (buckets.size > MAX_BUCKETS) buckets.clear();
  }

  const bucketKey = `${limit}:${windowMs}:${key}`;
  const existing = buckets.get(bucketKey);

  if (!existing || existing.resetAt <= now) {
    buckets.set(bucketKey, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, resetAt: now + windowMs };
  }
  if (existing.count >= limit) {
    return { allowed: false, remaining: 0, resetAt: existing.resetAt };
  }
  existing.count += 1;
  return { allowed: true, remaining: limit - existing.count, resetAt: existing.resetAt };
}

/**
 * @param key unique identifier for the caller, e.g. `login:${ip}` or `login:${email}`
 * @param limit max requests allowed within the window
 * @param windowMs window size in milliseconds
 */
export async function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number
): Promise<RateLimitResult> {
  if (!REDIS_CONFIGURED) {
    warnOnce(
      "UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN not set — using per-process in-memory rate limiting."
    );
    if (process.env.NODE_ENV === "production") {
      return { allowed: false, remaining: 0, resetAt: Date.now() + windowMs };
    }
    return checkInMemory(key, limit, windowMs);
  }

  try {
    const result = await getLimiter(limit, windowMs).limit(key);
    return {
      allowed: result.success,
      remaining: result.remaining,
      resetAt: result.reset,
    };
  } catch (err) {
    console.error("[rate-limit] Upstash call failed — falling back to in-memory:", (err as Error).message);
    if (process.env.NODE_ENV === "production") {
      return { allowed: false, remaining: 0, resetAt: Date.now() + windowMs };
    }
    return checkInMemory(key, limit, windowMs);
  }
}

/**
 * Best-effort client IP extraction behind common proxies (Vercel, nginx).
 * On Vercel, x-forwarded-for's first entry is set by the platform edge and is
 * not client-spoofable; behind other proxies make sure the proxy overwrites it.
 */
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}
