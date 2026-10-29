-- Monthly / yearly SaaS billing, two-step manual payment approval, and the "custom 3D model"
-- plan feature. Purely additive: new enum, new columns (all with defaults or nullable), one new
-- enum value, two UPDATEs that only fill gaps. No row is deleted and no existing value is changed.

-- CreateEnum
CREATE TYPE "BillingPeriod" AS ENUM ('MONTHLY', 'YEARLY');

-- New value for the two-step manual flow (PENDING → APPROVED → CONFIRMED). It is not used inside
-- this migration, so it is safe to add in the same transaction on PostgreSQL 12+.
ALTER TYPE "ManualPaymentStatus" ADD VALUE IF NOT EXISTS 'APPROVED';

-- AlterTable: plans get an optional yearly price
ALTER TABLE "saas_plans" ADD COLUMN "priceYearly" DOUBLE PRECISION;

-- AlterTable: the period a club subscribed to
ALTER TABLE "club_subscriptions" ADD COLUMN "billingPeriod" "BillingPeriod" NOT NULL DEFAULT 'MONTHLY';

-- AlterTable: the period each charge buys
ALTER TABLE "saas_payments" ADD COLUMN "billingPeriod" "BillingPeriod" NOT NULL DEFAULT 'MONTHLY';

-- AlterTable: manual requests carry the period + the verification step
ALTER TABLE "manual_payment_requests"
  ADD COLUMN "billingPeriod" "BillingPeriod" NOT NULL DEFAULT 'MONTHLY',
  ADD COLUMN "paymentReference" TEXT,
  ADD COLUMN "verifiedBy" TEXT,
  ADD COLUMN "verifiedAt" TIMESTAMP(3);

-- Starting yearly price for plans that have none: 10 x the monthly price (two months free).
-- Only fills NULLs; SUPER_ADMIN can change it any time in /platform/plans and it is never
-- overwritten again (the seed does not touch existing rows).
UPDATE "saas_plans" SET "priceYearly" = "priceMonthly" * 10 WHERE "priceYearly" IS NULL AND "priceMonthly" > 0;

-- Plan feature "customHeroModel" = may upload their own 3D model (.glb/.gltf). Only fills the
-- gap: a plan that already has the key keeps SUPER_ADMIN's value. Paid tiers PRO and BUSINESS get
-- it; STARTER (already withdrawn from new offers) does not.
UPDATE "saas_plans"
   SET "limits" = "limits"::jsonb || jsonb_build_object('customHeroModel', "tier" IN ('PRO', 'BUSINESS'))
 WHERE NOT ("limits"::jsonb ? 'customHeroModel');
