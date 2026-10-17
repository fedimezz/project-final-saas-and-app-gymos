import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { Redis } from "@upstash/redis";
import { log } from "@/lib/logger";

export const runtime = "nodejs";
export const revalidate = 0;

export async function GET() {
  const start = Date.now();

  // ── DB ────────────────────────────────────────────────────────────────────
  let dbOk = false;
  let dbMs = 0;
  try {
    const t = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    dbMs = Date.now() - t;
    dbOk = true;
  } catch (err) {
    log.error("health_db_check_failed", { error: (err as Error).message });
  }

  // ── Redis ─────────────────────────────────────────────────────────────────
  let redisOk = false;
  let redisMs = 0;
  try {
    if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
      const redis = Redis.fromEnv();
      const t = Date.now();
      await redis.ping();
      redisMs = Date.now() - t;
      redisOk = true;
    } else {
      // Redis is optional for local development but required by production.
      redisOk = process.env.NODE_ENV !== "production";
    }
  } catch (err) {
    log.error("health_redis_check_failed", { error: (err as Error).message });
  }

  const allOk = dbOk && redisOk;

  log.info("health_check", { ok: allOk, dbMs, redisMs, totalMs: Date.now() - start });

  return NextResponse.json(
    {
      status:    allOk ? "ok" : "degraded",
      checks: {
        db:    { ok: dbOk,    latencyMs: dbMs },
        redis: { ok: redisOk, latencyMs: redisMs },
      },
      totalMs:   Date.now() - start,
      timestamp: new Date().toISOString(),
    },
    {
      status:  allOk ? 200 : 503,
      headers: { "Cache-Control": "no-store, max-age=0" },
    }
  );
}
