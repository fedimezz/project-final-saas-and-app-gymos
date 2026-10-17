-- Guided website setup: theme + one-time re-edit + lock + change-request
-- workflow. Additive only: new nullable/defaulted columns on gym_settings,
-- one new table. Nothing dropped or renamed, no backfill needed.

ALTER TABLE "gym_settings" ADD COLUMN IF NOT EXISTS "themeId" TEXT DEFAULT 'classic';
ALTER TABLE "gym_settings" ADD COLUMN IF NOT EXISTS "websiteSetupCompleted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "gym_settings" ADD COLUMN IF NOT EXISTS "websiteExtraEditUsed" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "gym_settings" ADD COLUMN IF NOT EXISTS "websiteCustomizationLocked" BOOLEAN NOT NULL DEFAULT false;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "WebsiteChangeRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'APPLIED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "website_change_requests" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "requestedBy" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "WebsiteChangeRequestStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedBy" TEXT,
    "reviewNote" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "website_change_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "website_change_requests_clubId_status_idx" ON "website_change_requests"("clubId", "status");
CREATE INDEX IF NOT EXISTS "website_change_requests_status_idx" ON "website_change_requests"("status");

DO $$ BEGIN
  ALTER TABLE "website_change_requests" ADD CONSTRAINT "website_change_requests_clubId_fkey"
    FOREIGN KEY ("clubId") REFERENCES "clubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
