// lib/renewal-reminders.ts — "your plan ends soon" e-mails, 7 / 3 / 1 days before a PAID period ends.
//
// Pure decision logic (testable) + the sender used by /api/cron/renewal-reminders.
//  - Only ACTIVE clubs with a paid period end (trials have their own reminders in trial-check;
//    platform-managed clubs with no period end are never reminded).
//  - At most ONE e-mail per threshold per period: state lives on the subscription row as
//    (renewalReminderDays, renewalReminderFor = the period end it was sent for). A state that does not
//    match the current period end is ignored, so renewing (a new period end) needs no reset.
//  - If a cron run is skipped, the next one sends the smallest threshold that now applies, once.
export const REMINDER_THRESHOLDS = [7, 3, 1] as const;
const DAY_MS = 86_400_000;

export function daysUntil(end: Date | string, now: Date = new Date()): number {
  return Math.ceil((new Date(end).getTime() - now.getTime()) / DAY_MS);
}

export interface ReminderState {
  currentPeriodEnd: Date | string | null;
  renewalReminderDays: number | null;
  renewalReminderFor: Date | string | null;
}

/** The threshold (7, 3 or 1) to e-mail now, or null when there is nothing to send. */
export function reminderToSend(sub: ReminderState, now: Date = new Date()): number | null {
  if (!sub.currentPeriodEnd) return null;
  const left = daysUntil(sub.currentPeriodEnd, now);
  if (left < 1 || left > REMINDER_THRESHOLDS[0]) return null; // already over (expiry flow) or too early
  // smallest threshold that covers the days left: 5 → 7, 3 → 3, 2 → 3, 1 → 1
  const threshold = [...REMINDER_THRESHOLDS].reverse().find((t) => left <= t) ?? null;
  if (threshold === null) return null;
  const sameEnd =
    sub.renewalReminderFor !== null &&
    new Date(sub.renewalReminderFor).getTime() === new Date(sub.currentPeriodEnd).getTime();
  if (sameEnd && sub.renewalReminderDays !== null && sub.renewalReminderDays <= threshold) return null; // already sent
  return threshold;
}

export function renewalReminderEmail(opts: {
  ownerName: string; clubName: string; planName: string; endsAt: Date; daysLeft: number; renewUrl: string;
}): { subject: string; html: string } {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const when = opts.endsAt.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  const left = opts.daysLeft <= 1 ? "demain" : `dans ${opts.daysLeft} jours`;
  return {
    subject: `Votre abonnement ClubX se termine ${left} — ${opts.clubName}`,
    html: `<p>Bonjour ${esc(opts.ownerName)},</p>
<p>La période payée du plan <strong>${esc(opts.planName)}</strong> de <strong>${esc(opts.clubName)}</strong> se termine le <strong>${esc(when)}</strong>. Renouvelez dès maintenant : si vous renouvelez le même plan avant cette date, les jours restants sont conservés.</p>
<p><a href="${esc(opts.renewUrl)}">Renouveler mon abonnement</a></p>
<p>Passé ce délai (et un court délai de grâce), l'accès à votre espace est suspendu ; vos données restent conservées.</p>`,
  };
}
