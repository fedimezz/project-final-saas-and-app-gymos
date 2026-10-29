-- Manual (non-Stripe) SaaS payments + premium theme/model unlocks.
-- Purely additive: one enum, one table, one column with a default.

-- CreateEnum
CREATE TYPE "ManualPaymentStatus" AS ENUM ('PENDING', 'CONFIRMED', 'REJECTED', 'CANCELLED');

-- CreateTable
CREATE TABLE "manual_payment_requests" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "requestedBy" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "contactPhone" TEXT NOT NULL,
    "note" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" "ManualPaymentStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedBy" TEXT,
    "reviewNote" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "manual_payment_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "manual_payment_requests_clubId_idx" ON "manual_payment_requests"("clubId");

-- CreateIndex
CREATE INDEX "manual_payment_requests_status_idx" ON "manual_payment_requests"("status");

-- AddForeignKey
ALTER TABLE "manual_payment_requests" ADD CONSTRAINT "manual_payment_requests_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "clubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "gym_settings" ADD COLUMN "premiumUnlocks" TEXT[] DEFAULT ARRAY[]::TEXT[];
