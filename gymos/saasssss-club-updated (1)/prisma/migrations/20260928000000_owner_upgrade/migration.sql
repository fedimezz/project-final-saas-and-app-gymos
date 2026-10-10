-- Production upgrade: club branding fields + invitation / phone / country
-- fields on users. Additive only: every column is nullable (or has a default),
-- nothing is dropped or renamed, no backfill. Safe to run BEFORE deploying the
-- code that reads these columns; the previous release (and the mobile app) is
-- unaffected because Prisma selects columns explicitly.

-- GymSettings
ALTER TABLE "gym_settings" ADD COLUMN IF NOT EXISTS "twitterUrl" TEXT;
ALTER TABLE "gym_settings" ADD COLUMN IF NOT EXISTS "youtubeUrl" TEXT;
ALTER TABLE "gym_settings" ADD COLUMN IF NOT EXISTS "websiteUrl" TEXT;
ALTER TABLE "gym_settings" ADD COLUMN IF NOT EXISTS "description" TEXT;
ALTER TABLE "gym_settings" ADD COLUMN IF NOT EXISTS "secondaryColor" TEXT DEFAULT '#3b82f6';

-- User
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "invitedBy" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "invitationToken" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "invitationExpiry" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "phoneVerified" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "phoneVerificationHash" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "phoneVerificationExpiry" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "country" TEXT;

-- Invitation lookups are by token hash.
CREATE INDEX IF NOT EXISTS "users_invitationToken_idx" ON "users"("invitationToken");
