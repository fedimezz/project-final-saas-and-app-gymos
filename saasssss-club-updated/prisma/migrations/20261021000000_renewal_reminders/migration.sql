-- Renewal reminder bookkeeping (7 / 3 / 1 days before a paid period ends). Purely additive, nullable.
ALTER TABLE "club_subscriptions"
  ADD COLUMN "renewalReminderDays" INTEGER,
  ADD COLUMN "renewalReminderFor" TIMESTAMP(3);
