// src/app/api/admin/notifications/route.ts
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { adminNotificationSchema, cuidSchema, formatZodError } from "@/lib/validation";
import { sendEmail } from "@/lib/email";
import { sendSms } from "@/lib/sms";
import { sendPushToUsers } from "@/lib/push";
import { runAfter } from "@/lib/after";

// POST /api/admin/notifications
// { title, message, type, target: "ALL" | "ACTIVE" | userId[], channels?: string[] }
//
// `channels` controls how the notification SHOULD be delivered. SITE always
// creates a Notification row (shown in the bell). EMAIL/SMS additionally
// dispatch through lib/email.ts / lib/sms.ts — provider configuration is
// handled by Resend and TextBee in those shared helpers.
// configured (same pattern as the verification-code and password-reset
// flows), so this works in local dev without real credentials.
//
// Per-recipient email/SMS opt-outs (UserPreferences.emailNotifications /
// smsNotifications) are respected — an admin picking "EMAIL" as a channel
// sends to everyone who hasn't turned email notifications off, not
// literally everyone in the target list. Every recipient still gets the
// in-app (SITE) notification regardless, since there's no site-notification
// opt-out in the schema.
//
// Delivery failures for one recipient don't block the others (Promise.
// allSettled), and don't fail the request — the site notifications were
// already created and are the primary channel; email/SMS are best-effort.
// Known scaling caveat: for a very large "ALL" broadcast this sends
// everything in one request/serverless invocation rather than queuing it,
// so on a big enough member list it could approach a platform's request
// timeout. Fine for a single-club member count; worth moving to a queue
// (e.g. a background job) if this club's membership grows into the
// thousands.
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.ok) return NextResponse.json({ error: "Accès refusé" }, { status: auth.status });
    const admin = auth.user;
    if (!(await hasPermission(admin, "notifications.send"))) {
      return NextResponse.json({ error: "Permission requise : envoyer des notifications" }, { status: 403 });
    }

    const rawBody = await request.json().catch(() => null);
    const parsed = adminNotificationSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 });
    }
    const { title, message, type, target, channels } = parsed.data;

    const selectedChannels: string[] = channels && channels.length > 0 ? channels : ["SITE"];

    let userIds: string[] = [];

    if (target === "ALL") {
      const users = await prisma.user.findMany({
        where: { clubId: admin.clubId as string, role: "MEMBER" },
        select: { id: true },
      });
      userIds = users.map((u: { id: string }) => u.id);
    } else if (target === "ACTIVE") {
      const users = await prisma.user.findMany({
        where: {
          clubId: admin.clubId as string,
          role: "MEMBER",
          isActive: true,
          subscriptions: { some: { status: "ACTIVE", endDate: { gt: new Date() } } },
        },
        select: { id: true },
      });
      userIds = users.map((u: { id: string }) => u.id);
    } else if (Array.isArray(target)) {
      // One or more specific user IDs, chosen via the member picker —
      // scoped to this admin's own club so a member id copy-pasted from
      // elsewhere can't be used to message another gym's user.
      const users = await prisma.user.findMany({
        where: { clubId: admin.clubId as string, id: { in: target } },
        select: { id: true },
      });
      userIds = users.map((u: { id: string }) => u.id);
      if (userIds.length === 0) {
        return NextResponse.json({ error: "Aucun membre valide sélectionné" }, { status: 404 });
      }
    } else {
      // Backwards-compatible: a single userId as a plain string
      const user = await prisma.user.findFirst({ where: { id: target, clubId: admin.clubId as string } });
      if (!user) return NextResponse.json({ error: "Utilisateur introuvable" }, { status: 404 });
      userIds = [target];
    }

    if (userIds.length === 0) {
      return NextResponse.json({ message: "Aucun destinataire trouvé", count: 0 });
    }

    const result = await prisma.notification.createMany({
      data: userIds.map((userId) => ({
        clubId: admin.clubId as string,
        userId,
        title,
        message,
        type: type ?? "INFO",
        channels: selectedChannels,
      })),
    });

    // ── PUSH (phones) ───────────────────────────────────────────────────
    // Every site notification is also delivered as a real push to the
    // recipients' registered devices (those who turned push off, or have no
    // device registered, are skipped inside sendPushToUsers). Club-scoped.
    const announcementClubId = admin.clubId as string;
    runAfter(() =>
      sendPushToUsers(announcementClubId, userIds, {
        title,
        body: message,
        data: { type: type ?? "INFO", kind: "announcement" },
      })
    );

    // ── EMAIL / SMS dispatch ────────────────────────────────────────────
    const wantsEmail = selectedChannels.includes("EMAIL");
    const wantsSms = selectedChannels.includes("SMS");
    let emailsSent = 0;
    let smsSent = 0;

    if (wantsEmail || wantsSms) {
      // userIds is already club-scoped by every branch above, but keep
      // clubId in this WHERE too — defense-in-depth so this query can never
      // become cross-tenant if a future edit changes how userIds is built.
      const recipients = await prisma.user.findMany({
        where: { id: { in: userIds }, clubId: admin.clubId as string },
        select: {
          id: true,
          email: true,
          phone: true,
          preferences: { select: { emailNotifications: true, smsNotifications: true } },
        },
      });

      const emailHtml = `<p>${message.replace(/\n/g, "<br/>")}</p>`;

      const jobs: Promise<{ channel: "EMAIL" | "SMS"; ok: boolean }>[] = [];

      for (const user of recipients) {
        // Preferences row is created lazily elsewhere; default to opted-in
        // for email (matches UserPreferences' schema default of true) and
        // opted-out for SMS (matches its schema default of false) when a
        // user has no preferences row yet.
        const emailOptIn = user.preferences?.emailNotifications ?? true;
        const smsOptIn = user.preferences?.smsNotifications ?? false;

        if (wantsEmail && emailOptIn && user.email) {
          jobs.push(
            sendEmail({ to: user.email, subject: title, html: emailHtml })
              .then(() => ({ channel: "EMAIL" as const, ok: true }))
              .catch((err) => {
                console.error(`Notification email failed for user ${user.id}:`, err);
                return { channel: "EMAIL" as const, ok: false };
              })
          );
        }
        if (wantsSms && smsOptIn && user.phone) {
          jobs.push(
            sendSms({ to: user.phone, body: `${title} — ${message}` })
              .then(() => ({ channel: "SMS" as const, ok: true }))
              .catch((err) => {
                console.error(`Notification SMS failed for user ${user.id}:`, err);
                return { channel: "SMS" as const, ok: false };
              })
          );
        }
      }

      const outcomes = await Promise.allSettled(jobs);
      for (const outcome of outcomes) {
        if (outcome.status === "fulfilled" && outcome.value.ok) {
          if (outcome.value.channel === "EMAIL") emailsSent++;
          else smsSent++;
        }
      }
    }

    const parts = [`Notification envoyée à ${result.count} membre(s)`];
    if (wantsEmail) parts.push(`${emailsSent} e-mail(s) envoyé(s)`);
    if (wantsSms) parts.push(`${smsSent} SMS envoyé(s)`);

    return NextResponse.json(
      { message: parts.join(", "), count: result.count, emailsSent, smsSent },
      { status: 201 }
    );
  } catch (error) {
    console.error("Admin notifications POST error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

// GET /api/admin/notifications — recent sent notifications (last 50)
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.ok) return NextResponse.json({ error: "Accès refusé" }, { status: auth.status });
    const admin = auth.user;

    const recent = await prisma.notification.findMany({
      where: { clubId: admin.clubId as string },
      orderBy: { sentAt: "desc" },
      take: 50,
      include: { user: { select: { name: true, email: true } } },
    });

    return NextResponse.json({ notifications: recent });
  } catch (error) {
    console.error("Admin notifications GET error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

// DELETE /api/admin/notifications?id=xxx — admin deletes any notification
// (used by the "recent notifications" panel's delete button)
export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.ok) return NextResponse.json({ error: "Accès refusé" }, { status: auth.status });
    const admin = auth.user;

    const id = request.nextUrl.searchParams.get("id");
    const parsedId = cuidSchema.safeParse(id);
    if (!parsedId.success) return NextResponse.json({ error: "id requis" }, { status: 400 });

    const existing = await prisma.notification.findFirst({ where: { id: parsedId.data, clubId: admin.clubId as string } });
    if (!existing) return NextResponse.json({ error: "Notification introuvable" }, { status: 404 });

    await prisma.notification.delete({ where: { id: parsedId.data } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Admin notifications DELETE error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}