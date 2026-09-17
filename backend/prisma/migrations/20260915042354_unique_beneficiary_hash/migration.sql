/*
  Warnings:

  - A unique constraint covering the columns `[beneficiaryIdHash]` on the table `campaigns` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "campaigns_beneficiaryIdHash_key" ON "campaigns"("beneficiaryIdHash");
