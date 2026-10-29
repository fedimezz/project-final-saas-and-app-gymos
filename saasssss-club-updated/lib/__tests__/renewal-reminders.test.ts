import { describe, it, expect } from "vitest";
import { daysUntil, reminderToSend, renewalReminderEmail } from "@/lib/renewal-reminders";

const now = new Date("2026-10-21T12:00:00Z");
const inDays = (d: number) => new Date(now.getTime() + d * 86_400_000);
const fresh = (end: Date | null) => ({ currentPeriodEnd: end, renewalReminderDays: null, renewalReminderFor: null });

describe("reminderToSend (7 / 3 / 1 days before the paid period ends)", () => {
  it("sends nothing when the period is far away, already over, or there is no period end", () => {
    expect(reminderToSend(fresh(inDays(30)), now)).toBeNull();
    expect(reminderToSend(fresh(inDays(8)), now)).toBeNull();
    expect(reminderToSend(fresh(inDays(-1)), now)).toBeNull(); // expiry flow, not a reminder
    expect(reminderToSend(fresh(null), now)).toBeNull(); // platform-managed club
  });
  it("picks the smallest threshold that covers the days left", () => {
    expect(reminderToSend(fresh(inDays(7)), now)).toBe(7);
    expect(reminderToSend(fresh(inDays(5)), now)).toBe(7);
    expect(reminderToSend(fresh(inDays(3)), now)).toBe(3);
    expect(reminderToSend(fresh(inDays(2)), now)).toBe(3);
    expect(reminderToSend(fresh(inDays(1)), now)).toBe(1);
    expect(reminderToSend(fresh(new Date(now.getTime() + 3_600_000)), now)).toBe(1);
  });
  it("never sends the same threshold twice for the same period end", () => {
    const end = inDays(5);
    expect(reminderToSend({ currentPeriodEnd: end, renewalReminderDays: 7, renewalReminderFor: end }, now)).toBeNull();
    // later, 3 days left → the next threshold goes out once
    const end2 = inDays(3);
    expect(reminderToSend({ currentPeriodEnd: end2, renewalReminderDays: 7, renewalReminderFor: end2 }, now)).toBe(3);
    expect(reminderToSend({ currentPeriodEnd: end2, renewalReminderDays: 3, renewalReminderFor: end2 }, now)).toBeNull();
  });
  it("a skipped cron run sends only the threshold that applies now (no burst of old ones)", () => {
    expect(reminderToSend(fresh(inDays(1)), now)).toBe(1);
  });
  it("a reminder state recorded for an OLD period end is ignored after a renewal (no reset needed)", () => {
    const oldEnd = inDays(-25);
    const newEnd = inDays(6);
    expect(reminderToSend({ currentPeriodEnd: newEnd, renewalReminderDays: 1, renewalReminderFor: oldEnd }, now)).toBe(7);
  });
  it("counts days rounded up", () => {
    expect(daysUntil(inDays(2), now)).toBe(2);
    expect(daysUntil(new Date(now.getTime() + 1000), now)).toBe(1);
  });
});

describe("renewalReminderEmail", () => {
  it("is French, names the club and plan, links to billing, and escapes HTML", () => {
    const mail = renewalReminderEmail({
      ownerName: "<b>Sami</b>", clubName: "Gym \"A\"", planName: "Pro", endsAt: new Date("2026-10-28T00:00:00Z"), daysLeft: 7,
      renewUrl: "https://gym-a.clubx.test/admin/billing",
    });
    expect(mail.subject).toContain("dans 7 jours");
    expect(mail.html).toContain("https://gym-a.clubx.test/admin/billing");
    expect(mail.html).toContain("28 octobre 2026");
    expect(mail.html).not.toContain("<b>Sami</b>");
    expect(mail.html).toContain("&lt;b&gt;Sami");
    expect(renewalReminderEmail({ ownerName: "", clubName: "A", planName: "P", endsAt: now, daysLeft: 1, renewUrl: "x" }).subject).toContain("demain");
  });
});
