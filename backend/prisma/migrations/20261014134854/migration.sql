-- DropIndex
DROP INDEX IF EXISTS "anchor_batches_claim_idx";

-- DropEnum
DO $migration$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'anchor_batches'
      AND column_name = 'status'
      AND udt_name = 'text'
  ) THEN
    DROP TYPE IF EXISTS "BatchStatus";
  END IF;
END
$migration$;
