# Beneficiary Verification: Blockchain Team Handoff

## 1. OVERVIEW
This document details what has been built in Phase 3 as a placeholder for the beneficiary wallet verification system, and outlines what the blockchain team needs to replace, extend, or preserve in Phase 4 and beyond.

## 2. CURRENT MOCK IMPLEMENTATION
The current system uses a simulated wallet implementation:
- The `BeneficiaryWalletDialog.tsx` component generates a fake wallet ID using the format: `'SOL' + random 40-character hex string`.
- This is **NOT** a real Solana keypair.
- It has no corresponding private key.
- It cannot be used to sign transactions.
- It cannot receive funds on-chain.
- It is purely used as a unique string identifier to satisfy the hash commitment system for Phase 3 testing.

## 3. WHAT THE BLOCKCHAIN TEAM NEEDS TO REPLACE
- The mock wallet generation function currently located in `BeneficiaryWalletDialog.tsx` (which is clearly marked with a `TODO` comment).
- Replace this function with real Solana keypair generation using `@solana/web3.js` via `Keypair.generate()`.
- The generated public key will become the new wallet ID.
- The private key must be securely delivered to the beneficiary (e.g., via TipLink integration or similar, as noted in the Phase 4 roadmap).
- The wallet ID format will transition from the mock `'SOL' + hex` format to a real base58-encoded public key (~44 characters). The existing hashing system will seamlessly support this, as it simply hashes whatever string is provided.

## 4. DATABASE SCHEMA (current)
The current `Campaign` model includes the following fields related to the beneficiary:
- `beneficiaryIdHash`: `String?` (nullable)
- **Stored as**: `HMAC-SHA512(walletId, campaignId)`
- The system **never** returns this hash via the API to prevent offline cracking.

## 5. HASHING CONTRACT (do not break this)
The blockchain team **must preserve** this hashing contract when replacing the mock wallet:
- **Input**: The wallet's PUBLIC KEY as a string (base58 encoded for real Solana wallets).
- **Salt**: `campaign.id` (UUID string).
- **Algorithm**: HMAC-SHA512.
- **Implementation**: `HashService.hmacSha512()` located in `backend/src/services/hashService.ts`.

> **WARNING**: If this hashing contract changes, all existing campaign beneficiary hashes will become invalid, causing legitimate campaigns to fail delivery verification. A formal data migration plan is required if the algorithm or salt strategy changes.

## 6. THE VERIFICATION FLOW (preserve this)
The current verification flow must be preserved:
- **Step 1**: An NGO creates a campaign → enters the beneficiary wallet ID → backend hashes the ID → backend stores the hash on the `Campaign` record.
- **Step 2**: The NGO delivers the funds to the beneficiary in the real world.
- **Step 3**: The NGO initiates a delivery attestation → re-enters the beneficiary wallet ID → backend re-hashes it using the same salt (`campaign.id`) → compares it with the stored hash.
- **Step 4**: A match confirms the delivery; a mismatch flags the NGO for review.

## 7. WHAT PHASE 4 NEEDS TO ADD
- Real Solana wallet generation (replacing the mock in `BeneficiaryWalletDialog`).
- Secure private key delivery mechanisms for the beneficiary (TipLink integration).
- On-chain recording of the beneficiary cryptographic commitment (storing the hash on Solana, rather than exclusively in Postgres).
- Zero-Knowledge (ZK) proof of delivery (optional, depending on roadmap decisions).
- Consideration for verifying wallet ownership (e.g., requiring the beneficiary to sign a message with their private key to cryptographically prove they control the wallet before the campaign is finalized).

## 8. FILES TO MODIFY IN PHASE 4
- `frontend/src/components/BeneficiaryWalletDialog.tsx`: Replace the `generateMockWallet` function.
- `backend/src/routes/charity.ts`: Update the attestation signing handler to accommodate on-chain commitments.
- `backend/src/services/hashService.ts`: Update only if the cryptographic algorithm needs to change (requires migration).
- `backend/prisma/schema.prisma`: Update if additional on-chain transaction hashes or beneficiary fields are needed.

## 9. TODO MARKERS IN CODE
The codebase contains `TODO` markers specifically related to this blockchain handoff. Developers should search for:
- `TODO: Phase 4 - Replace with real Solana wallet generation` in `frontend/src/components/BeneficiaryWalletDialog.tsx`
- `TODO: Phase 4 - Store this hash on-chain` in `backend/src/routes/charity.ts` (or campaign creation)
- (Any other `TODO` comments related to blockchain integration points for the beneficiary).
