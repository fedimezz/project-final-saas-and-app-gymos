// GET /api/platform/system — SUPER_ADMIN only, platform-wide health view.
// The gym-scoped /api/admin/system route explicitly notes this cross-tenant
// version wasn't built yet — this is it.

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireSuperAdmin(request);
    if (!auth.ok) return NextResponse.json({ error: "Accès réservé à la plateforme" }, { status: auth.status });

    const start = Date.now();
    let dbOk = false;
    let dbMs = 0;
    try {
      await prisma.$queryRaw`SELECT 1`;
      dbMs = Date.now() - start;
      dbOk = true;
    } catch {
      dbMs = Date.now() - start;
    }

    const [clubCount, userCount, sessionCount, bookingCount, logCount] = await Promise.all([
      prisma.club.count(),
      prisma.user.count(),
      prisma.session.count(),
      prisma.userSession.count({ where: { isCancelled: false } }),
      prisma.activityLog.count(),
    ]).catch(() => [0, 0, 0, 0, 0]);

    const envChecks = {
      DATABASE_URL: !!process.env.DATABASE_URL,
      JWT_SECRET: !!process.env.JWT_SECRET,
      APP_URL: !!process.env.APP_URL || !!process.env.NEXT_PUBLIC_APP_URL,
      CLOUDINARY_CLOUD_NAME: !!process.env.CLOUDINARY_CLOUD_NAME,
      UPSTASH_REDIS: !!process.env.UPSTASH_REDIS_REST_URL,
      GOOGLE_OAUTH: !!process.env.GOOGLE_CLIENT_ID,
      STRIPE: !!(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET),
      SMTP: !!process.env.RESEND_API_KEY && !!process.env.RESEND_FROM,
      TEXTBEE: !!process.env.TEXTBEE_API_KEY,
      CRON_SECRET: !!process.env.CRON_SECRET,
    };

    return NextResponse.json({
      db: { ok: dbOk, latencyMs: dbMs },
      counts: { clubCount, userCount, sessionCount, bookingCount, logCount },
      env: envChecks,
      serverTime: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Platform system health GET error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
