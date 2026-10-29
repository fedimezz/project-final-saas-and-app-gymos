// GET /api/cron/renewal-reminders — once a day (vercel.json). E-mails the OWNER of every ACTIVE club whose
// paid month/year ends in 7, 3 or 1 days (lib/renewal-reminders.ts). Protected by CRON_SECRET.
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { sendEmail } from "@/lib/email";
import { buildTenantOrigin } from "@/lib/tenant-url";
import { daysUntil, REMINDER_THRESHOLDS, renewalReminderEmail, reminderToSend } from "@/lib/renewal-reminders";

export async function GET(request: NextRequest) {
  try {
    if (!isAuthorizedCron(request)) return NextResponse.json({ error: "Accès refusé" }, { status: 401 });

    const now = new Date();
    const horizon = new Date(now.getTime() + (REMINDER_THRESHOLDS[0] + 1) * 86_400_000);
    const subs = await prisma.clubSubscription.findMany({
      where: {
        status: "ACTIVE", currentPeriodEnd: { not: null, gt: now, lte: horizon }, club: { status: "ACTIVE" },
        // Stripe charges auto-renewing clubs by itself; remind only the ones who must renew by hand
        // (one-time payments, manual payments, or auto-renewal cancelled).
        OR: [{ providerSubscriptionId: null }, { cancelAtPeriodEnd: true }],
      },
      select: {
        id: true, currentPeriodEnd: true, renewalReminderDays: true, renewalReminderFor: true,
        plan: { select: { name: true } },
        club: {
          select: {
            id: true, name: true, slug: true, customDomain: true,
            users: { where: { role: "OWNER", isActive: true }, select: { email: true, name: true }, take: 1 },
          },
        },
      },
    });

    let sent = 0;
    let failed = 0;
    for (const sub of subs) {
      const threshold = reminderToSend(sub, now);
      const owner = sub.club.users[0];
      if (threshold === null || !owner?.email || !sub.currentPeriodEnd) continue;
      try {
        const mail = renewalReminderEmail({
          ownerName: owner.name ?? "", clubName: sub.club.name, planName: sub.plan.name,
          endsAt: sub.currentPeriodEnd, daysLeft: daysUntil(sub.currentPeriodEnd, now),
          renewUrl: `${buildTenantOrigin(sub.club)}/admin/billing`,
        });
        await sendEmail({ to: owner.email, ...mail });
        // Mark only after the e-mail went out, and only if nobody changed the period meanwhile.
        await prisma.clubSubscription.updateMany({
          where: { id: sub.id, currentPeriodEnd: sub.currentPeriodEnd },
          data: { renewalReminderDays: threshold, renewalReminderFor: sub.currentPeriodEnd },
        });
        sent += 1;
      } catch (error) {
        failed += 1;
        console.error("[renewal-reminders] failed for club", sub.club.id, error instanceof Error ? error.message : error);
      }
    }
    return NextResponse.json({ checked: subs.length, sent, failed });
  } catch (error) {
    console.error("renewal-reminders cron error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
