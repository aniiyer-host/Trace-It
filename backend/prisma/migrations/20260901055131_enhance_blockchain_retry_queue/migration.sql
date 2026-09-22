-- AlterTable
ALTER TABLE "BlockchainRetryQueue" ADD COLUMN     "metadata" JSONB,
ADD COLUMN     "operationType" TEXT,
ALTER COLUMN "error" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "BlockchainRetryQueue_operationType_idx" ON "BlockchainRetryQueue"("operationType");
