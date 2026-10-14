-- The earlier cleanup migration sorts before the durable anchor migration.
-- Restore the worker claim index and remove the legacy enum after the status
-- column has been converted to text.
CREATE INDEX IF NOT EXISTS "anchor_batches_claim_idx"
  ON "anchor_batches" ("status", "nextAttemptAt", "createdAt");

DROP TYPE IF EXISTS "BatchStatus";
