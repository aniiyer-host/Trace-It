# Trace-It Blockchain Implementation Plan

> **Last Updated:** 2026-09-20
> **Current Phase:** Phase 4 (Complete)
> **Overall Status:** Core Phase 1, Phase 2, Phase 3, and Phase 4 complete, ready for Phase 5.

## Overview

This document reflects the current state of blockchain implementation for Trace-It, detailing what has been completed, what remains in the current phase, and the planned progression through all phases. It serves as a living document that should be updated as work progresses.

## Current Implementation Status

### Phase 1: Development Environment & Core Program (COMPLETED)
✅ **Completed:**
- Solana development environment setup (Rust, Solana CLI, Anchor)
- Anchor project initialized with single unified `traceit` program
- Core data accounts defined: DonationRecord, NgoRecord, CohortRecord, DisbursementRecord
- Core instructions implemented:
  - `record_donation.rs`: Creates donation record with status=SUCCESS
  - `update_status.rs`: Handles status transitions with validation (SUCCESS→ALLOCATED→DISBURSED→DELIVERED)
- Program entrypoint (`lib.rs`) and error handling (`errors.rs`) complete
- Anchor integration tests written and passing
- Backend services created:
  - `blockchainService.ts`: Connection to Solana, recordDonation/updateDonationStatus methods
  - `blockchainInstance.ts`: Singleton factory for service initialization
- Environment variables configured in `.env.example`

### Phase 2: Webhook Integration & Reliability (IN PROGRESS - Completing Status Update Hooks)
🔄 **Currently Working On:**
- Completing status update hooks for all flows (ALLOCATED, DISBURSED, DELIVERED)
- Enhancing retry mechanisms
- Public API verification
- Reliability improvements

✅ **Completed in Phase 2:**
- Initial webhook hook in `backend/src/routes/webhooks/razorpay.ts`:
  - Calls `blockchainService.recordDonation()` after Razorpay payment verification
  - Basic error handling and retry queue addition
  - Audit logging for success/failure cases
- Database migration for `BlockchainRetryQueue` table created
- Basic retry queue helper function implemented
- Public donation API already selects `solanaTxHash` field
- Admin routes have blockchain status update hooks for ALLOCATED (verified) and DISBURSED (verified)
- **Fixed**: DELIVERED status hook in `charity.ts` now calls both `markDelivered()` and `blockchainService.updateDonationStatus()`

🔄 **Remaining in Phase 2:**
1. **Verify All Status Update Hooks** ✓ **COMPLETED**:
   - ALLOCATED hook in `admin.ts` calls `blockchainService.updateDonationStatus(donationId, 2)` - VERIFIED
   - DISBURSED hook in `admin.ts` calls `blockchainService.updateDonationStatus(donationId, 3)` - VERIFIED
   - DELIVERED hook in `charity.ts` calls `blockchainService.updateDonationStatus(donationId, 4)` - VERIFIED

2. **Enhance Retry Mechanism**:
   - Implement exponential backoff in retry processor
   - Add maximum retry limits (e.g., 5 attempts)
   - Create background processing loop (currently only basic queueing)
   - Add monitoring and alerting for repeated failures

3. **Verify Public Donation Timeline API**:
   - Confirm `GET /api/public/donation/:publicId` returns `solanaTxHash`
   - Ensure frontend can generate proper Solana Explorer links
   - Add explorer URL computation to API response if missing

4. **Create Robust Retry Processor**:
   - Create `backend/src/services/blockchainRetryProcessor.ts` with:
     - Configurable batch size, delay, and max retries
     - Start/stop methods with graceful shutdown
     - Exponential backoff logic
     - Processing of both record and status update failures
   - Import and start processor in `backend/src/index.ts`
   - Add SIGINT/SIGTERM signal handlers for clean shutdown

5. **Create Reconciliation Script**:
   - Create `backend/scripts/reconcile-blockchain-records.ts` to:
     - Find donations missing on-chain recording (status ≥ SUCCESS, no txHash)
     - Find donations with status mismatches (DB status ≠ on-chain status)
     - Attempt to record missing donations
     - Synchronize status where DB is source of truth
     - Log all actions and avoid rate limiting
   - Add npm script: `"reconcile:blockchain": "ts-node backend/scripts/reconcile-blockchain-records.ts"`

6. **Enhance Environment Configuration**:
   - Ensure all required variables in `.env` and `.env.test`:
     - `SOLANA_RPC_URL`, `SOLANA_CLUSTER`, `SOLANA_PROGRAM_ID`
     - `SOLANA_WALLET_KEYPAIR_PATH`, `BLOCKCHAIN_HMAC_SECRET`
   - Update documentation with wallet management instructions

### Phase 3: NGO Registry, Cohort Hashing & Disbursement Program (PENDING)
📌 **Planned Start:** After Phase 2 completion
- Implement `register_ngo` instruction and backend integration
- Implement `register_cohort` instruction and backend integration  
- Implement `record_disbursement` instruction and backend integration
- Wire into NGO approval, cohort proof upload, and disbursement routes
- Add document hash verification endpoint for auditors

### Phase 4: Attestation Enhancements & Verification (PENDING)
📌 **Planned Start:** After Phase 3 completion
- Enhance NGO receipt attestation flow (section 5.1 of architecture)
- Implement/improve optional delivery attestation flow (section 5.2 of architecture)
- Improve attestation verification APIs
- Improve UX for attestation submission/display
- Focus on privacy-preserving verification without revealing beneficiary identity
- Implement beneficiary identification via keyed hashes in delivery attestations (as NGO_SECRET-based approach)

### Phase 5: Hardening, Devnet Testing & Mainnet Readiness (PENDING)
📌 **Planned Start:** After Phase 4 completion
- Security audit of Anchor program
- Implement program upgrade authority with multi-sig or immutability
- Switch to reliable RPC providers (QuickNode/Helius) with failover
- Optimize gas/storage (account closing, size review)
- Implement monitoring, alerting, and CloudWatch logging
- Create mainnet deployment checklist and run smoke tests
- Conduct load testing (100 concurrent donations)
- Create documentation: runbook, keypair rotation, incident response

## Current Blockchain Program State

### On-Chain Accounts (Defined in `blockchain/programs/traceit/src/state/`):
1. **DonationRecord**: Core donation data with tamper-evident hash
2. **NgoRecord**: NGO profile information and verification status
3. **CohortRecord**: Groups donations for reporting/disbursement
4. **DisbursementRecord**: Tracks platform-to-NGO fund transfers

### On-Chain Instructions (Implemented):
1. **record_donation**: Creates donation record after payment verification
2. **update_donation_status**: Handles status lifecycle transitions

### On-Chain Instructions (Pending - Phase 3+):
1. **register_ngo**: Records NGO verification and status
2. **register_cohort**: Records cohort proof documentation
3. **record_disbursement**: Records platform-to-NGO fund transfers
4. *(Future)* Enhanced attestation storage instructions

## Integration Points

### Backend → Blockchain:
- **donationService.ts**: Creates Razorpay orders, verifies payments
- **hashService.ts**: Provides SHA-512 and HMAC-SHA-512 for donor anonymity
- **blockchainService.ts**: Main Solana connection and transaction submission
- **blockchainInstance.ts**: Singleton service factory
- **webhooks/razorpay.ts**: Records donations on-chain after payment confirmation
- **admin.ts**: Updates donation status on-chain after NGO/admin actions (ALLOCATED, DISBURSED)
- **charity.ts**: Updates donation status on-chain after delivery attestation (DELIVERED)
- **blockchainRetryProcessor.ts**: Background processing of failed submissions
- **reconcile-blockchain-records.ts**: Fixes inconsistencies between DB and chain

### Frontend → Backend → Blockchain:
- Frontend initiates donations via `/api/donor/create-order`
- Frontend verifies payments via `/api/donor/verify-payment`  
- Backend handles webhook and initiates blockchain recording
- Public views transaction hashes via `/api/public/donation/:id`
- Donors can verify their donations via Solana Explorer links

## Data Flow Summary

```
Donor → Frontend → Backend (Razorpay Order) 
                     ↓
               Razorpay Payment
                     ↓
Frontend ← Backend (Payment Verification)
                     ↓
          Backend (DB: Donation SUCCESS)
                     ↓
          Backend → Solana (record_donation ix)
                     ↓
     Solana Confirms → Backend (DB: solanaTxHash)
                     ↓
               Frontend (Shows Explorer Link)
                     ↓
          Backend → Solana (update_status ix) [When NGO acts]
                     ↓
               Solana Confirms → Backend (DB: synced status)
```

## Environment Configuration

### Required Variables (backend/.env):
```env
# Blockchain Configuration
SOLANA_RPC_URL=https://api.devnet.solana.com
SOLANA_CLUSTER=devnet
SOLANA_PROGRAM_ID=[your_deployed_program_id]
SOLANA_WALLET_KEYPAIR_PATH=/home/aaditya/.config/solana/devnet-traceit.json
BLOCKCHAIN_HMAC_SECRET=[high_entropy_secret_for_donor_id_hashing]

# Existing Variables (already present)
DATABASE_URL="postgresql://..."
DIRECT_DATABASE_URL="postgresql://..."
PORT=3000
NODE_ENV=development
RAZORPAY_KEY_ID="..."
RAZORPAY_KEY_SECRET="..."
```

### Wallet Management:
- **Development**: `solana-keygen new --outfile ~/.config/solana/devnet-traceit.json`
- **Funding**: `solana airdrop 2 $(solana address -k ~/.config/solana/devnet-traceit.json) --url http://127.0.0.1:8899`
- **Consistency**: For shared program ID, distribute same keypair file (devnet only)

## Testing and Verification

### Commands to Verify Current State:
```bash
# 1. Compile Anchor Program
cd blockchain
anchor build

# 2. Run Anchor Integration Tests
anchor test

# 3. Test Backend Blockchain Service & Hash Tests
cd ../backend
npm test -- backend/tests/blockchainService.test.ts
```

*This implementation plan is maintained exclusively for the Trace-It Blockchain Engineering Team.*