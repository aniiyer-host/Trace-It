-- Adds NGO-only beneficiary identity details. Existing campaigns remain valid;
-- PAN values are not persisted and existing rows receive NULL for these fields.
ALTER TABLE "campaigns"
  ADD COLUMN "beneficiaryName" TEXT,
  ADD COLUMN "beneficiaryDescription" TEXT;
