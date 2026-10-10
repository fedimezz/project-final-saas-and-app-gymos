// src/app/api/dashboard/notifications/route.ts
//
// GET /api/dashboard/notifications?limit=20 — the logged-in user's own
// notifications, newest first. Scoped to their own userId only.
// limit defaults to 50 and is capped at 100.
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireUser } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if (!auth.ok) {
      return NextResponse.json({ error: "Accès refusé" }, { status: auth.status });
    }

    const limitParam = request.nextUrl.searchParams.get("limit");
    const limit = Number(limitParam ?? 50);
    const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.min(limit, 100) : 50;

    const [notifications, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where: { userId: auth.user.id },
        orderBy: { sentAt: "desc" },
        take: safeLimit,
      }),
      prisma.notification.count({
        where: { userId: auth.user.id, isRead: false },
      }),
    ]);

    return NextResponse.json({ notifications, unreadCount });
  } catch (error) {
    console.error("Notifications GET error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
