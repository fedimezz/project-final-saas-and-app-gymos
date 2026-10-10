ALTER TABLE "membership_plans"
  ADD COLUMN "foreignPriceUsd" DOUBLE PRECISION;

ALTER TABLE "payments"
  ADD COLUMN "paymentProvider" TEXT,
  ADD COLUMN "countryCode" TEXT;

ALTER TABLE "saas_payments"
  ADD COLUMN "paymentProvider" TEXT,
  ADD COLUMN "countryCode" TEXT;
