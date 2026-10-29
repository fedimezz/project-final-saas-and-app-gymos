// src/app/api/cron/subscription-renewal/route.ts
//
// Meant to be hit once a day by a scheduler. Moves any ClubSubscription
// that has been PAST_DUE for more than SUBSCRIPTION_PAST_DUE_GRACE_DAYS
// to SUSPENDED (and suspends the parent Club too, mirroring trial-check).
//
// Protected by CRON_SECRET, same convention as the other cron routes.
//
// vercel.json:
// {
//   "crons": [{ "path": "/api/cron/subscription-renewal", "schedule": "0 6 * * *" }]
// }

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { sendEmail, escapeHtml } from "@/lib/email";
import { logAction } from "@/lib/activity-log";
import { paidGraceDays, SUBSCRIPTION_EXPIRED_REASON } from "@/lib/subscription-expiry";
import { invalidateClubCache } from "@/lib/tenant";

const GRACE_DAYS = 7;

export async function GET(request: NextRequest) {
  try {
    if (!isAuthorizedCron(request)) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 401 });
    }

    const cutoff = new Date(Date.now() - GRACE_DAYS * 24 * 60 * 60 * 1000);

    const pastDue = await prisma.clubSubscription.findMany({
      where: { status: "PAST_DUE", updatedAt: { lt: cutoff } },
      select: {
        clubId: true,
        club: {
          select: {
            id: true,
            name: true,
            slug: true,
            users: { where: { role: "OWNER" }, select: { email: true, name: true }, take: 1 },
          },
        },
      },
    });

    // Paid period (monthly / yearly) that ran out and was not renewed. Requests are already refused
    // per-request by lib/tenant.ts isClubUsable; this pass records it (status, e-mail, audit).
    const expiredCutoff = new Date(Date.now() - paidGraceDays() * 24 * 60 * 60 * 1000);
    const expiredPaid = await prisma.clubSubscription.findMany({
      where: { status: "ACTIVE", currentPeriodEnd: { not: null, lt: expiredCutoff }, club: { status: "ACTIVE" } },
      select: {
        clubId: true,
        club: { select: { id: true, name: true, slug: true, users: { where: { role: "OWNER" }, select: { email: true, name: true }, take: 1 } } },
      },
    });
    let expired = 0;
    for (const entry of expiredPaid) {
      const club = entry.club;
      try {
        await prisma.$transaction([
          prisma.clubSubscription.update({ where: { clubId: club.id }, data: { status: "SUSPENDED" } }),
          prisma.club.update({ where: { id: club.id }, data: { status: "SUSPENDED", suspendedAt: new Date(), suspendedReason: SUBSCRIPTION_EXPIRED_REASON } }),
        ]);
        invalidateClubCache(club.slug);
        const owner = club.users[0];
        if (owner?.email) {
          await sendEmail({
            to: owner.email,
            subject: `Abonnement expiré — ${club.name}`,
            html: `<p>Bonjour ${escapeHtml(owner.name ?? "")},</p><p>La période payée de <strong>${escapeHtml(club.name)}</strong> est terminée. L'accès à votre espace est suspendu ; vos données sont conservées.</p><p>Renouvelez ici : <a href="${escapeHtml((process.env.APP_URL || "").replace(/\/$/, ""))}/reactivate">renouveler mon abonnement</a>.</p>`,
          }).catch((e) => console.error("[renewal] expiry e-mail failed:", e instanceof Error ? e.message : e));
        }
        await logAction(request, { action: "SUBSCRIPTION_PERIOD_EXPIRED", category: "SUBSCRIPTION", targetId: club.id, targetName: club.name });
        expired += 1;
      } catch (e) {
        console.error("[renewal] could not expire club", club.id, e instanceof Error ? e.message : e);
      }
    }

    if (pastDue.length === 0) {
      return NextResponse.json({ suspended: 0, expired });
    }

    const results = await Promise.allSettled(
      pastDue.map(async (entry) => {
        const club = entry.club;
        await prisma.$transaction([
          prisma.clubSubscription.update({
            where: { clubId: club.id },
            data: { status: "SUSPENDED" },
          }),
          prisma.club.update({
            where: { id: club.id },
            data: { status: "SUSPENDED", suspendedAt: new Date(), suspendedReason: "Payment past due" },
          }),
        ]);

        const owner = club.users[0];
        if (owner?.email) {
          await sendEmail({
            to: owner.email,
            subject: `Abonnement suspendu — ${club.name}`,
            html: `<p>Bonjour ${escapeHtml(owner.name ?? "")},</p><p>Le paiement de l'abonnement de <strong>${escapeHtml(club.name)}</strong> est resté en attente plus de ${GRACE_DAYS} jours. L'accès à votre espace a été suspendu.</p><p>Mettez à jour votre moyen de paiement pour réactiver votre club.</p>`,
          });
        }

        await logAction(request, {
          action: "SUBSCRIPTION_SUSPENDED_PAST_DUE",
          category: "SUBSCRIPTION",
          targetId: club.id,
          targetName: club.name,
        });

        return club.id;
      })
    );

    const suspended = results.filter((r) => r.status === "fulfilled").length;
    const failed = results.filter((r) => r.status === "rejected").length;

    return NextResponse.json({ suspended, expired, failed, totalChecked: pastDue.length });
  } catch (error) {
    console.error("Subscription renewal cron error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
