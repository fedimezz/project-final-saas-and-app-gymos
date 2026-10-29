-- Phase 10/12: Query performance indexes
-- Missing composite indexes identified by query audit.
-- Safe to run on live DB (CREATE INDEX CONCURRENTLY not supported by Prisma
-- migration runner; run manually on prod if table is large):
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS ... ON ...

-- UserSession: bookings page sort + cancel filter
CREATE INDEX IF NOT EXISTS "user_sessions_clubId_isCancelled_idx"
  ON "user_sessions" ("clubId", "isCancelled");

CREATE INDEX IF NOT EXISTS "user_sessions_clubId_bookedAt_idx"
  ON "user_sessions" ("clubId", "bookedAt");

CREATE INDEX IF NOT EXISTS "user_sessions_userId_clubId_idx"
  ON "user_sessions" ("userId", "clubId");

-- Coach: active-only filter
CREATE INDEX IF NOT EXISTS "coaches_clubId_isActive_idx"
  ON "coaches" ("clubId", "isActive");

-- SaasPayment: status filter for billing dashboard
CREATE INDEX IF NOT EXISTS "saas_payments_status_idx"
  ON "saas_payments" ("status");

-- MemberReport: admin reports filter by status within club
CREATE INDEX IF NOT EXISTS "member_reports_clubId_status_idx"
  ON "member_reports" ("clubId", "status");
