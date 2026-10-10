// GET /api/admin/stats — aggregate KPIs for the admin/owner "Vue d'ensemble"
// dashboard. Also returns the club's SaaS plan info (owner-only field) so the
// owner can see their plan tier and usage limits without a separate request.
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { todayAsDayOfWeek } from "@/lib/session-date";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.ok) return NextResponse.json({ error: "Accès refusé" }, { status: auth.status });
    const clubId = auth.user.clubId as string;

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayDow = todayAsDayOfWeek(now);

    const [
      totalMembers,
      activeMembers,
      newMembersThisMonth,
      activeSubscriptions,
      pendingSubscriptions,
      expiredSubscriptions,
      totalSessionsBooked,
      attendancesToday,
      unreadNotifications,
      revenueByCurrency,
      coachRows,
      totalAdmins,
      todaysReservations,
      todaysClasses,
      club,
    ] = await Promise.all([
      prisma.user.count({ where: { clubId, role: "MEMBER" } }),
      prisma.user.count({ where: { clubId, role: "MEMBER", isActive: true } }),
      prisma.user.count({ where: { clubId, role: "MEMBER", createdAt: { gte: startOfMonth } } }),
      prisma.subscription.count({ where: { clubId, status: "ACTIVE" } }),
      prisma.subscription.count({ where: { clubId, status: "PENDING" } }),
      prisma.subscription.count({ where: { clubId, status: "EXPIRED" } }),
      prisma.userSession.count({ where: { clubId, isCancelled: false } }),
      prisma.attendance.count({ where: { clubId, checkInTime: { gte: startOfToday } } }),
      prisma.notification.count({ where: { clubId, userId: auth.user.id, isRead: false } }),
      prisma.payment.groupBy({
        by: ["currency"],
        where: { clubId, status: "PAID", paidAt: { gte: startOfMonth } },
        _sum: { amount: true },
      }),
      prisma.coach.count({ where: { clubId } }),
      prisma.user.count({ where: { clubId, role: "ADMIN" } }),
      prisma.userSession.count({ where: { clubId, isCancelled: false, bookedAt: { gte: startOfToday } } }),
      prisma.session.count({ where: { clubId, day: todayDow, weeklyPlan: { isActive: true } } }),
      // Fetch club + SaaS plan (owner-only usage — admin gets null for plan)
      prisma.club.findUnique({
        where: { id: clubId },
        select: {
          name: true,
          slug: true,
          status: true,
          trialEndsAt: true,
          subscription: {
            select: {
              status: true,
              currentPeriodEnd: true,
              cancelAtPeriodEnd: true,
              plan: {
                select: { tier: true, name: true, priceMonthly: true, limits: true },
              },
            },
          },
        },
      }),
    ]);

    const isOwner = auth.user.role === "OWNER";

    // Build plan widget — only included for OWNER
    const saasPlan = isOwner && club?.subscription
      ? {
          tier: club.subscription.plan.tier,
          name: club.subscription.plan.name,
          priceMonthly: club.subscription.plan.priceMonthly,
          limits: club.subscription.plan.limits as Record<string, number>,
          status: club.subscription.status,
          currentPeriodEnd: club.subscription.currentPeriodEnd,
          cancelAtPeriodEnd: club.subscription.cancelAtPeriodEnd,
          // Current usage against limits
          usage: {
            members: activeMembers,
            coaches: coachRows,
            admins: totalAdmins,
          },
        }
      : null;

    const clubStatus = isOwner
      ? {
          name: club?.name ?? "",
          slug: club?.slug ?? "",
          status: club?.status,
          trialEndsAt: club?.trialEndsAt,
        }
      : null;

    return NextResponse.json({
      totalMembers,
      activeMembers,
      newMembersThisMonth,
      activeSubscriptions,
      pendingSubscriptions,
      expiredSubscriptions,
      totalSessionsBooked,
      attendancesToday,
      unreadNotifications,
      revenueByCurrency: revenueByCurrency.map((entry) => ({
        currency: entry.currency,
        amount: entry._sum.amount ?? 0,
      })),
      totalCoaches: coachRows,
      totalAdmins,
      todaysReservations,
      todaysClasses,
      // Owner-only
      saasPlan,
      clubStatus,
    });
  } catch (error) {
    console.error("Admin stats GET error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
