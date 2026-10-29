-- Custom-domain requests, optional paid service requests and the central
-- service price list. These models existed in schema.prisma without any
-- migration, so `prisma migrate deploy` produced a database without the tables.
-- Purely additive: new enums + new tables, no existing table is altered.

-- CreateEnum
CREATE TYPE "DomainRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CONFIGURING', 'ACTIVE');

-- CreateEnum
CREATE TYPE "ServiceRequestType" AS ENUM ('CUSTOM_DOMAIN', 'PROFESSIONAL_SETUP', 'WEBSITE_PERSONALIZATION', 'PREMIUM_CUSTOMIZATION');

-- CreateEnum
CREATE TYPE "ServiceRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "domain_requests" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "requestedBy" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "status" "DomainRequestStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedBy" TEXT,
    "reviewNote" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "dnsInstructions" JSONB,
    "priceAtRequest" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "domain_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_requests" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "requestedBy" TEXT NOT NULL,
    "type" "ServiceRequestType" NOT NULL,
    "status" "ServiceRequestStatus" NOT NULL DEFAULT 'PENDING',
    "description" TEXT,
    "notes" TEXT,
    "reviewedBy" TEXT,
    "reviewNote" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "priceAtRequest" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_prices" (
    "id" TEXT NOT NULL,
    "serviceType" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "service_prices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "domain_requests_domain_key" ON "domain_requests"("domain");
CREATE INDEX "domain_requests_clubId_idx" ON "domain_requests"("clubId");
CREATE INDEX "domain_requests_status_idx" ON "domain_requests"("status");

CREATE INDEX "service_requests_clubId_idx" ON "service_requests"("clubId");
CREATE INDEX "service_requests_type_idx" ON "service_requests"("type");
CREATE INDEX "service_requests_status_idx" ON "service_requests"("status");

CREATE UNIQUE INDEX "service_prices_serviceType_key" ON "service_prices"("serviceType");

-- AddForeignKey
ALTER TABLE "domain_requests" ADD CONSTRAINT "domain_requests_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "clubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "clubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
