ALTER TABLE "anchor_batches" ADD COLUMN "nonce" TEXT;
ALTER TABLE "anchor_batches" ADD COLUMN "schemaVersion" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "anchor_batches" ADD CONSTRAINT "anchor_batches_nonce_format_check"
  CHECK ("nonce" IS NULL OR "nonce" ~ '^[0-9a-f]{64}$');
CREATE UNIQUE INDEX "anchor_batches_nonce_key" ON "anchor_batches"("nonce");
