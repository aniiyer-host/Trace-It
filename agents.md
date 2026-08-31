# Trace-It Agents Working Context

This document captures the current state of work, key decisions, and implementation details to enable resuming work across model/provider switches.

## Current Work Focus (as of 2026-08-31)

### Primary Tasks Recently Completed:
1. Updated `architecture_working.md` with comprehensive details on:
   - Donor anonymity via keyed hashing (SHA512(userId||secret))
   - Tamper evidence via record hashes
   - Attestation mechanism for NGO receipt/delivery verification
   - Status lifecycle and on-chain updates
   - Data flow diagrams and trust guarantees

2. Reviewed and synchronized with `blockchain_implementation_roadmap.md`:
   - Confirmed decision for single unified Anchor program (Option C)
   - Verified SHA-512 usage consistency
   - Noted discrepancies and decisions regarding beneficiary role, ZK compression, etc.

### Current Implementation Status:
- **Blockchain Phase 1**: Anchor program structure defined, instructions drafted
- **Backend**: Razorpay integration, donor service, hash service implemented
- **Frontend**: React/Vite structure in place
- **Integration Points**: Webhook handlers ready for blockchain service hook

## Key Architectural Decisions

### 1. Program ID Uniformity
- **Decision**: Different wallets naturally produce different program IDs (mathematically impossible to be the same)
- **Acceptance**: This is fine for local development - each developer can use their own wallet
- **Production**: Will use a single shared wallet for consistent program ID

### 2. SOLANA_WALLET_KEYPAIR_PATH Usage
- **Correct Usage**: Expects filesystem path to keypair JSON file (not address)
- **anchor keys sync**: Only updates .env to match Anchor.toml (doesn't change keys)
- **Team Workflow**: Each member can have their own wallet/path; tests deploy fresh each run

### 3. Money Flow & Fiat-Only Model
- **Platform Bank Account**: Receives fiat from Razorpay
- **NGO Payout**: Platform sends funds to NGO's bank account (off-chain) OR converts to crypto and sends to NGO wallet
- **Beneficiary Delivery**: Happens via NGO's existing fiat payout processes
- **Crypto Requirement**: NOT needed - fiat-only notary model where blockchain only stores data attestations

### 4. Anonymity & Trust Mechanisms
- **Donor Anonymity**: SHA512(userId||secret) stored on-chain; secret known only to backend
- **Tamper Evidence**: SHA512 of full record stored as record_hash field
- **Immutability**: Solana blockchain ensures data cannot be altered after confirmation
- **Public Verifiability**: Anyone can recompute hashes and verify integrity

### 5. Attestation Mechanism (Added per request)
- **NGO Receipt Attestation**: NGO signs statement confirming fund receipt
- **Optional Delivery Attestation**: NGO signs statement confirming beneficiary delivery
- **Storage**: On-chain via PDA associated with donation
- **Verification**: Anyone can verify NGO's signature using public key

### 6. Status Lifecycle
```
0 = Initiated (order created)
1 = Success (payment verified, on-chain record created)
2 = Allocated (NGO earmarked funds)
3 = Disbursed (funds sent to NGO wallet)
4 = Delivered (beneficiary confirmed receipt)
```

### 7. Technology Stack Decisions
- **Single Unified Anchor Program**: Rather than three separate programs or Memo Program only
- **SHA-512 Consistency**: Across all document/data integrity hashes
- **Program Derived Addresses (PDAs)**: For deterministic addressing and idempotency
- **Idempotency Key**: donation_id used as PDA seed prevents duplicate records

## Current Code State

### Blockchain Program (`blockchain/programs/traceit/src/`)
- **State Accounts Defined**: DonationRecord, NgoRecord, CohortRecord, DisbursementRecord
- **Core Instructions Implemented**: 
  - `record_donation.rs`: Creates donation record with status=SUCCESS
  - `update_status.rs`: Handles status transitions with validation
- **Program Entrypoint**: `lib.rs` exports both instructions
- **Error Handling**: Custom `TraceItError` enum
- **Tests**: Integration test suite in `tests/traceit.ts`

### Backend Services (`backend/src/services/`)
- **donationService.ts**: Razorpay order creation and payment verification
- **hashService.ts**: SHA-512 and HMAC-SHA-512 implementations
- **blockchainService.ts**: (Planned) Bridge to Solana program
- **blockchainInstance.ts**: (Planned) Singleton factory

### Configuration Templates
- **Anchor.toml**: Configured for localnet with devnet-traceit.json wallet
- **.env.example**: Includes blockchain configuration placeholders
- **Prisma Schema**: Includes solanaTxHash, donorIdHash, etc. fields

## Pending Implementation Tasks

### Immediate Next Steps:
1. **Complete blockchainService.ts** in backend/src/services/
   - Implement connection to Solana devnet
   - Add recordDonation and updateDonationStatus methods
   - Integrate with hashService for donor ID hashing
   - Add idempotency checking and error handling

2. **Hook into Razorpay Webhook**
   - Modify `backend/src/routes/webhooks/razorpay.ts`
   - After payment verification and DB update, call blockchainService.recordDonation()
   - Store returned transaction hash in Donation.solanaTxHash field

3. **Implement Retry Mechanism**
   - Create background process for failed on-chain submissions
   - Use donationId as idempotency key for safe retries

4. **Add Status Update Hooks**
   - Hook into NGO allocation/disbursement approval flows
   - Call blockchainService.updateDonationStatus() for status transitions

### Phase 2 Tasks (Webhook Integration):
- [ ] Wire blockchainService into razorpay webhook handler
- [ ] Implement retry queue for failed Solana submissions
- [ ] Verify public donation timeline API shows transaction hashes
- [ ] Hook allocation/disbursement flows to update on-chain status

### Phase 3 Tasks (NGO & Cohort):
- [ ] Implement register_ngo, register_cohort, record_disbursement instructions
- [ ] Add corresponding methods to blockchainService
- [ ] Wire into NGO approval and cohort proof upload flows
- [ ] Implement document hash verification endpoint

### Phase 4 Tasks (Beneficiary Flow):
- [ ] Resolve beneficiary role question (see roadmap discrepancies)
- [ ] Implement off-chain ZK proof verification + on-chain attestation
- [ ] Decide on ImpactToken approach (SPL vs custom program)
- [ ] Evaluate TipLink integration for beneficiary wallets

## Environment & Configuration Notes

### Required Environment Variables (backend/.env):
```env
# Blockchain Configuration
SOLANA_RPC_URL=https://api.devnet.solana.com
SOLANA_CLUSTER=devnet
SOLANA_PROGRAM_ID=[deployed_program_id]
SOLANA_WALLET_KEYPAIR_PATH=~/.config/solana/devnet-traceit.json
BLOCKCHAIN_HMAC_SECRET=[high_entropy_secret_for_donor_hashing]

# Existing Variables (already present)
DATABASE_URL="..."
DIRECT_DATABASE_URL="..."
PORT=3000
NODE_ENV=development
RAZORPAY_KEY_ID="..."
RAZORPAY_KEY_SECRET="..."
```

### Wallet Management:
- **Development**: Each developer uses `solana-keygen new --outfile ~/.config/solana/devnet-traceit.json`
- **Funding**: `solana airdrop 2 $(solana address -k ~/.config/solana/devnet-traceit.json) --url http://127.0.0.1:8899`
- **Consistency**: For shared program ID, distribute same keypair file (devnet only)

### Testing Commands:
```bash
# Start local validator (separate terminal)
solana-test-validator

# Build and test blockchain
cd blockchain
anchor build
anchor test

# Run backend tests
cd ../backend
npm test
```

## Decision Log

| Date | Decision | Context |
|------|----------|---------|
| 2026-08-15 | Single Unified Anchor Program (Option C) | Chose over three separate programs or Memo Program only |
| 2026-08-15 | Use SHA-512 for all hashes | Consistent with backend hashService.ts and architecture doc |
| 2026-08-31 | Add attestation mechanism for beneficiary verification | Per user request to verify funds reach right person |
| 2026-08-31 | Confirm fiat-only notary model is viable | Addressed concerns about needing to purchase crypto assets |

## Resumption Guidance

When returning to work after a break or provider switch:

1. **Check this file** for current focus and pending tasks
2. **Review architecture_working.md** for detailed design understanding
3. **Review blockchain_implementation_roadmap.md** for phased approach
4. **Verify local environment**: Solana validator running, wallets funded
5. **Start with blockchain service integration** as the immediate next step
6. **Run anchor test** to verify program compiles and tests pass
7. **Proceed with webhook hooking** once service layer is working

## Open Questions Requiring Team Input

1. **Beneficiary Role**: Is BENEFICIARY role handled differently than described in architecture? (See roadmap section 2.10)
2. **ZK Proof Approach**: Will team use on-chain verifier or off-chain verification + on-chain attestation?
3. **ImpactToken Decision**: SPL Token with Metaplex metadata vs custom token program?
4. **Upgrade Strategy**: Multi-sig for program authority or immutable after stabilization?

---
*Document last updated: 2026-08-31*
*To resume work: Read this file, then check architecture_working.md and blockchain_implementation_roadmap.md for detailed specifications.*