CREATE TABLE "onboarding_email_verifications" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "verificationTokenHash" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "verifiedAt" TIMESTAMP(3),
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "onboarding_email_verifications_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "onboarding_email_verifications_email_key"
    ON "onboarding_email_verifications"("email");

CREATE INDEX "onboarding_email_verifications_expiresAt_idx"
    ON "onboarding_email_verifications"("expiresAt");
