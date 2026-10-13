-- AlterTable
ALTER TABLE "provenance_events" ADD COLUMN     "chainHash" TEXT;
CREATE UNIQUE INDEX "provenance_events_chainHash_key" ON "provenance_events"("chainHash") WHERE "chainHash" IS NOT NULL;