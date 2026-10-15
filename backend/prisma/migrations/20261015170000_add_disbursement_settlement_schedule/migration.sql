ALTER TABLE "disbursements"
ADD COLUMN "settlementDueAt" TIMESTAMP(3);

CREATE INDEX "disbursements_status_settlementDueAt_idx"
ON "disbursements"("status", "settlementDueAt");
