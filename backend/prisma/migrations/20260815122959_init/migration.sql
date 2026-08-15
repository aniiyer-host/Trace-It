-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('DONOR', 'CHARITY', 'ADMIN', 'AUDITOR');

-- CreateEnum
CREATE TYPE "NgoStatus" AS ENUM ('PENDING', 'ACTIVE', 'REJECTED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "KycStatus" AS ENUM ('NOT_REQUIRED', 'PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'ACTIVE', 'PAUSED', 'COMPLETED', 'REJECTED');

-- CreateEnum
CREATE TYPE "DonationStatus" AS ENUM ('INITIATED', 'SUCCESS', 'FAILED', 'REFUNDED', 'ALLOCATED', 'DISBURSED', 'DELIVERED');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('NGO_CERT', 'PAN_CARD', 'AADHAR', 'FIELD_REPORT', 'COHORT_PROOF', 'TAX_RECEIPT', 'GOV_EXPORT', 'CAMPAIGN_MEDIA');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('ACTIVE', 'ARCHIVED', 'DELETED', 'LEGAL_HOLD');

-- CreateEnum
CREATE TYPE "DisbursementStatus" AS ENUM ('PENDING', 'APPROVED', 'SENT', 'SETTLED', 'FAILED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('UPI', 'CARD', 'NETBANKING', 'WALLET', 'SOLANA_STUB');

-- CreateEnum
CREATE TYPE "AuditActorType" AS ENUM ('USER', 'SYSTEM', 'WEBHOOK', 'ADMIN');

-- CreateTable
CREATE TABLE "profiles" (
    "id" TEXT NOT NULL,
    "authUserId" TEXT,
    "email" TEXT NOT NULL,
    "fullName" TEXT,
    "phone" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'DONOR',
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "ngoStatus" "NgoStatus" NOT NULL DEFAULT 'PENDING',
    "kycStatus" "KycStatus" NOT NULL DEFAULT 'NOT_REQUIRED',
    "registrationNo" TEXT,
    "organisationName" TEXT,
    "panHash" TEXT,
    "solWalletAddress" TEXT,
    "refreshTokenHash" TEXT,
    "passwordHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_verifications" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "otpCode" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaigns" (
    "id" TEXT NOT NULL,
    "ngoId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT,
    "description" TEXT NOT NULL,
    "category" TEXT,
    "targetAmount" DECIMAL(14,2) NOT NULL,
    "raisedAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "currencyCode" TEXT NOT NULL DEFAULT 'INR',
    "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "coverImageUrl" TEXT,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "sdgTags" TEXT[],
    "solanaProgramId" TEXT,
    "solanaVaultAddress" TEXT,
    "ipfsCid" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "donations" (
    "id" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "donorId" TEXT NOT NULL,
    "ngoId" TEXT NOT NULL,
    "campaignId" TEXT,
    "amount" DECIMAL(14,2) NOT NULL,
    "currencyCode" TEXT NOT NULL DEFAULT 'INR',
    "paymentMethod" "PaymentMethod" NOT NULL,
    "status" "DonationStatus" NOT NULL DEFAULT 'INITIATED',
    "razorpayOrderId" TEXT,
    "razorpayPaymentId" TEXT,
    "donorMessage" TEXT,
    "taxReceiptUrl" TEXT,
    "taxReceiptEmailed" BOOLEAN NOT NULL DEFAULT false,
    "donorIdHash" TEXT,
    "solanaTxHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "donations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "beneficiary_cohorts" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "ngoId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "beneficiaryCount" INTEGER NOT NULL,
    "description" TEXT,
    "sha512DocHash" TEXT,
    "merkleRoot" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "beneficiary_cohorts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "disbursements" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "ngoId" TEXT NOT NULL,
    "cohortId" TEXT,
    "amountInr" DECIMAL(14,2) NOT NULL,
    "amountSol" DECIMAL(18,8),
    "fieldReportUrl" TEXT,
    "status" "DisbursementStatus" NOT NULL DEFAULT 'PENDING',
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "solanaTxHash" TEXT,
    "blockscoutUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "disbursements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "campaignId" TEXT,
    "disbursementId" TEXT,
    "documentType" "DocumentType" NOT NULL,
    "status" "DocumentStatus" NOT NULL DEFAULT 'ACTIVE',
    "storageBucket" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "originalFilename" TEXT,
    "mimeType" TEXT,
    "sizeBytes" BIGINT,
    "sha512Hash" TEXT NOT NULL,
    "ipfsCid" TEXT,
    "ipfsPinnedAt" TIMESTAMP(3),
    "legalHold" BOOLEAN NOT NULL DEFAULT false,
    "ttlExpiry" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "impact_tokens" (
    "id" TEXT NOT NULL,
    "donationId" TEXT NOT NULL,
    "donorId" TEXT NOT NULL,
    "minted" BOOLEAN NOT NULL DEFAULT false,
    "mintedAt" TIMESTAMP(3),
    "mintAddress" TEXT,
    "metadataUri" TEXT,
    "redeemed" BOOLEAN NOT NULL DEFAULT false,
    "redeemedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "impact_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "government_requests" (
    "id" TEXT NOT NULL,
    "requestRef" TEXT NOT NULL,
    "requestingBody" TEXT NOT NULL,
    "legalBasis" TEXT NOT NULL,
    "scope" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdBy" TEXT,
    "targetUserId" TEXT,
    "targetDonationId" TEXT,
    "processedByAdminId" TEXT,
    "filedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "government_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" BIGSERIAL NOT NULL,
    "actorType" "AuditActorType" NOT NULL,
    "actorId" TEXT,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "action" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "ipAddress" TEXT,
    "requestId" TEXT,
    "govRequestId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "profiles_authUserId_key" ON "profiles"("authUserId");

-- CreateIndex
CREATE UNIQUE INDEX "profiles_email_key" ON "profiles"("email");

-- CreateIndex
CREATE INDEX "profiles_email_idx" ON "profiles"("email");

-- CreateIndex
CREATE INDEX "profiles_role_idx" ON "profiles"("role");

-- CreateIndex
CREATE INDEX "profiles_ngoStatus_idx" ON "profiles"("ngoStatus");

-- CreateIndex
CREATE INDEX "profiles_kycStatus_idx" ON "profiles"("kycStatus");

-- CreateIndex
CREATE INDEX "email_verifications_profileId_idx" ON "email_verifications"("profileId");

-- CreateIndex
CREATE UNIQUE INDEX "campaigns_slug_key" ON "campaigns"("slug");

-- CreateIndex
CREATE INDEX "campaigns_ngoId_idx" ON "campaigns"("ngoId");

-- CreateIndex
CREATE INDEX "campaigns_status_idx" ON "campaigns"("status");

-- CreateIndex
CREATE INDEX "campaigns_slug_idx" ON "campaigns"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "donations_publicId_key" ON "donations"("publicId");

-- CreateIndex
CREATE UNIQUE INDEX "donations_razorpayOrderId_key" ON "donations"("razorpayOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "donations_razorpayPaymentId_key" ON "donations"("razorpayPaymentId");

-- CreateIndex
CREATE INDEX "donations_donorId_idx" ON "donations"("donorId");

-- CreateIndex
CREATE INDEX "donations_ngoId_idx" ON "donations"("ngoId");

-- CreateIndex
CREATE INDEX "donations_campaignId_idx" ON "donations"("campaignId");

-- CreateIndex
CREATE INDEX "donations_status_idx" ON "donations"("status");

-- CreateIndex
CREATE INDEX "donations_razorpayOrderId_idx" ON "donations"("razorpayOrderId");

-- CreateIndex
CREATE INDEX "beneficiary_cohorts_campaignId_idx" ON "beneficiary_cohorts"("campaignId");

-- CreateIndex
CREATE INDEX "beneficiary_cohorts_ngoId_idx" ON "beneficiary_cohorts"("ngoId");

-- CreateIndex
CREATE INDEX "disbursements_campaignId_idx" ON "disbursements"("campaignId");

-- CreateIndex
CREATE INDEX "disbursements_ngoId_idx" ON "disbursements"("ngoId");

-- CreateIndex
CREATE INDEX "disbursements_status_idx" ON "disbursements"("status");

-- CreateIndex
CREATE INDEX "documents_ownerId_idx" ON "documents"("ownerId");

-- CreateIndex
CREATE INDEX "documents_campaignId_idx" ON "documents"("campaignId");

-- CreateIndex
CREATE INDEX "documents_disbursementId_idx" ON "documents"("disbursementId");

-- CreateIndex
CREATE INDEX "documents_status_idx" ON "documents"("status");

-- CreateIndex
CREATE INDEX "documents_legalHold_idx" ON "documents"("legalHold");

-- CreateIndex
CREATE INDEX "impact_tokens_donationId_idx" ON "impact_tokens"("donationId");

-- CreateIndex
CREATE INDEX "impact_tokens_donorId_idx" ON "impact_tokens"("donorId");

-- CreateIndex
CREATE UNIQUE INDEX "government_requests_requestRef_key" ON "government_requests"("requestRef");

-- CreateIndex
CREATE INDEX "government_requests_status_idx" ON "government_requests"("status");

-- CreateIndex
CREATE INDEX "audit_logs_entityType_entityId_idx" ON "audit_logs"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "audit_logs_actorType_actorId_idx" ON "audit_logs"("actorType", "actorId");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- AddForeignKey
ALTER TABLE "email_verifications" ADD CONSTRAINT "email_verifications_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_ngoId_fkey" FOREIGN KEY ("ngoId") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "donations" ADD CONSTRAINT "donations_donorId_fkey" FOREIGN KEY ("donorId") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "donations" ADD CONSTRAINT "donations_ngoId_fkey" FOREIGN KEY ("ngoId") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "donations" ADD CONSTRAINT "donations_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "beneficiary_cohorts" ADD CONSTRAINT "beneficiary_cohorts_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "beneficiary_cohorts" ADD CONSTRAINT "beneficiary_cohorts_ngoId_fkey" FOREIGN KEY ("ngoId") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disbursements" ADD CONSTRAINT "disbursements_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disbursements" ADD CONSTRAINT "disbursements_ngoId_fkey" FOREIGN KEY ("ngoId") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disbursements" ADD CONSTRAINT "disbursements_cohortId_fkey" FOREIGN KEY ("cohortId") REFERENCES "beneficiary_cohorts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_disbursementId_fkey" FOREIGN KEY ("disbursementId") REFERENCES "disbursements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "impact_tokens" ADD CONSTRAINT "impact_tokens_donationId_fkey" FOREIGN KEY ("donationId") REFERENCES "donations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "impact_tokens" ADD CONSTRAINT "impact_tokens_donorId_fkey" FOREIGN KEY ("donorId") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "government_requests" ADD CONSTRAINT "government_requests_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "government_requests" ADD CONSTRAINT "government_requests_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "government_requests" ADD CONSTRAINT "government_requests_targetDonationId_fkey" FOREIGN KEY ("targetDonationId") REFERENCES "donations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "government_requests" ADD CONSTRAINT "government_requests_processedByAdminId_fkey" FOREIGN KEY ("processedByAdminId") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_govRequestId_fkey" FOREIGN KEY ("govRequestId") REFERENCES "government_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;
