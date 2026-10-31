-- Donation settlement now updates campaign balances explicitly inside the
-- payment-confirmation transaction. Remove the legacy double-counting trigger.
DROP TRIGGER IF EXISTS trg_sync_campaign_raised ON donations;
DROP FUNCTION IF EXISTS sync_campaign_raised();

ALTER TYPE "DonationStatus" ADD VALUE IF NOT EXISTS 'EXCESS_REFUND_PENDING';
ALTER TYPE "DonationStatus" ADD VALUE IF NOT EXISTS 'EXCESS_REFUND_FAILED';
ALTER TYPE "ProvenanceEventType" ADD VALUE IF NOT EXISTS 'DONATION_OVERFLOW_REJECTED';
ALTER TYPE "ProvenanceEventType" ADD VALUE IF NOT EXISTS 'DONATION_REFUND_PROCESSED';
ALTER TYPE "EmailMilestone" ADD VALUE IF NOT EXISTS 'DONATION_EXCESS_REFUND';

CREATE TYPE "RefundOutboxStatus" AS ENUM (
    'PENDING',
    'PROCESSING',
    'COMPLETED',
    'FAILED',
    'RECONCILIATION_REQUIRED'
);

ALTER TABLE "campaigns"
ADD COLUMN "allowOverfunding" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "refund_outbox" (
    "id" TEXT NOT NULL,
    "donationId" TEXT NOT NULL,
    "razorpayPaymentId" TEXT NOT NULL,
    "razorpayRefundId" TEXT,
    "amountPaise" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "receipt" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "status" "RefundOutboxStatus" NOT NULL DEFAULT 'PENDING',
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMP(3),
    "lockedBy" TEXT,
    "requestStartedAt" TIMESTAMP(3),
    "gatewayStatus" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "refund_outbox_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "refund_outbox_donationId_fkey" FOREIGN KEY ("donationId") REFERENCES "donations"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "refund_outbox_donationId_key" ON "refund_outbox"("donationId");
CREATE UNIQUE INDEX "refund_outbox_razorpayRefundId_key" ON "refund_outbox"("razorpayRefundId");
CREATE UNIQUE INDEX "refund_outbox_receipt_key" ON "refund_outbox"("receipt");
CREATE UNIQUE INDEX "refund_outbox_idempotencyKey_key" ON "refund_outbox"("idempotencyKey");
CREATE INDEX "refund_outbox_status_nextAttemptAt_idx" ON "refund_outbox"("status", "nextAttemptAt");
CREATE INDEX "refund_outbox_lockedAt_idx" ON "refund_outbox"("lockedAt");
