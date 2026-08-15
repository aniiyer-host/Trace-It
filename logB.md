# DEV-B Implementation Log

## Initial Onboarding - Project Analysis

**Date/Time**: 2026-08-15
**Phase**: Initial Onboarding
**Objective**: Understand Trace-It project structure, compare SQL vs Prisma schema, identify DEV-B phases

### Discrepancies Found

#### Schema Comparison: traceit_backend_sql.sql vs backend/prisma/schema.prisma

**Enums Differences**:
1. `user_role` in SQL includes 'AUDITOR' - missing in Prisma UserRole enum
2. `ngo_status` in SQL has 'SUSPENDED' - missing in Prisma NgoStatus enum  
3. `kyc_status` matches between both
4. `campaign_status` in SQL has 'DRAFT', 'PENDING_APPROVAL', 'REJECTED' - Prisma has 'ACTIVE', 'COMPLETED', 'PAUSED' only
5. `donation_status` in SQL has 'INITIATED', 'REFUNDED' - Prisma has 'PENDING', 'SUCCESS', 'FAILED', 'ALLOCATED', 'DISBURSED', 'DELIVERED', 'FAILED'
6. `document_type` in SQL has more types: 'PAN_CARD', 'AADHAR', 'FIELD_REPORT', 'TAX_RECEIPT', 'GOV_EXPORT', 'CAMPAIGN_MEDIA' - Prisma only has NGO_CERT, BENEFICIARY_PROOF, COHORT_EVIDENCE
7. `document_status` in SQL has 'ARCHIVED', 'DELETED', 'LEGAL_HOLD' - Prisma missing
8. `disbursement_status` matches closely but SQL has 'SETTLED' - Prisma missing
9. `payment_method` in SQL has more types - Prisma missing entirely
10. `audit_actor_type` in SQL has more types - Prisma missing entirely

**Table Structure Differences**:
1. **profiles table**: 
   - SQL has: auth_user_id, phone, organisation_name, sol_wallet_address, refresh_token_hash
   - Prisma has: fullName, email, passwordHash, role, isVerified, kycStatus, panHash, ngoStatus, tipLinkWallet
   - Missing in Prisma: auth_user_id, phone, organisationName, solWalletAddress, refreshTokenHash
   - Extra in Prisma: passwordHash (SQL uses auth system differently)

2. **campaigns table**:
   - SQL has: ngo_id, title, slug, description, category, target_amount, raised_amount, currency_code, status, approved_by, approved_at, cover_image_url, start_date, end_date, sdg_tags, solana_program_id, solana_vault_address, ipfs_cid
   - Prisma has: ngoId, name, description, sdgTags, goalAmount, raisedAmount, deadline, status
   - Missing in Prisma: title (uses name instead), slug, category, target_amount (goalAmount), currency_code, approved_by, approved_at, cover_image_url, start_date, end_date, solana_program_id, solana_vault_address, ipfs_cid

3. **donations table**:
   - SQL has: donor_id, ngo_id, campaign_id, amount_inr, currency_code, payment_method, status, razorpay_order_id, razorpay_payment_id, donor_message, tax_receipt_url, tax_receipt_emailed, donor_id_hash, solana_tx_hash
   - Prisma has: donorId, ngoId, projectId (FK to Campaign), amount, currency, status, razorpayOrderId, razorpayPaymentId, solanaTxHash
   - Missing in Prisma: currency_code (using currency), payment_method, donor_message, tax_receipt_url, tax_receipt_emailed, donor_id_hash
   - Different: projectId vs campaign_id

4. **beneficiary_cohorts table**:
   - SQL has: campaign_id, ngo_id, name, beneficiary_count, description, sha512_doc_hash, merkle_root
   - Prisma has: ngoId, campaignId, eligibilityCriteria, approximateSize, verificationHash
   - Missing in Prisma: name, beneficiary_count, description
   - Different: eligibilityCriteria, approximateSize, verificationHash vs sha512_doc_hash, merkle_root

5. **documents table**:
   - SQL has: owner_id, campaign_id, disbursement_id, document_type, status, storage_bucket, storage_path, original_filename, mime_type, size_bytes, sha512_hash, ipfs_cid, ipfs_pinned_at, legal_hold, ttl_expiry
   - Prisma has: storagePath, ipfsCid, sha512Hash, ownerId, type, ttlExpiry, legalHold
   - Missing in Prisma: campaign_id, disbursement_id, status (using type enum?), storage_bucket, storage_path (has storagePath), original_filename, mime_type, size_bytes, ipfs_pinned_at

6. **Missing tables in Prisma**:
   - email_verifications
   - impact_tokens
   - government_requests
   - audit_logs

### Security Requirements Identified
From security_docs review:
- Authentication: Real backend verification needed (not mock)
- Authorization: RBAC enforcement for donor/NGO/admin roles
- Data Protection: Cryptographic hashing (SHA-256/SHA-512) for document integrity
- Document Security: Encryption (AES-256) before upload, signed URLs with expiry
- Access Control: Ownership validation, legal hold mechanisms
- Audit Logging: Comprehensive audit trails for compliance
- Secret Management: Environment variables, HashiCorp Vault integration
- Rate Limiting: Backend rate limiting per wallet/IP
- Input Validation: Joi validation on all inputs

### DEV-B Roadmap Identification
Based on traceit_implementation_plan.md:

**DEV-B Phase 1** (Weeks 1-2): Database Bootstrap + Prisma
- Create Supabase project; run traceit_schema.sql section by section
- Verify tables, indexes, triggers, RLS policies
- Configure HashiCorp Vault for secrets
- Generate Prisma client from Supabase introspection
- Write seed script (1 admin, 1 NGO, 3 campaigns, 2 donors)
- Configure Backblaze B2 buckets
- Write storageService.ts, vaultService.ts, hashService.ts
- Verify triggers work correctly

**DEV-B Phase 2** (Weeks 3-5): NGO Onboarding + Document Upload
- POST /api/charity/onboard (multi-step NGO registration)
- POST /api/charity/documents/upload (document handling with encryption/hash)
- POST /api/charity/campaigns (create campaign)
- POST /api/charity/cohorts (create beneficiary cohort)
- POST /api/charity/cohorts/:id/proof (upload cohort verification)

**DEV-B Phase 3** (Weeks 6-7): Disbursement Management
- POST /api/charity/disburse (create disbursement)
- POST /api/admin/disburse/:id/approve (approve disbursement)
- GET endpoints for listing disbursements

**DEV-B Phase 4** (Weeks 8-9): Compliance Exports + Legal Gateway
- GET /api/charity/reports/fcra (FCRA compliance)
- GET /api/charity/reports/80g (80G donation summary)
- POST /api/admin/government-requests (legal gateway)
- POST /api/admin/government-requests/:id/hold (legal hold)
- POST /api/admin/government-requests/:id/export (export held docs)

**DEV-B Phase 5** (Weeks 10-12): Testing + CI/CD + Deployment
- E2E test suite
- GitHub Actions CI pipeline
- Docker deployment
- Load testing
- RUNBOOK.md

### Next Steps
1. Stop onboarding phase - do not implement yet
2. Wait for explicit instruction to start DEV-B Phase 1
3. When authorized, begin with database bootstrap work


## Fixed seed.ts and added backend documentation

**Date/Time**: 2026-08-15
**Phase**: Setup
**Objective**: Fix Prisma client import in seed.ts, add backend README and .env.example for new developers.

### Changes
- Fixed Prisma client import in backend/seed.ts by using the existing prisma instance from src/db/prisma.ts
- Created backend/README.md with setup instructions for new developers
- Created backend/.env.example with example environment variables

### Next Steps
- Run npm install in backend
- Run npx prisma generate
- Run npx prisma migrate dev --name init
- Run npx tsx seed.ts to seed the database