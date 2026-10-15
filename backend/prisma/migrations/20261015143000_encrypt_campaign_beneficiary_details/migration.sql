-- New beneficiary details use authenticated application-side encryption.
-- Legacy plaintext columns remain for a key-aware backfill; no data is dropped.
ALTER TABLE "campaigns"
  ADD COLUMN "beneficiaryNameEncrypted" TEXT,
  ADD COLUMN "beneficiaryDescriptionEncrypted" TEXT;
