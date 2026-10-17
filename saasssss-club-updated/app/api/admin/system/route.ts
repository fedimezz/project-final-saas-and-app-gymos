/**
 * /api/admin/system
 *
 * GET  → health-check: DB ping, counts, env status
 * POST → actions: { action: "ping_db" | "recount_bookings" | "clear_old_notifications" | "expire_subscriptions" }
 */
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireOwner } from "@/lib/auth";
import { logAction } from "@/lib/activity-log";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireOwner(request);
    if (!auth.ok) return NextResponse.json({ error: "Accès réservé au propriétaire" }, { status: auth.status });

    const start = Date.now();

    // DB ping
    let dbOk = false;
    let dbMs = 0;
    try {
      await prisma.$queryRaw`SELECT 1`;
      dbMs = Date.now() - start;
      dbOk = true;
    } catch {
      dbMs = Date.now() - start;
    }

    // Quick counts — scoped to this gym only. This route is requireOwner
    // (gym-level), not requireSuperAdmin (platform-level), so it must never
    // surface other gyms' numbers. A true platform-wide health view is a
    // SUPER_ADMIN-only /platform/system route, not built yet.
    const clubId = auth.user.clubId as string;
    const [
      userCount, sessionCount, bookingCount, logCount,
      staleBookings, orphanedBookings,
    ] = await Promise.all([
      prisma.user.count({ where: { clubId } }),
      prisma.session.count({ where: { clubId } }),
      prisma.userSession.count({ where: { clubId, isCancelled: false } }),
      prisma.activityLog.count({ where: { clubId } }),
      // Sessions where currentBookings doesn't match real count
      prisma.$queryRaw<{ id: string; coach: string; diff: number }[]>`
        SELECT s.id, s.coach,
               s."currentBookings" - COUNT(us.id)::int AS diff
        FROM sessions s
        LEFT JOIN user_sessions us
          ON us."sessionId" = s.id AND us."isCancelled" = false
        WHERE s."clubId" = ${clubId}
        GROUP BY s.id, s.coach, s."currentBookings"
        HAVING s."currentBookings" != COUNT(us.id)::int
        LIMIT 20
      `,
      // Bookings whose session no longer exists. `sessionId` is a required
      // relation with onDelete: Cascade, so under normal operation this
      // should always be 0 — but the previous version of this query used
      // `session: { is: undefined } }`, which Prisma silently drops from the
      // filter (an `undefined` value means "no constraint here"), so it was
      // actually counting *every* active booking as "orphaned". A raw LEFT
      // JOIN is the reliable way to detect a genuinely missing session.
      prisma.$queryRaw<{ count: bigint | number }[]>`
        SELECT COUNT(*)::bigint AS count
        FROM user_sessions us
        LEFT JOIN sessions s ON s.id = us."sessionId"
        WHERE us."isCancelled" = false AND us."clubId" = ${clubId} AND s.id IS NULL
      `,
    ]).catch(() => [0, 0, 0, 0, [], [{ count: 0 }]]);

    const orphanedCount = Array.isArray(orphanedBookings) && orphanedBookings[0]
      ? Number(orphanedBookings[0].count)
      : 0;

    const envChecks = {
      DATABASE_URL: !!process.env.DATABASE_URL,
      JWT_SECRET: !!process.env.JWT_SECRET,
      NEXTAUTH_URL: !!process.env.NEXTAUTH_URL || !!process.env.NEXT_PUBLIC_APP_URL,
      CLOUDINARY_CLOUD_NAME: !!process.env.CLOUDINARY_CLOUD_NAME,
      UPSTASH_REDIS: !!process.env.UPSTASH_REDIS_REST_URL,
      GOOGLE_OAUTH: !!process.env.GOOGLE_CLIENT_ID,
    };

    return NextResponse.json({
      db: { ok: dbOk, latencyMs: dbMs },
      counts: { userCount, sessionCount, bookingCount, logCount },
      issues: {
        staleBookingCounts: Array.isArray(staleBookings) ? staleBookings : [],
        orphanedBookings: orphanedCount,
      },
      env: envChecks,
      serverTime: new Date().toISOString(),
    });
  } catch (error) {
    console.error("System health GET error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireOwner(request);
    if (!auth.ok) return NextResponse.json({ error: "Accès réservé au propriétaire" }, { status: auth.status });

    const body = await request.json().catch(() => ({}));
    const { action } = body as { action: string };
    const clubId = auth.user.clubId as string;

    switch (action) {
      case "ping_db": {
        const t = Date.now();
        await prisma.$queryRaw`SELECT 1`;
        return NextResponse.json({ ok: true, latencyMs: Date.now() - t });
      }

      case "recount_bookings": {
        // Fix currentBookings counters that have drifted from reality.
        // Previously this ran one COUNT + one UPDATE per session in a JS
        // loop (2N queries for N sessions) — fine at a handful of sessions,
        // but it doesn't scale. This does the same fix as a single
        // set-based UPDATE ... FROM, so it's one round-trip regardless of
        // how many sessions exist, and returns exactly the rows it changed
        // (sessions whose stored count didn't match reality already).
        // Scoped to this club — a recount triggered by one gym's owner
        // must never touch another gym's session rows.
        const fixedRows = await prisma.$queryRaw<{ id: string }[]>`
          UPDATE sessions s
          SET "currentBookings" = real.cnt
          FROM (
            SELECT s2.id, COUNT(us.id)::int AS cnt
            FROM sessions s2
            LEFT JOIN user_sessions us
              ON us."sessionId" = s2.id AND us."isCancelled" = false
            WHERE s2."clubId" = ${clubId}
            GROUP BY s2.id
          ) AS real
          WHERE s.id = real.id AND s."currentBookings" != real.cnt
          RETURNING s.id
        `;
        const fixed = fixedRows.length;
        await logAction(request, {
          actorId: auth.user.id, actorName: auth.user.name, actorRole: auth.user.role,
          action: "SYSTEM_RECOUNT_BOOKINGS",
          category: "SYSTEM",
          detail: { sessionsFixed: fixed },
        });
        return NextResponse.json({ ok: true, sessionsFixed: fixed });
      }

      case "clear_old_notifications": {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - 30);
        const { count } = await prisma.notification.deleteMany({
          where: { clubId, isRead: true, sentAt: { lt: cutoff } },
        });
        await logAction(request, {
          actorId: auth.user.id, actorName: auth.user.name, actorRole: auth.user.role,
          action: "SYSTEM_CLEAR_NOTIFICATIONS",
          category: "SYSTEM",
          detail: { deleted: count },
        });
        return NextResponse.json({ ok: true, deleted: count });
      }

      case "expire_subscriptions": {
        const now = new Date();
        const { count } = await prisma.subscription.updateMany({
          where: { clubId, status: "ACTIVE", endDate: { lt: now } },
          data: { status: "EXPIRED" },
        });
        await logAction(request, {
          actorId: auth.user.id, actorName: auth.user.name, actorRole: auth.user.role,
          action: "SYSTEM_EXPIRE_SUBSCRIPTIONS",
          category: "SYSTEM",
          detail: { expired: count },
        });
        return NextResponse.json({ ok: true, expired: count });
      }

      default:
        return NextResponse.json({ error: "Action inconnue" }, { status: 400 });
    }
  } catch (error) {
    console.error("System action POST error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
