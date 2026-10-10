// src/app/api/cron/trial-check/route.ts
//
// Meant to be hit once a day by a scheduler (e.g. Vercel Cron at 06:00) —
// not by users. Suspends any club whose trial has ended: Club.status →
// SUSPENDED and ClubSubscription.status → SUSPENDED, then notifies the
// owner by email.
//
// Protected by CRON_SECRET so it can't be triggered by random requests
// (same convention as /api/cron/session-reminders).
//
// vercel.json:
// {
//   "crons": [{ "path": "/api/cron/trial-check", "schedule": "0 6 * * *" }]
// }

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { sendEmail, escapeHtml } from "@/lib/email";
import { logAction } from "@/lib/activity-log";

export async function GET(request: NextRequest) {
  try {
    // ── Auth: only the scheduler should be able to call this ──────────
    if (!isAuthorizedCron(request)) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 401 });
    }

    const now = new Date();

    const expiredClubs = await prisma.club.findMany({
      where: {
        status: "TRIAL",
        trialEndsAt: { lt: now },
      },
      select: {
        id: true,
        name: true,
        slug: true,
        users: {
          where: { role: "OWNER" },
          select: { id: true, email: true, name: true },
          take: 1,
        },
      },
    });

    if (expiredClubs.length === 0) {
      return NextResponse.json({ suspended: 0 });
    }

    const results = await Promise.allSettled(
      expiredClubs.map(async (club) => {
        await prisma.$transaction([
          prisma.club.update({
            where: { id: club.id },
            data: { status: "SUSPENDED", suspendedAt: now, suspendedReason: "Trial expired" },
          }),
          prisma.clubSubscription.updateMany({
            where: { clubId: club.id },
            data: { status: "SUSPENDED" },
          }),
        ]);

        const owner = club.users[0];
        if (owner?.email) {
          await sendEmail({
            to: owner.email,
            subject: `Votre période d'essai est terminée — ${club.name}`,
            html: `<p>Bonjour ${escapeHtml(owner.name ?? "")},</p><p>La période d'essai gratuite de <strong>${escapeHtml(club.name)}</strong> est arrivée à son terme et l'accès à votre espace a été suspendu.</p><p>Connectez-vous et choisissez un plan pour réactiver votre club.</p>`,
          });
        }

        await logAction(request, {
          action: "TRIAL_EXPIRED_SUSPENDED",
          category: "SUBSCRIPTION",
          targetId: club.id,
          targetName: club.name,
          detail: { slug: club.slug },
        });

        return club.id;
      })
    );

    const suspended = results.filter((r) => r.status === "fulfilled").length;
    const failed = results.filter((r) => r.status === "rejected").length;

    return NextResponse.json({ suspended, failed, totalChecked: expiredClubs.length });
  } catch (error) {
    console.error("Trial check cron error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
