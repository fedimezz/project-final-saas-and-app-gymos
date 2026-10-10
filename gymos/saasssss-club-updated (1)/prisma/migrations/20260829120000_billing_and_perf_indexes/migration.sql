-- ============================================================================
-- Phase 9/10: SaaS payment ledger + performance indexes
--
-- IMPORTANT — READ BEFORE RUNNING (same disclaimer as the multi_tenancy
-- migration): written by hand because this sandbox has no network access
-- to a live Postgres instance or Prisma's engine binaries.
--
--   1. BACK UP the database first.
--   2. Run against a staging copy first, not prod directly.
--   3. After applying, run `npx prisma validate` and `npx prisma generate`
--      and confirm they succeed, then run the test suite.
--
-- This migration is purely additive (new table + new indexes) — it does
-- not touch existing columns or data, so it's low-risk and reversible by
-- simply dropping the new table/indexes if needed.
-- ============================================================================

-- ── 1. New table: saas_payments ─────────────────────────────────────────────
-- Platform-level billing ledger (a club's payment to the platform for its
-- SaaS plan), distinct from `payments` (a gym member's payment for their
-- own membership). Added so /admin/billing and /platform can show a real
-- payment history instead of an empty/fabricated list.

CREATE TABLE "saas_payments" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "providerRef" TEXT,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saas_payments_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "saas_payments"
  ADD CONSTRAINT "saas_payments_clubId_fkey"
  FOREIGN KEY ("clubId") REFERENCES "clubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "saas_payments"
  ADD CONSTRAINT "saas_payments_subscriptionId_fkey"
  FOREIGN KEY ("subscriptionId") REFERENCES "club_subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "saas_payments_clubId_idx" ON "saas_payments"("clubId");
CREATE INDEX "saas_payments_subscriptionId_idx" ON "saas_payments"("subscriptionId");
CREATE INDEX "saas_payments_clubId_paidAt_idx" ON "saas_payments"("clubId", "paidAt");

-- ── 2. Performance indexes (Phase 10 checklist) ─────────────────────────────
-- All composite, tenant-first — matches the query shape used throughout the
-- app (`WHERE clubId = ? AND <secondary filter>`).

CREATE INDEX "club_subscriptions_clubId_status_idx" ON "club_subscriptions"("clubId", "status");
CREATE INDEX "subscriptions_clubId_status_idx" ON "subscriptions"("clubId", "status");
CREATE INDEX "sessions_clubId_day_idx" ON "sessions"("clubId", "day");
CREATE INDEX "notifications_clubId_isRead_idx" ON "notifications"("clubId", "isRead");
CREATE INDEX "payments_clubId_paidAt_idx" ON "payments"("clubId", "paidAt");
