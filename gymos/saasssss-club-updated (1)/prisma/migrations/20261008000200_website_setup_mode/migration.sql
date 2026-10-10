-- AlterTable
ALTER TABLE "gym_settings" ADD COLUMN "websiteSetupMode" TEXT;

-- Clubs that already finished or started the wizard keep today's behaviour.
UPDATE "gym_settings" SET "websiteSetupMode" = 'WIZARD' WHERE "websiteSetupCompleted" = true OR "websiteExtraEditUsed" = true OR "websiteCustomizationLocked" = true;
