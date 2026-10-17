-- DropIndex
DROP INDEX "membership_cards_cardNumber_key";

-- DropIndex
DROP INDEX "page_content_pageKey_key";

-- DropIndex
DROP INDEX "posts_createdAt_idx";

-- DropIndex
DROP INDEX "promotions_code_key";

-- DropIndex
DROP INDEX "role_permissions_role_key_key";

-- DropIndex
DROP INDEX "users_email_key";

-- DropIndex
DROP INDEX "weekly_plans_weekStart_weekEnd_key";

-- AlterTable
ALTER TABLE "gym_settings" ALTER COLUMN "name" SET DEFAULT 'My Gym';
