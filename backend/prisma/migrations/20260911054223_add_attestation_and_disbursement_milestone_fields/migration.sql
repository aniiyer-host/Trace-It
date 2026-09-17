-- CreateEnum
CREATE TYPE "AttestationType" AS ENUM ('RECEIPT', 'DELIVERY');

-- CreateEnum
CREATE TYPE "AttestationStatus" AS ENUM ('PENDING', 'NGO_SIGNED', 'APPROVED', 'REJECTED');

-- AlterEnum
ALTER TYPE "DisbursementStatus" ADD VALUE 'REJECTED';

-- AlterTable
ALTER TABLE "disbursements" ADD COLUMN     "proofSubmittedAt" TIMESTAMP(3),
ADD COLUMN     "rejectionReason" TEXT;

-- CreateTable
CREATE TABLE "attestations" (
    "id" TEXT NOT NULL,
    "donationId" TEXT NOT NULL,
    "type" "AttestationType" NOT NULL,
    "status" "AttestationStatus" NOT NULL DEFAULT 'PENDING',
    "requestedBy" TEXT NOT NULL,
    "ngoSignedBy" TEXT,
    "ngoSignedAt" TIMESTAMP(3),
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attestations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "attestations_donationId_idx" ON "attestations"("donationId");

-- CreateIndex
CREATE INDEX "attestations_status_idx" ON "attestations"("status");

-- CreateIndex
CREATE UNIQUE INDEX "attestations_donationId_type_key" ON "attestations"("donationId", "type");

-- AddForeignKey
ALTER TABLE "attestations" ADD CONSTRAINT "attestations_donationId_fkey" FOREIGN KEY ("donationId") REFERENCES "donations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
