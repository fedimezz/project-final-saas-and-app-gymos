-- Plan visibility: SUPER_ADMIN decides which plans new customers can pick.
-- Purely additive; no row is deleted and no subscription/payment is modified.
ALTER TABLE "saas_plans" ADD COLUMN "isPublic" BOOLEAN NOT NULL DEFAULT true;

-- The Starter plan is withdrawn from new offers. Existing subscriptions keep it.
UPDATE "saas_plans" SET "isPublic" = false WHERE "tier" = 'STARTER';
