ALTER TYPE "DocumentType" ADD VALUE 'BANK_TRANSFER_EVIDENCE';
ALTER TYPE "ProvenanceEventType" ADD VALUE 'BANK_TRANSFER_REPORTED';
ALTER TYPE "ProvenanceEventType" ADD VALUE 'BANK_TRANSFER_EVIDENCE_APPROVED';
ALTER TYPE "ProvenanceEventType" ADD VALUE 'BANK_TRANSFER_EVIDENCE_REJECTED';
ALTER TYPE "EmailMilestone" ADD VALUE 'BENEFICIARY_TRANSFER_REVIEWED';

CREATE TYPE "BankTransferStatus" AS ENUM ('SUBMITTED', 'APPROVED', 'REJECTED');

CREATE TABLE "bank_transfers" (
    "id" TEXT NOT NULL,
    "ngoId" TEXT NOT NULL,
    "allocationId" TEXT NOT NULL,
    "amountInr" DECIMAL(14,2) NOT NULL,
    "currencyCode" TEXT NOT NULL,
    "transferDate" TIMESTAMP(3) NOT NULL,
    "bankReference" TEXT,
    "submissionKey" TEXT NOT NULL,
    "resubmissionOfId" TEXT,
    "status" "BankTransferStatus" NOT NULL DEFAULT 'SUBMITTED',
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "reviewedBy" TEXT,
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bank_transfers_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "documents" ADD COLUMN "bankTransferId" TEXT;

CREATE UNIQUE INDEX "bank_transfers_ngoId_submissionKey_key"
    ON "bank_transfers"("ngoId", "submissionKey");
CREATE INDEX "bank_transfers_status_submittedAt_idx"
    ON "bank_transfers"("status", "submittedAt");
CREATE INDEX "bank_transfers_allocationId_status_idx"
    ON "bank_transfers"("allocationId", "status");
CREATE INDEX "bank_transfers_ngoId_bankReference_idx"
    ON "bank_transfers"("ngoId", "bankReference");
CREATE UNIQUE INDEX "bank_transfers_active_bank_reference_key"
    ON "bank_transfers"("ngoId", "bankReference")
    WHERE "bankReference" IS NOT NULL
      AND "status" IN ('SUBMITTED', 'APPROVED');
CREATE UNIQUE INDEX "bank_transfers_active_resubmission_key"
    ON "bank_transfers"("resubmissionOfId")
    WHERE "resubmissionOfId" IS NOT NULL
      AND "status" IN ('SUBMITTED', 'APPROVED');
CREATE INDEX "bank_transfers_resubmissionOfId_idx"
    ON "bank_transfers"("resubmissionOfId");
CREATE INDEX "documents_bankTransferId_idx"
    ON "documents"("bankTransferId");

ALTER TABLE "bank_transfers" ADD CONSTRAINT "bank_transfers_ngoId_fkey"
    FOREIGN KEY ("ngoId") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "bank_transfers" ADD CONSTRAINT "bank_transfers_allocationId_fkey"
    FOREIGN KEY ("allocationId") REFERENCES "donation_allocations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "bank_transfers" ADD CONSTRAINT "bank_transfers_reviewedBy_fkey"
    FOREIGN KEY ("reviewedBy") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "bank_transfers" ADD CONSTRAINT "bank_transfers_resubmissionOfId_fkey"
    FOREIGN KEY ("resubmissionOfId") REFERENCES "bank_transfers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "documents" ADD CONSTRAINT "documents_bankTransferId_fkey"
    FOREIGN KEY ("bankTransferId") REFERENCES "bank_transfers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
