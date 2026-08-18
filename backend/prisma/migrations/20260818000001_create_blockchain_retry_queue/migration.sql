-- CreateBlockchainRetryQueue
-- Migration to create table for blockchain retry queue

CREATE TABLE "BlockchainRetryQueue" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "donationId" TEXT NOT NULL,
    "error" TEXT NOT NULL,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "lastAttempt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BlockchainRetryQueue_donationId_key" UNIQUE ("donationId")
);

CREATE INDEX "BlockchainRetryQueue_lastAttempt_idx" ON "BlockchainRetryQueue"("lastAttempt");