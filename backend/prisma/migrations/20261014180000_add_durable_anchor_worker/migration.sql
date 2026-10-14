-- Extend the existing outbox rather than creating a parallel anchor queue.
ALTER TABLE "anchor_batches"
  ALTER COLUMN "status" DROP DEFAULT,
  ALTER COLUMN "status" TYPE TEXT USING "status"::text;

UPDATE "anchor_batches"
SET "status" = CASE "status"
  WHEN 'SUBMITTED' THEN 'RECONCILIATION_REQUIRED'
  WHEN 'FAILED' THEN 'DEAD_LETTER'
  ELSE "status"
END;

ALTER TABLE "anchor_batches"
  ALTER COLUMN "status" SET DEFAULT 'PENDING',
  ADD COLUMN "anchorPda" TEXT,
  ADD COLUMN "attemptCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "reconciliationCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "claimToken" TEXT,
  ADD COLUMN "claimExpiresAt" TIMESTAMP(3),
  ADD COLUMN "lastError" TEXT,
  ADD CONSTRAINT "anchor_batches_status_check"
    CHECK ("status" IN (
      'PENDING',
      'RETRYABLE',
      'SUBMITTING',
      'RECONCILIATION_REQUIRED',
      'CONFIRMED',
      'TERMINAL_FAILURE',
      'DEAD_LETTER'
    )),
  ADD CONSTRAINT "anchor_batches_claim_lease_check"
    CHECK (
      ("claimToken" IS NULL AND "claimExpiresAt" IS NULL)
      OR ("claimToken" IS NOT NULL AND "claimExpiresAt" IS NOT NULL)
    );

UPDATE "anchor_batches"
SET "lastError" = 'Legacy failed batch migrated to manual review'
WHERE "status" = 'DEAD_LETTER' AND "lastError" IS NULL;

UPDATE "provenance_events" AS event
SET "anchorStatus" = 'ANCHORED',
    "processedAt" = COALESCE(batch."anchoredAt", event."processedAt")
FROM "anchor_batches" AS batch
WHERE event."anchorBatchId" = batch."id"
  AND batch."status" = 'CONFIRMED';

UPDATE "provenance_events" AS event
SET "anchorStatus" = 'FAILED',
    "lastError" = COALESCE(event."lastError", batch."lastError")
FROM "anchor_batches" AS batch
WHERE event."anchorBatchId" = batch."id"
  AND batch."status" IN ('TERMINAL_FAILURE', 'DEAD_LETTER');

CREATE INDEX "anchor_batches_claim_idx"
  ON "anchor_batches" ("status", "nextAttemptAt", "createdAt");

CREATE INDEX "anchor_batches_expired_claim_idx"
  ON "anchor_batches" ("claimExpiresAt")
  WHERE "claimToken" IS NOT NULL;
