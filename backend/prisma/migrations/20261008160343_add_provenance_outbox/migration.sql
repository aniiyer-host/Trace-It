-- CreateEnum
CREATE TYPE "ProvenanceEventType" AS ENUM ('DONATION_SUCCESS', 'DONATION_FAILED', 'DONATION_ALLOCATED', 'DONATION_DISBURSED', 'DONATION_DELIVERED', 'DONATION_REFUNDED', 'DISBURSEMENT_APPROVED', 'NGO_APPROVED', 'COHORT_REGISTERED');

-- CreateEnum
CREATE TYPE "AnchorStatus" AS ENUM ('PENDING', 'BATCHED', 'ANCHORED', 'FAILED');

-- CreateEnum
CREATE TYPE "BatchStatus" AS ENUM ('PENDING', 'SUBMITTED', 'CONFIRMED', 'FAILED');

-- CreateTable
CREATE TABLE "provenance_events" (
    "id" BIGSERIAL NOT NULL,
    "eventType" "ProvenanceEventType" NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "amountInr" TEXT NOT NULL,
    "ngoId" TEXT,
    "campaignId" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "canonicalPayload" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "transitionKey" TEXT NOT NULL,
    "anchorStatus" "AnchorStatus" NOT NULL DEFAULT 'PENDING',
    "anchorBatchId" TEXT,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "provenance_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "anchor_batches" (
    "id" TEXT NOT NULL,
    "batchKey" TEXT NOT NULL,
    "auditRoot" TEXT NOT NULL,
    "startSequence" BIGINT NOT NULL,
    "endSequence" BIGINT NOT NULL,
    "eventCount" INTEGER NOT NULL,
    "solanaTxSignature" TEXT,
    "anchoredAt" TIMESTAMP(3),
    "status" "BatchStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "anchor_batches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "provenance_events_anchorStatus_idx" ON "provenance_events"("anchorStatus");

-- CreateIndex
CREATE INDEX "provenance_events_anchorBatchId_idx" ON "provenance_events"("anchorBatchId");

-- CreateIndex
CREATE INDEX "provenance_events_occurredAt_idx" ON "provenance_events"("occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "provenance_events_entityId_eventType_transitionKey_key" ON "provenance_events"("entityId", "eventType", "transitionKey");

-- CreateIndex
CREATE UNIQUE INDEX "anchor_batches_batchKey_key" ON "anchor_batches"("batchKey");

-- CreateIndex
CREATE INDEX "anchor_batches_status_idx" ON "anchor_batches"("status");

-- AddForeignKey
ALTER TABLE "provenance_events" ADD CONSTRAINT "provenance_events_anchorBatchId_fkey" FOREIGN KEY ("anchorBatchId") REFERENCES "anchor_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
