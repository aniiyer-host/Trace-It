CREATE TABLE "integrity_alerts" (
  "id" TEXT NOT NULL,
  "dedupeKey" TEXT NOT NULL,
  "donationId" TEXT NOT NULL,
  "ngoId" TEXT NOT NULL,
  "eventId" TEXT,
  "batchId" TEXT,
  "failureType" TEXT NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'ON_DEMAND',
  "severity" TEXT NOT NULL DEFAULT 'HIGH',
  "details" JSONB NOT NULL,
  "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" TIMESTAMP(3),
  "resolutionNote" TEXT,
  CONSTRAINT "integrity_alerts_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "integrity_alerts_dedupeKey_key" ON "integrity_alerts"("dedupeKey");
CREATE INDEX "integrity_alerts_ngoId_resolvedAt_detectedAt_idx" ON "integrity_alerts"("ngoId", "resolvedAt", "detectedAt");
CREATE INDEX "integrity_alerts_resolvedAt_detectedAt_idx" ON "integrity_alerts"("resolvedAt", "detectedAt");
