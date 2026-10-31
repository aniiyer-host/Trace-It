ALTER TYPE "CampaignStatus" ADD VALUE IF NOT EXISTS 'FUNDING_COMPLETE';
ALTER TYPE "DonationStatus" ADD VALUE IF NOT EXISTS 'REFUND_RECONCILIATION_REQUIRED';
ALTER TYPE "AttestationStatus" ADD VALUE IF NOT EXISTS 'REVOKED';

ALTER TABLE "donations"
ADD COLUMN "refundedAmount" DECIMAL(14,2) NOT NULL DEFAULT 0;

CREATE TABLE "provider_refunds" (
  "id" TEXT NOT NULL,
  "razorpayRefundId" TEXT NOT NULL,
  "donationId" TEXT NOT NULL,
  "amountPaise" INTEGER NOT NULL,
  "status" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "providerCreatedAt" TIMESTAMP(3),
  "processedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "provider_refunds_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "provider_refunds_razorpayRefundId_key" ON "provider_refunds"("razorpayRefundId");
CREATE INDEX "provider_refunds_donationId_status_idx" ON "provider_refunds"("donationId", "status");
ALTER TABLE "provider_refunds" ADD CONSTRAINT "provider_refunds_donationId_fkey"
FOREIGN KEY ("donationId") REFERENCES "donations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
