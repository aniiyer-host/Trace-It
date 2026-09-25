/*
  Warnings:

  - A unique constraint covering the columns `[donationId,disbursementId,type]` on the table `attestations` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "DisbursementType" AS ENUM ('PROOF_OF_NEED', 'PROOF_OF_WORK');

-- DropIndex
DROP INDEX "attestations_donationId_type_key";

-- AlterTable
ALTER TABLE "attestations" ADD COLUMN     "allocatedAmount" DECIMAL(14,2),
ADD COLUMN     "disbursementId" TEXT;

-- AlterTable
ALTER TABLE "disbursements" ADD COLUMN     "disbursementType" "DisbursementType" NOT NULL DEFAULT 'PROOF_OF_NEED',
ADD COLUMN     "isFinalDisbursement" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "donations" ADD COLUMN     "allocatedAmount" DECIMAL(14,2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "donation_allocations" (
    "id" TEXT NOT NULL,
    "donationId" TEXT NOT NULL,
    "disbursementId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "donation_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "donation_allocations_donationId_idx" ON "donation_allocations"("donationId");

-- CreateIndex
CREATE INDEX "donation_allocations_disbursementId_idx" ON "donation_allocations"("disbursementId");

-- CreateIndex
CREATE INDEX "attestations_disbursementId_idx" ON "attestations"("disbursementId");

-- CreateIndex
CREATE UNIQUE INDEX "attestations_donationId_disbursementId_type_key" ON "attestations"("donationId", "disbursementId", "type");

-- AddForeignKey
ALTER TABLE "donation_allocations" ADD CONSTRAINT "donation_allocations_donationId_fkey" FOREIGN KEY ("donationId") REFERENCES "donations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "donation_allocations" ADD CONSTRAINT "donation_allocations_disbursementId_fkey" FOREIGN KEY ("disbursementId") REFERENCES "disbursements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attestations" ADD CONSTRAINT "attestations_disbursementId_fkey" FOREIGN KEY ("disbursementId") REFERENCES "disbursements"("id") ON DELETE SET NULL ON UPDATE CASCADE;
