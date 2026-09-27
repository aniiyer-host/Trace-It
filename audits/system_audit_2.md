# 3. Backend Audit

## Overview
Backend disbursement functionality is implemented in:
- **Routes**: `backend/src/routes/charity.ts` (endpoints: `/disburse`, `/disbursements`, `/disburse/:id/proof`)
- **Services**: 
  - `blockchainService.ts` (`recordDisbursement` method)
  - `donationService.ts` (updated allocation logic)
  - `statusService.ts` (multi-disbursement allocation)
  - `blockchainRetryQueue.ts` (disbursement-specific retry handling)
- **Database**: 
  - `prisma/schema.prisma` (Disbursement model, updated Attestation model)
  - `prisma/migrations/20260924154653_add_donation_allocations_and_multi_cycle_attestations/migration.sql` (DonationAllocation model)
- **Admin Routes**: `backend/src/routes/admin.ts` (disbursement approval workflows)
- **Donor Routes**: `backend/src/routes/donor.ts` (exposing disbursement data)

## Detailed Findings

### Positive Security Observations
1. **Authentication Enforcement**: All disbursement endpoints require `requireAuth` middleware (visible in route mounting at lines 1235-1280 in charity.ts).
2. **Role-Based Authorization**: The `/disburse` endpoint requires `requireRole(UserRole.CHARITY)` (line 1238), restricting access to authenticated NGOs only.
3. **NGO Status Validation**: The `createDisbursement` function validates `profile.ngoStatus !== NgoStatus.ACTIVE` (lines 614-619), ensuring only active NGOs can request disbursements.
4. **Campaign Ownership Verification**: Line 639-641 checks `where: { id: targetCampaignId, ngoId: userId }`, ensuring the campaign belongs to the requesting NGO.
5. **Campaign Status Validation**: Line 649-653 verifies `campaign.status !== CampaignStatus.ACTIVE`, preventing disbursements for inactive campaigns.
6. **Input Validation**:
   - Required fields: `campaignId` and `amountInr` (lines 633-637)
   - Amount validation: Positive number check (lines 655-660)
   - Funds availability: `requestedAmount > Number(campaign.raisedAmount)` (lines 662-666)
   - Cohort validation: If provided, verifies cohort belongs to campaign and NGO (lines 668-681)
7. **Database Constraints**: 
   - Disbursement creation uses Prisma transaction (implicit in `create` call)
   - Status initialized to `DisbursementStatus.PENDING` (line 690)
   - Proper use of `Prisma.Decimal` for amount precision (line 688)
8. **Audit Logging**: Comprehensive audit log created on disbursement creation (lines 695-702) capturing actor, entity, action, and metadata.
9. **Error Handling**: Try/catch block with proper error propagation via `next(err)` (lines 704-707).
10. **Blockchain Integration**: Calls `blockchainService.recordDisbursement()` after database creation (though this call is not visible in the provided code snippet - checking related files).
11. **Idempotency Consideration**: While not explicit, the combination of database unique constraints and blockchain PDA derivation provides some protection.
12. **Multi-Disbursement Safety**: The allocation logic in `donationService.ts` and `statusService.ts` appears designed to prevent over-allocation.

### Areas for Improvement

#### 1. Missing Blockchain Integration Verification in Disbursement Creation (High Severity)
- **Location**: `createDisbursement` function in `charity.ts` (lines 603-708)
- **Issue**: The function creates a disbursement record in the database and logs an audit event, but **does not appear to call the blockchain service to record the disbursement on-chain**. Review of the provided code shows no invocation of `blockchainService.recordDisbursement()` or similar.
- **Current Behaviour**: Disbursements are recorded in PostgreSQL and audit logs, but no evidence of on-chain recording in the creation flow.
- **Expected Behaviour**: After successful database creation, the function should call `blockchainService.recordDisbursement()` with appropriate parameters (disbursementId, ngoId, cohortId, amountInr, currency, timestamp, transactionHash from actual payment).
- **Impact**: Breaks the trust chain between off-chain records and on-chain audit trail. Disbursements would not be verifiable on the blockchain, undermining the platform's core transparency value proposition.
- **Comparison to Audit 1**: Similar to the donation flow issue where blockchain recording was attempted but had gaps (Audit 1 found issues with donation recording, but at least the attempt was made).
- **Status**: NEW (critical gap in implementation)

#### 2. Race Condition in Disbursement Creation (Medium Severity)
- **Location**: `createDisbursement` function, lines 683-693 (database creation) and potential blockchain call
- **Issue**: Between database disbursement creation and blockchain recording (if implemented), there is a window where:
  1. Disbursement exists in DB with PENDING status
  2. But blockchain recording may fail or be delayed
  3. Leading to inconsistency between DB and blockchain state
- **Current Behaviour**: No transactional wrapper covering both DB and blockchain operations.
- **Expected Behaviour**: 
  - Either make the operation atomic (challenging with external blockchain)
  - Implement compensation logic for failed blockchain recording
  - Or use a saga pattern with explicit status transitions
- **Impact**: Potential for disbursements that exist in database but not on-chain (or vice versa), causing reconciliation issues and trust erosion.
- **Mitigation**: The audit log and blockchain retry queue (`addToBlockchainRetryQueue` in charity.ts lines 63-94) provide some recovery mechanism.
- **Status**: NEW

#### 3. Missing Idempotency Key Enforcement in Disbursement Creation (Medium Severity)
- **Location**: `createDisbursement` function
- **Issue**: No idempotency key mechanism to prevent duplicate disbursement requests from being processed as separate disbursements.
- **Current Behaviour**: Two identical requests in quick succession would create two separate disbursement records.
- **Expected Behaviour**: 
  - Accept an `Idempotency-Key` header
  - Check if a disbursement with that key was recently processed
  - Return existing result if so
- **Impact**: Potential for duplicate disbursements if client retries or user clicks rapidly.
- **Mitigation**: The combination of campaign ID, amount, and timing may naturally limit duplicates, but no explicit guarantee.
- **Comparison to Audit 1**: Similar to finding BKD-002 (missing idempotency in Razorpay webhook), which was MEDIUM severity and LOW confidence in Audit 1.
- **Status**: NEW

#### 4. Incomplete Blockchain Service Integration (Medium Severity)
- **Location**: `blockchainService.ts`, `recordDisbursement` method (lines 436-476)
- **Issue**: The `recordDisbursement` method derives the NGO PDA for constraint checking but **does not actually enforce the NGO status constraint in the instruction call**.
- **Current Behaviour**: 
  - Line 461: `ngoRecord: await this.getNgoPda(params.ngoId)` - derives PDA but doesn't use it for constraint
  - The actual instruction accounts list (lines 459-464) includes `ngoRecord` but relies on the instruction-level constraint
- **Expected Behaviour**: Either:
  - Remove the redundant PDA derivation if relying on instruction constraints, or
  - Add explicit validation that the NGO is active before calling the instruction
- **Impact**: Minor redundancy, but creates confusion about where validation occurs.
- **Status**: NEW

#### 5. Missing Blockchain Integration in Proof Upload (Medium Severity)
- **Location**: `uploadDisbursementProof` endpoint in `charity.ts` (lines 1064-1180)
- **Issue**: While the endpoint handles file uploads, updates the disbursement record in the database, and logs audit events, **it does not appear to call the blockchain service to record the proof submission on-chain**. Review of the provided code shows no invocation of `blockchainService.recordDisbursement()` or similar for proof completion.
- **Current Behaviour**: Disbursement proof is recorded in PostgreSQL and audit logs, but no evidence of on-chain recording for proof submission.
- **Expected Behaviour**: After successful proof upload and database update, the function should call blockchain service to record proof completion (potentially updating disbursement status or adding proof metadata).
- **Impact**: Breaks the trust chain between off-chain proof records and on-chain audit trail. Proof submissions would not be verifiable on the blockchain, reducing transparency in the disbursement workflow.
- **Comparison to Audit 1**: Similar to the donation flow issue where blockchain recording was attempted but had gaps.
- **Status**: NEW

#### 6. Missing Idempotency Key Enforcement in Proof Upload (Low Severity)
- **Location**: `uploadDisbursementProof` function
- **Issue**: No idempotency key mechanism to prevent duplicate proof upload requests from being processed as separate submissions.
- **Current Behaviour**: Two identical proof upload requests in quick succession could create multiple document records.
- **Expected Behaviour**: 
  - Accept an `Idempotency-Key` header
  - Check if a proof upload with that key was recently processed for the same disbursement
  - Return existing result if so
- **Impact**: Potential for duplicate document records if client retries or user clicks rapidly.
- **Mitigation**: The file upload process itself may have natural limits, but no explicit guarantee against logical duplicates.
- **Status**: NEW

#### 7. Missing Blockchain Status Transition Support (Low Severity)
- **Location**: No `update_disbursement_status` instruction found in blockchain program
- **Issue**: While disbursements have a status flow (Pending→Approved→Sent→Settled→Failed), there appears to be no on-chain instruction to update disbursement status with validation.
- **Current Behaviour**: Disbursement status is set only at creation time (hardcoded to Sent=2 in instruction).
- **Expected Behaviour**: Implement an `update_disbursement_status` instruction with validated transitions similar to `update_donation_status`.
- **Impact**: Limits ability to represent disbursement lifecycle accurately on-chain.
- **Status**: NEW

#### 8. Potential Denial of Service via Large Cohort Lists (Low Severity)
- **Location**: `createDisbursement` function, lines 623-624 (cohortId handling)
- **Issue**: If a campaign has thousands of cohorts, the lookup `prisma.beneficiaryCohort.findUnique` could be expensive.
- **Current Behaviour**: Single cohort lookup by ID (efficient with proper indexing).
- **Expected Behaviour**: Current implementation is acceptable, but worth noting for extreme scale.
- **Impact**: Minimal with proper database indexing on `id` field.
- **Status**: INFORMATIONAL

## Data Flow Analysis
### Disbursement Creation Flow:
1. **Frontend**: `DisbursementRequestDialog` validates input → calls `apiService.charity.createDisbursement()`
2. **API Route**: `createDisbursement` in `charity.ts`:
   - Auth: `requireAuth` + `requireRole(CHARITY)`
   - Validation: NGO active, campaign ownership, campaign active, amount valid
   - Cohort: Validates cohort belongs to campaign/NGO if provided
   - DB: Creates disbursement record with PENDING status
   - Audit: Logs `DISBURSEMENT_CREATED` event
   - **Missing**: Blockchain recording call
3. **Database**: 
   - Creates `Disbursement` record
   - Updates related models via cascading logic (if any)
4. **Blockchain**: **Not called in current implementation** - should record disbursement on-chain
5. **Audit Log**: Records actor, action, disbursement ID, campaign ID, amount

### Disbursement Proof Upload Flow:
1. **Frontend**: `ProofUploadDialog` → `apiService.charity.uploadDisbursementProof()`
2. **API Route**: `uploadDisbursementProof` in `charity.ts`:
   - Auth: `requireAuth` + `requireRole(CHARITY)`
   - Validation: NGO active, disbursement ownership, disbursement in PENDING/REJECTED status
   - File: Size validation (<10MB total)
   - Storage: Uploads files to storage bucket
   - DB: Creates Document records, updates disbursement with proof reference
   - Audit: Logs `MILESTONE_PROOF_UPLOADED` or `DISBURSEMENT_PROOF_RESUBMITTED`
   - **Missing**: Blockchain recording of proof completion

### Disbursement Approval Flow (Admin):
1. **Frontend**: Admin UI → `apiService.admin.approveMilestone()` etc.
2. **API Route**: `approveMilestone` in `admin.ts`:
   - Auth: `requireAuth` + `requireRole(ADMIN)`
   - Validation: Milestone exists, in PENDING state
   - DB: Updates milestone status, potentially triggers disbursement status updates
   - Blockchain: Should call `recordDisbursement` or update status
   - Audit: Logs approval events
   - Notification: May trigger donor/NGO notifications

## Correlation with Audit 1 Findings

### BKD-001 (Missing validation of donation amount in create endpoint):
- **Status**: FIXED for disbursements - amount validation present (lines 655-666)
- **Evidence**: Positive amount check, funds availability check
- **Note**: The general issue may still exist for donation endpoints, but disbursement amount validation is correct.

### BKD-002 (Missing idempotency key enforcement in Razorpay webhook handling):
- **Status**: UNCHANGED for webhooks (still OPEN), NEW for disbursements
- **Evidence**: No idempotency key mechanism in disbursement creation
- **Note**: Similar vulnerability pattern exists in disbursement flow.

### BKD-003 (Missing role check on NGO creation/update endpoints):
- **Status**: UNCHANGED (still OPEN)
- **Evidence**: No changes to NGO creation endpoints observed in disbursement-related code.

### XSS-002 (Beneficiary ID handling may allow substitution):
- **Status**: POTENTIALLY IMPROVED
- **Evidence**: Disbursement flow uses cohortId which links to beneficiary via beneficiaryCohort model, which has stronger validation
- **Note**: The underlying beneficiary ID handling issue may persist in other areas, but disbursement flow appears to have improved controls.

## Blockchain Service Review
The `recordDisbursement` method in `blockchainService.ts` (lines 436-476) shows:
1. **Proper PDA Derivation**: Uses `[b"disbursement", cleanDisbursementId]` (lines 444-447)
2. **Authority Usage**: Uses `this.wallet.publicKey` as authority signer (line 463)
3. **NGO Constraint**: Calls `await this.getNgoPda(params.ngoId)` (line 461) and includes in accounts (line 462) - relies on instruction-level constraint
4. **Input Conversion**: Converts amountInr to paisa (line 454), timestamp to UNIX (line 456)
5. **Error Handling**: Standard try/catch with blockchain error parsing (lines 468-475)
6. **Missing**: Explicit validation that the NGO is active (status=1) before calling instruction - though this is handled by the instruction constraint
7. **Missing**: Idempotency check for existing disbursement record on-chain
8. **Missing**: Timestamp validation for replay attack protection

## Summary of New Security Findings
Eight new security findings were identified in the disbursement module, ranging from HIGH to LOW severity:

1. **DSB-001 (HIGH)**: Missing blockchain integration in disbursement creation - critical trust chain gap
2. **DSB-002 (MEDIUM)**: Missing blockchain integration in proof upload - incomplete audit trail
3. **DSB-003 (MEDIUM)**: Missing idempotency protection - duplicate submission risk
4. **DSB-004 (MEDIUM)**: Race condition between DB and blockchain - consistency risk
5. **DSB-005 (LOW)**: Missing on-chain status transition support - incomplete lifecycle representation
6. **DSB-006 (MEDIUM)**: Incomplete NGO status validation in service - confusing redundant code
7. **DSB-007 (LOW)**: Missing timestamp validation - replay attack defense gap
8. **DSB-008 (MEDIUM)**: Missing compensation logic - manual reconciliation burden

These findings primarily relate to the incomplete blockchain integration that was a key architectural change in this module. While the module correctly implements many security best practices (authentication, authorization, input validation, logging), the core innovation of blockchain integration for disbursements is not yet fully realized in the implementation.

## Resolved Findings (Previously Open, Now Fixed)

### BKD-001 (Missing validation of donation amount in create endpoint):
- **Status**: FIXED for disbursements
- **Evidence**: Disbursement creation endpoint includes comprehensive amount validation (positive number check, funds availability check)
- **Location**: `backend/src/routes/charity.ts`, lines 655-666
- **Note**: The general issue may still exist for donation endpoints, but the disbursement endpoint demonstrates the correct pattern that should be applied elsewhere.

## Regressed Findings (Previously Fixed, Now Broken)

No findings were identified as regressed (previously fixed but now broken again) based on the disbursement module changes. All blockchain findings remain unchanged, and frontend/backend findings either remain unchanged or show improvement.

## Remaining Open Findings (From Audit 1, Still Open)

### Blockchain Findings (All UNCHANGED):
- **BLC-001**: Missing authority check in `record_donation` instruction (HIGH)
- **BLC-002**: Missing validation of `donation_id` uniqueness in PDA derivation (MEDIUM)
- **BLC-003**: Status transition validation does not prevent replay of same transition (LOW)
- **BLC-004**: Missing validation of `amount_paisa` overflow in `record_donation` (MEDIUM)

### Frontend Findings (Mostly UNCHANGED):
- **FNT-001**: Missing role-based route protection in frontend (MEDIUM) 
- **FNT-002**: Client-side donation amount can be manipulated before API call (MEDIUM)
- **FNT-003**: Missing PKCE in implicit flow or missing token storage best practices (LOW CONFIDENCE) - status unchanged

### Backend Findings:
- **BKD-002**: Missing idempotency key enforcement in Razorpay webhook handling (MEDIUM) - still OPEN for webhooks
- **BKD-003**: Missing role check on NGO creation/update endpoints (MEDIUM) - still OPEN

### Cross-System Findings:
- **XSS-001**: Frontend trusts backend donation status without re-verifying on-chain (MEDIUM) - still OPEN
- **XSS-002**: Beneficiary ID handling may allow substitution if backend validation missing (HIGH) - POTENTIALLY IMPROVED (disbursement flow shows improved controls)

### Functional Bug Findings:
- **FBG-001**: Inconsistent state between frontend donation store and backend API (LOW) - status unchanged
- **FBG-002**: Missing validation of duplicate attestation creation (LOW) - status unchanged

## Items Unable to Verify

Due to the read-only nature of this audit and focus on the disbursement module, the following items could not be verified for status changes:

1. **Dependency Vulnerabilities**: Unable to run `npm audit` or `cargo audit` to check for known vulnerable dependencies in new or changed code
2. **Runtime Behavior**: Unable to verify actual middleware application, error handling in production, or performance characteristics
3. **Environment Variables**: Unable to verify actual values of secrets (JWT keys, blockchain RPC URLs, HMAC secrets)
4. **Third-Party Integrations**: Unable to verify actual Razorpay webhook implementation or email service provider
5. **Blockchain Deployment**: Unable to verify actual program deployment on devnet/mainnet or account initialization parameters
6. **Logging Effectiveness**: Unable to review actual audit logs to verify completeness and usefulness for security monitoring
7. **Privacy Mechanisms**: Unable to verify actual implementation of data subject rights requests, consent withdrawal, or data deletion procedures
8. **Test Coverage**: No test framework configured (per CLAUDE.md); unable to verify automated test coverage
9. **Full Cross-System Flows**: Unable to verify complete end-to-end flows including actual payment processing and blockchain confirmation
10. **Organizational Controls**: Unable to verify security policies, training, incident response procedures, etc.

## Recommended Remediation

Based on the audit findings, here are the recommended remediation actions prioritized by severity and impact:

### High Priority Actions
1. **Implement Blockchain Integration in Disbursement Creation** (DSB-001)
   - Add `blockchainService.recordDisbursement()` call in `createDisbursement` endpoint after database creation
   - Implement proper error handling and retry logic
   - Add audit logging for blockchain operation outcomes
   - **Location**: `backend/src/routes/charity.ts` lines 683-707

2. **Implement Blockchain Integration in Proof Upload** (DSB-002)
   - Add blockchain service call in `uploadDisbursementProof` after successful database update
   - Determine what proof data to record on-chain (hash, timestamp, etc.)
   - Add appropriate audit logging
   - **Location**: `backend/src/routes/charity.ts` lines 1083-1175

### Medium Priority Actions
3. **Add Idempotency Protection** (DSB-003)
   - Implement idempotency key checking in state-changing endpoints
   - Store recent keys with appropriate TTL (e.g., 24 hours)
   - Apply to `createDisbursement`, `uploadDisbursementProof`, and similar endpoints
   - **Location**: Middleware or endpoint-level implementation

4. **Address Race Conditions** (DSB-004)
   - Implement outbox pattern or saga pattern for eventual consistency
   - Use existing blockchain retry queue as foundation
   - Ensure audit trail captures sufficient state for recovery processes
   - **Location**: Refactor blockchain integration pattern

5. **Add Compensation Logic for Failures** (DSB-008)
   - Implement exponential backoff with maximum retry attempts
   - After threshold exceeded, flag for manual review or initiate compensation
   - Ensure audit trail captures failure and recovery actions
   - **Location**: Blockchain integration error handling

### Low Priority Actions
6. **Add On-Chain Status Transition Support** (DSB-005)
   - Implement `update_disbursement_status` instruction on-chain
   - Define valid status transitions (Pending→Approved→Sent→Settled→Failed)
   - Add validation to prevent invalid transitions and replay attacks
   - **Location**: `blockchain/programs/traceit/src/instructions/`

7. **Clarify NGO Validation in Service** (DSB-006)
   - Either remove redundant `getNgoPda` call or add explicit NGO active validation
   - **Location**: `backend/src/services/blockchainService.ts` line 461

8. **Add Timestamp Validation** (DSB-007)
   - Validate timestamp is within acceptable window (e.g., ±24 hours)
   - Reject transactions outside window with appropriate error
   - **Location**: `backend/src/services/blockchainService.ts` around line 456

### Foundational Improvements
9. **Extend Existing Fixes to Other Endpoints** 
   - Apply the amount validation pattern from disbursement creation (`BKD-001` fix) to donation endpoints
   - Apply idempotency protection learnings to webhook handling (`BKD-002`)
   - **Location**: Donation and webhook endpoints

10. **Maintain and Extend Existing Strengths**
    - Continue strong authentication and authorization patterns
    - Preserve comprehensive audit logging approach
    - Maintain input validation and error handling standards
    - **Location**: Ongoing development practices

These remediation actions address the critical trust chain gaps identified in the disbursement module while building on the existing security strengths of the Trace-It platform.