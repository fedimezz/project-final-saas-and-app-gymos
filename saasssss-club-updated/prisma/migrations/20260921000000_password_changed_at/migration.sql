-- Session revocation on password reset/change (see lib/auth.ts).
-- Nullable, no default, no backfill: existing sessions stay valid until the
-- user's next password change. Safe to run before AND after the code deploy of
-- the previous release, but MUST run BEFORE deploying this release (the auth
-- layer selects this column on every authenticated request).
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "passwordChangedAt" TIMESTAMP(3);
