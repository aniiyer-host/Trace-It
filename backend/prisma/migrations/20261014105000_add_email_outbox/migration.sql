CREATE TYPE "EmailMilestone" AS ENUM ('DONATION_SUCCESS', 'FUNDS_ALLOCATED');

CREATE TYPE "EmailOutboxStatus" AS ENUM ('PENDING', 'PROCESSING', 'SENT', 'FAILED');

CREATE TABLE "email_outbox" (
    "id" TEXT NOT NULL,
    "eventKey" TEXT NOT NULL,
    "milestone" "EmailMilestone" NOT NULL,
    "donationId" TEXT NOT NULL,
    "disbursementId" TEXT,
    "payload" JSONB NOT NULL,
    "status" "EmailOutboxStatus" NOT NULL DEFAULT 'PENDING',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMP(3),
    "lockedBy" TEXT,
    "lastError" TEXT,
    "providerMessageId" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_outbox_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "email_outbox_eventKey_key" ON "email_outbox"("eventKey");
CREATE INDEX "email_outbox_status_availableAt_idx" ON "email_outbox"("status", "availableAt");
CREATE INDEX "email_outbox_donationId_idx" ON "email_outbox"("donationId");
