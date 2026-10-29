// GET /api/billing/trial — trial status for the signed-in OWNER/ADMIN of a club.
// Deliberately NOT guarded by the "club is usable" tenant check (unlike requireAdmin): an owner
// whose trial just ended still needs to be told so, and sent to /reactivate. It authenticates the
// token and the live DB account, and only ever reads THAT account's own club.
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getTokenFromRequest, verifyToken } from "@/lib/auth";
import { trialDaysLeft, trialState } from "@/lib/trial";

const NO_STORE = { "Cache-Control": "no-store" } as const;

export async function GET(request: NextRequest) {
  try {
    const token = getTokenFromRequest(request);
    const payload = token ? verifyToken(token) : null;
    if (!payload?.id) return NextResponse.json({ error: "Non authentifié" }, { status: 401, headers: NO_STORE });

    const user = await prisma.user.findUnique({
      where: { id: payload.id },
      select: { role: true, isActive: true, clubId: true },
    });
    if (!user?.isActive || !user.clubId || (user.role !== "OWNER" && user.role !== "ADMIN")) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403, headers: NO_STORE });
    }

    const [club, subscription] = await Promise.all([
      prisma.club.findUnique({ where: { id: user.clubId }, select: { status: true, trialEndsAt: true, suspendedReason: true } }),
      prisma.clubSubscription.findUnique({ where: { clubId: user.clubId }, select: { currentPeriodStart: true } }),
    ]);
    if (!club) return NextResponse.json({ error: "Club introuvable" }, { status: 404, headers: NO_STORE });

    const expired = trialState(club) === "EXPIRED" || (club.status === "SUSPENDED" && club.suspendedReason === "Trial expired");
    const state = expired ? "EXPIRED" : trialState(club); // NONE (paid / not a trial) | ACTIVE | EXPIRED
    return NextResponse.json(
      {
        state,
        startedAt: state === "NONE" ? null : subscription?.currentPeriodStart ?? null,
        endsAt: state === "NONE" ? null : club.trialEndsAt,
        daysLeft: state === "ACTIVE" ? trialDaysLeft(club.trialEndsAt) : 0,
        reactivatePath: "/reactivate",
      },
      { headers: NO_STORE }
    );
  } catch (error) {
    console.error("Billing trial GET error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500, headers: NO_STORE });
  }
}
