# TraceIt — Blockchain Implementation Roadmap

> **Authors:** Blockchain Team  
> **Date:** 2026-09-20  
> **Scope:** Solana on-chain audit ledger — smart contract programs, backend integration service, and testing  
> **Status:** Draft — pending team review

---

## Table of Contents

1. [Current State Assessment](#1-current-state-assessment)
2. [Architecture vs Implementation — Discrepancies & Decisions](#2-architecture-vs-implementation--discrepancies--decisions)
3. [Design Concerns & Recommendations](#3-design-concerns--recommendations)
4. [Cross-Team Dependencies & Mocking Strategy](#4-cross-team-dependencies--mocking-strategy)
5. [Phase 1 — Detailed Implementation Plan](#5-phase-1--detailed-implementation-plan)
6. [Phase 2 — On-Chain Donation Recording + Webhook Integration](#6-phase-2--on-chain-donation-recording--webhook-integration)
7. [Phase 3 — NGO Registry, Cohort Hashing & Disbursement Program](#7-phase-3--ngo-registry-cohort-hashing--disbursement-program)
8. [Phase 4 — Attestation Enhancements & Verification](#8-phase-4--attestation-enhancements-verification)
9. [Phase 5 — Hardening, Devnet Testing & Mainnet Readiness](#9-phase-5--hardening-devnet-testing--mainnet-readiness)
10. [Cross-Cutting Concerns](#10-cross-cutting-concerns)

---

## 1. Current State Assessment

### What exists today

| Layer | Status | Details |
|-------|--------|---------|
| **Frontend** | Mock-complete | React+Vite+TS app with mock wallet, mock payments, mock Solana explorer links. Uses `mockTxHash()` — non-cryptographic. No real `@solana/web3.js` integration. |
| **Backend** | Fully Implemented REST API | Express+Prisma+TS. Complete REST API implemented: `/api/auth`, `/api/donor`, `/api/charity`, `/api/admin`, `/api/public`, and `/api/webhooks/razorpay`. Features AES-256 document encryption & SHA-512 hashing (`documentService.ts`), status allocation service (`statusService.ts`), receipt PDF generation (`receiptService.ts`), and SIEM audit logging (`auditLogService.ts`). Explicit blockchain integration stubs (`// TODO(blockchain-team)`) are present in `razorpay.ts`, `admin.ts`, and `charity.ts`. |
| **Prisma Schema** | Aligned with SQL | Schema has been reconciled between SQL and Prisma (per DEV-A log). Includes `solanaTxHash` on `Donation`, `Disbursement`; `solanaProgramId` and `solanaVaultAddress` on `Campaign`; `sha512DocHash` and `merkleRoot` on `BeneficiaryCohort`. |
| **Blockchain** | **Phase 2 Complete** | Anchor program deployed to devnet + backend service layer implemented + all tests passing + status update hooks for all flows (ALLOCATED, DISBURSED, DELIVERED) verified |
| **Security** | Documented but unimplemented | SECURITY.md documents STRIDE model, compliance mapping, and controls. All blockchain controls marked "Not Implemented". |

### Key Prisma fields relevant to blockchain

These fields already exist in the schema and are our integration points:

- `Donation.solanaTxHash` — stores the Solana tx hash after on-chain recording
- `Donation.donorIdHash` — stores the SHA-512 hashed donor ID (not raw userId)
- `Disbursement.solanaTxHash` — stores disbursement on-chain tx hash
- `Disbursement.blockscoutUrl` — **DISCREPANCY** (see §2)
- `Campaign.solanaProgramId` — stores the deployed program address per campaign
- `Campaign.solanaVaultAddress` — stores the PDA vault address per campaign
- `BeneficiaryCohort.sha512DocHash` — stores the SHA-512 hash of cohort proof docs
- `BeneficiaryCohort.merkleRoot` — stores the Merkle root for cohort member verification
- `Document.sha512Hash` — stores the SHA-512 hash of uploaded documents

---

## 2. Architecture vs Implementation — Discrepancies & Decisions

### ⚠️ Critical Discrepancy: Memo Program vs Custom Anchor Programs

| Source | Says |
|--------|------|
| **Architecture doc (Tier 3)** | Custom Anchor+Rust programs: "Donation Registry Program", "NGO & Cohort Registry Program", "Disbursement Program" — three separate on-chain programs with structured data accounts |
| **Security docs** (`security_details.md`, `security_claude.md`, `SECURITY.md`) | "Use Solana Memo Program (no custom contract)" — explicitly states using only `MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr` for hash anchoring, SHA-256 hashing |
| **Prisma schema** | Has `solanaProgramId` and `solanaVaultAddress` on Campaign — implies per-campaign deployed programs, which only makes sense with custom Anchor programs |
| **Architecture data flow** | Describes function calls like `create_donation_record()`, `mark_allocated()`, `record_disbursement()`, `store_cohort_hash()` — these are custom Anchor instruction signatures, NOT Memo Program calls |

**Analysis:**
The security docs were written earlier (reflecting a simpler "just use Memo Program" approach), while the architecture doc describes a more sophisticated system with custom Anchor programs. The Prisma schema's `solanaProgramId` field also confirms the architecture doc's direction. The dev logs do not resolve this — no blockchain code has been started.

> **✅ DECIDED: Single Unified Anchor Program (Option C)**
>
> **Decision date:** 2026-08-15 — agreed by blockchain team.
>
> We will implement a **single unified Anchor program** (`traceit`) with multiple instructions (record_donation, register_ngo, register_cohort, record_disbursement, update_status) rather than three separate program deployments (architecture doc) or the Memo Program approach (security docs).
>
> **Rationale:**
> - One program with multiple instructions instead of three separate deployments
> - Reduces deployment/upgrade complexity — single program ID, single upgrade authority
> - Still gets structured data accounts and on-chain status transition enforcement
> - Keeps it manageable for a group project
> - Best trade-off between the architecture doc's vision and practical implementation
> - `solanaProgramId` and `solanaVaultAddress` fields on Campaign remain meaningful
> - The `blockchainService.ts` abstraction layer hides on-chain details from the rest of the backend
>
> **Rejected alternatives:**
> - *Option A (Memo Program Only):* Insufficient — no structured queries, no on-chain invariant enforcement, `solanaProgramId`/`solanaVaultAddress` fields unused
> - *Option B (Three Separate Programs):* Over-engineered — triple the deployment/upgrade overhead with no practical benefit for this project's scale

### ⚠️ Discrepancy: SHA-256 vs SHA-512

| Source | Says |
|--------|------|
| **Architecture doc** | SHA-512 everywhere: "All document integrity hashes use SHA-512", "SHA-512(userId + secret)" for donor ID hash |
| **Security docs** | SHA-256: "SHA256(donationId + amount + timestamp + beneficiaryId)" for Memo Program anchoring |
| **Backend `hashService.ts`** | Implements SHA-512 and HMAC-SHA-512 (no SHA-256) |

**Decision Status: Already Decided by Implementation**  
The backend already has SHA-512 in `hashService.ts`. The architecture doc consistently uses SHA-512. The security docs' SHA-256 reference appears to be an earlier draft or a generic reference.

**→ Use SHA-512 for all document/data integrity hashes.** This is consistent with the codebase and architecture doc.

### ⚠️ Discrepancy: `blockscoutUrl` on Disbursement

The Prisma schema has `Disbursement.blockscoutUrl`. Blockscout is an Ethereum/EVM block explorer. Solana uses Solana Explorer or Solscan. This field name suggests either:
- A remnant from an earlier EVM-based design
- A generic "explorer URL" field with a misleading name

**→ Recommended:** Treat this as a generic explorer URL field. Do not rename (schema changes are DEV-B's responsibility), but populate it with Solana Explorer URLs: `https://explorer.solana.com/tx/{hash}?cluster=devnet`.

### ⚠️ Discrepancy: `BENEFICIARY` role missing from Prisma `UserRole` enum

| Source | Says |
|--------|------|
| **Architecture doc** | Three roles: Donor, Beneficiary, Charity/NGO (plus Admin) |
| **Prisma schema** | `UserRole` enum: `DONOR`, `CHARITY`, `ADMIN`, `AUDITOR` — **no BENEFICIARY** |
| **Architecture doc** | Describes Beneficiary Dashboard, KYC onboarding, ZK proof submission |

**Beneficiary Role Consideration:**  
The architecture describes a Beneficiary role, but the current schema uses AUDITOR instead. Beneficiary identification and verification will need to be handled through existing profile structures or the AUDITOR role.

**Open Question:** How should beneficiary identification and verification be implemented? Options include: extending the Profile model, using the AUDITOR role, or implementing through delivery attestations with keyed hashes.

> **→ DECIDED for Phase 4:** Implement beneficiary identification via keyed hashes in delivery attestations using NGO_SECRET-based approach: `hash = SHA512(beneficiaryId + NGO_SECRET)`. This preserves privacy while allowing NGOs to verify beneficiary receipt without exposing beneficiary IDs on-chain.

### ⚠️ Discrepancy: ZK Compression (Light Protocol)

The architecture doc mentions "ZK Compression (Light Protocol)" for high-volume audit log entries. This is a very new, still-evolving technology on Solana.

**→ Recommended:** Defer ZK Compression to Phase 5 or post-MVP. It adds significant complexity, and the cost savings only matter at scale. For MVP, standard Solana accounts are sufficient. Mark as future optimization.

### ✅ Resolution: Anon Aadhaar ZK Proof Verification Approach

The architecture mentions "The proof is verified on-chain by the Solana program." However, Anon Aadhaar is an Ethereum/EVM-based ZK system with no production Solana verifier available.

**→ DECIDED:** Verify ZK proofs off-chain in the backend and record the verification result on-chain (hash of proof + verification timestamp). This approach:
- Is practical and feasible with existing technology
- Doesn't require porting complex ZK verifiers to Solana BPF
- Maintains the audit trail benefit by recording verification results on-chain
- Aligns with the architecture's attestation model for storing verification proofs

**Implementation:** In Phase 4, implement off-chain ZK proof verification for beneficiary validation and store verification attestations on-chain via an instruction such as `store_verification_attestation`.

---

## 3. Design Concerns & Recommendations

### 3.1 Do we actually need custom on-chain programs?

**Concern:** The architecture document describes three custom Anchor programs. For a platform that uses blockchain purely as an "immutable audit ledger" (its own words), custom programs are arguably over-engineered. The Memo Program + backend-signed hashes achieve the same audit trail with zero smart contract risk.

**Counter-argument:** Custom programs allow on-chain enforcement of status transitions (PENDING → SUCCESS → ALLOCATED → DISBURSED → DELIVERED), which the Memo Program cannot do. They also allow structured on-chain data that can be queried without an indexer.

**Recommendation:** If the team wants demonstrable smart contract work (likely important for a group project), go with Option C (single unified program). If the goal is purely functional, the Memo Program is sufficient and dramatically simpler.

### 3.2 Gas/Storage Costs

Solana costs per transaction are low (~$0.00025), but **account rent** for data storage is the real cost:
- Each on-chain account requires rent (~0.00089 SOL per byte per epoch, or ~0.002 SOL minimum for a small account)
- If every donation creates an on-chain data account, costs scale linearly with donations
- For 10,000 donations: ~20 SOL in rent alone (~$3,000 at current prices)

**Recommendations:**
- Keep on-chain accounts minimal — store only hashes, not full records
- Use PDAs (Program Derived Addresses) keyed by donation ID to avoid key management
- Consider closing/relinquishing accounts after finalization to reclaim rent
- For devnet: irrelevant (free airdrop). For mainnet: factor this into the cost model

### 3.3 On-Chain/Off-Chain Consistency

The backend writes to Postgres first, then submits to Solana. This creates a consistency window:

**Failure scenarios:**
1. Postgres write succeeds, Solana tx fails → Donation exists in DB with no on-chain proof
2. Solana tx succeeds, Postgres update fails → On-chain record exists but DB doesn't reflect it
3. Solana tx succeeds but confirmation times out → Ambiguous state

**Recommendations:**
- Implement a **retry queue** for failed Solana submissions (Bull/BullMQ or similar)
- Store Solana submission status separately: `PENDING_ONCHAIN`, `CONFIRMED_ONCHAIN`, `FAILED_ONCHAIN`
- The `solanaTxHash` field being null indicates "not yet submitted"
- Implement an **idempotency key** (use `donationId` as the PDA seed) so retries don't create duplicates
- Build a **reconciliation job** that periodically checks for DB records missing on-chain confirmation

### 3.4 Backend Wallet / Keypair Security

The architecture mentions "Solana master keypair" in AWS Secrets Manager. The backend needs a funded wallet to sign and submit transactions.

**Recommendations:**
- **Never commit the keypair to git** — use environment variable or secrets manager
- Use a **dedicated service wallet** (not a personal wallet)
- Implement **transaction signing isolation** — the keypair should only be loaded by the blockchain service module
- For devnet: airdrop SOL. For mainnet: fund via a controlled process
- Consider a **multi-sig** approach for high-value operations (future scope)

---

## 4. Cross-Team Dependencies & Mocking Strategy

### Dependencies on Other Team Members

| Dependency | Owner | What Blockchain Needs | Can We Mock? | Status & Integration Details |
|-----------|-------|----------------------|-------------|------------------------------|
| **Database (Postgres + Prisma)** | DEV-B | Running database to read/write `solanaTxHash`, donation records, etc. | ✅ Yes | Schema & Prisma client complete. Can use Postgres or mock client for local dev. |
| **Razorpay Webhook** | DEV-A/B | Webhook handler that triggers on-chain recording after payment success | ✅ Already Implemented | `backend/src/routes/webhooks/razorpay.ts` is live with signature verification & contains `// TODO(blockchain-team)` hook at L199. |
| **Auth + JWT middleware** | DEV-A | `requireAuth` and `requireRole` middleware for protected endpoints | ✅ Already Implemented | Implemented in `backend/src/middleware/requireAuth.ts` and `requireRole.ts`. |
| **HashService** | DEV-A/B | SHA-512 and HMAC-SHA-512 implementations | ✅ Already Implemented | `backend/src/services/hashService.ts` is live and used across backend services. |
| **Storage & Document Upload** | DEV-B | Document upload flow producing SHA-512 hash to anchor on-chain | ✅ Already Implemented | `backend/src/services/documentService.ts` encrypts (AES-256) & computes SHA-512 hash; cohort proof upload populates `sha512DocHash`. |
| **NGO Approval Flow** | DEV-A/B | Admin approves NGO → triggers on-chain NGO registration | ✅ Already Implemented | `POST /api/admin/ngos/:id/approve` is live in `backend/src/routes/admin.ts`. |
| **Disbursement Approval Flow** | DEV-A/B | Admin approves disbursement → triggers on-chain disbursement recording | ✅ Already Implemented | `POST /api/admin/disburse/:id/approve` is live in `backend/src/routes/admin.ts` with `// TODO(blockchain-team)` hook at L40. |
| **Frontend Wallet Integration** | Frontend team | Phantom wallet connection for SIWS and transaction signing | ✅ Yes | Backend service wallet signs all transactions (backend-initiated). Frontend wallet only needed for Phase 4 redemption. |

### What We Can Build Independently

The blockchain team can build and test **everything** independently by:
1. Creating a `blockchainService.ts` with a clean interface
2. Writing standalone test scripts that call the service directly
3. Using devnet for all Solana interactions
4. Mocking Prisma calls with in-memory objects or SQLite

The integration with the rest of the backend is a thin layer — the blockchain service accepts plain data (IDs, amounts, hashes) and returns transaction hashes.

---

## 5. Phase 1 — Detailed Implementation Plan

**Goal:** Set up the complete Solana development environment, scaffold the Anchor project with the unified smart contract program, build the `blockchainService.ts` backend abstraction, and verify end-to-end with devnet tests.

**Duration:** ~1–2 weeks  
**Depends on:** Nothing (fully independent)  
**Produces:** A working Anchor program on devnet + a backend service that can record donations on-chain

---

### 5.1 Development Environment Setup

#### 5.1.1 Install Solana CLI + Anchor Framework

**Tools required:**
```
solana-cli >= 1.18.x (or 2.x if stable)
anchor-cli >= 0.30.x
rustc >= 1.75.0 (via rustup)
node >= 20.x (already present)
```

**Steps:**

1. **Install Rust (if not present):**
   ```bash
   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
   source $HOME/.cargo/env
   rustup component add rustfmt clippy
   ```

2. **Install Solana CLI:**
   ```bash
   sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"
   export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"
   ```

3. **Configure for Devnet:**
   ```bash
   solana config set --url https://api.devnet.solana.com
   solana-keygen new --outfile ~/.config/solana/devnet-traceit.json
   solana config set --keypair ~/.config/solana/devnet-traceit.json
   solana airdrop 5  # Get devnet SOL for testing
   ```

4. **Install Anchor CLI:**
   ```bash
   cargo install --git https://github.com/coral-xyz/anchor avm --force
   avm install latest
   avm use latest
   ```

5. **Verify installation:**
   ```bash
   solana --version
   anchor --version
   rustc --version
   ```

#### 5.1.2 Project Directory Structure

Create the blockchain subproject within the existing repo:

```
Trace-It/
├── blockchain/                    # NEW — all blockchain code lives here
│   ├── Anchor.toml                # Anchor project config
│   ├── Cargo.toml                 # Rust workspace
│   ├── programs/
│   │   └── traceit/               # Single unified program
│   │       ├── Cargo.toml
│   │       └── src/
│   │           ├── lib.rs         # Program entrypoint + module declarations
│   │           ├── instructions/  # One file per instruction
│   │           │   ├── mod.rs
│   │           │   ├── record_donation.rs
│   │           │   ├── register_ngo.rs
│   │           │   ├── register_cohort.rs
│   │           │   ├── record_disbursement.rs
│   │           │   └── update_status.rs
│   │           ├── state/         # Account data structures
│   │           │   ├── mod.rs
│   │           │   ├── donation_record.rs
│   │           │   ├── ngo_record.rs
│   │           │   ├── cohort_record.rs
│   │           │   └── disbursement_record.rs
│   │           └── errors.rs      # Custom error codes
│   ├── tests/                     # Anchor integration tests (TypeScript)
│   │   └── traceit.ts
│   ├── migrations/
│   │   └── deploy.ts
│   └── package.json               # JS deps for tests (anchor, web3.js, chai)
├── backend/
│   └── src/
│       └── services/
│           └── blockchainService.ts  # NEW — backend integration layer
```

---

### 5.2 Anchor Program — `traceit` (Rust)

#### 5.2.1 Initialize the Anchor project

```bash
cd /home/aaditya/projects/Trace-It
mkdir blockchain && cd blockchain
anchor init traceit --javascript  # or --typescript for test files
# This creates the full Anchor scaffold
```

Then restructure `programs/traceit/src/` into the module layout shown above.

#### 5.2.2 On-Chain Data Accounts (State)

Define these account structs in `state/`:

**`donation_record.rs`**
```rust
use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct DonationRecord {
    /// The off-chain donation UUID (stored as 36 bytes)
    #[max_len(36)]
    pub donation_id: String,

    /// SHA-512 hash of (userId + secret) — never store raw userId
    #[max_len(128)]
    pub donor_id_hash: String,

    /// NGO profile ID
    #[max_len(36)]
    pub ngo_id: String,

    /// Campaign/project ID
    #[max_len(36)]
    pub campaign_id: String,

    /// Donation amount in paisa (INR * 100)
    pub amount_paisa: u64,

    /// Currency code (always "INR")
    #[max_len(3)]
    pub currency: String,

    /// Unix timestamp of the donation
    pub timestamp: i64,

    /// Current status: 0=Initiated, 1=Success, 2=Allocated, 3=Disbursed, 4=Delivered
    pub status: u8,

    /// SHA-512 hash of the full donation record for tamper detection
    #[max_len(128)]
    pub record_hash: String,

    /// Bump seed for PDA derivation
    pub bump: u8,
}
```

#### 5.2.3 Instructions

**`record_donation.rs`** — The core instruction for Phase 1

```rust
use anchor_lang::prelude::*;
use crate::state::DonationRecord;
use crate::errors::TraceItError;

#[derive(Accounts)]
#[instruction(
    donation_id: String,
    donor_id_hash: String,
    ngo_id: String,
    campaign_id: String,
    amount_paisa: u64,
    currency: String,
    timestamp: i64,
    record_hash: String,
)]
pub struct RecordDonation<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + DonationRecord::INIT_SPACE,
        seeds = [b"donation", donation_id.as_bytes()],
        bump,
    )]
    pub donation_record: Account<'info, DonationRecord>,

    #[account(mut)]
    pub authority: Signer<'info>,  // Backend service wallet

    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<RecordDonation>,
    donation_id: String,
    donor_id_hash: String,
    ngo_id: String,
    campaign_id: String,
    amount_paisa: u64,
    currency: String,
    timestamp: i64,
    record_hash: String,
) -> Result<()> {
    // Validate inputs
    require!(donation_id.len() <= 36, TraceItError::InvalidInput);
    require!(donor_id_hash.len() <= 128, TraceItError::InvalidInput);
    require!(amount_paisa > 0, TraceItError::InvalidAmount);
    require!(currency.len() <= 3, TraceItError::InvalidInput);
    require!(record_hash.len() <= 128, TraceItError::InvalidInput);

    let record = &mut ctx.accounts.donation_record;
    record.donation_id = donation_id;
    record.donor_id_hash = donor_id_hash;
    record.ngo_id = ngo_id;
    record.campaign_id = campaign_id;
    record.amount_paisa = amount_paisa;
    record.currency = currency;
    record.timestamp = timestamp;
    record.status = 1; // SUCCESS — we only record confirmed donations
    record.record_hash = record_hash;
    record.bump = ctx.bumps.donation_record;

    msg!("TraceIt: Donation recorded on-chain: {}", record.donation_id);

    Ok(())
}
```

**`update_status.rs`** — For status transitions (ALLOCATED, DISBURSED, DELIVERED)

```rust
use anchor_lang::prelude::*;
use crate::state::DonationRecord;
use crate::errors::TraceItError;

#[derive(Accounts)]
#[instruction(donation_id: String)]
pub struct UpdateDonationStatus<'info> {
    #[account(
        mut,
        seeds = [b"donation", donation_id.replace("-", "").as_bytes()],
        bump = donation_record.bump,
    )]
    pub donation_record: Account<'info, DonationRecord>,

    #[account(mut)]
    pub authority: Signer<'info>,  // Backend service wallet
}

pub fn handler(
    ctx: Context<UpdateDonationStatus>,
    _donation_id: String,
    new_status: u8,
) -> Result<()> {
    let record = &mut ctx.accounts.donation_record;

    // Enforce valid status transitions
    let valid_transition = match (record.status, new_status) {
        (1, 2) => true,  // SUCCESS -> ALLOCATED
        (2, 3) => true,  // ALLOCATED -> DISBURSED
        (3, 4) => true,  // DISBURSED -> DELIVERED
        _ => false,
    };

    require!(valid_transition, TraceItError::InvalidStatusTransition);

    record.status = new_status;

    msg!("TraceIt: Donation {} status updated to {}", record.donation_id, new_status);

    Ok(())
}
```

#### 5.2.5 Anchor Integration Tests

Create `tests/traceit.ts`:

```typescript
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Traceit } from "../target/types/traceit";
import { expect } from "chai";
import crypto from "crypto";

describe("traceit", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.Traceit as Program<Traceit>;

  const donationId = "d1234567-89ab-cdef-0123-456789abcdef";
  const donorIdHash = crypto.createHash("sha512")
    .update("user123" + "test_secret")
    .digest("hex");
  const ngoId = "ngo12345-89ab-cdef-0123-456789abcdef";
  const campaignId = "camp1234-89ab-cdef-0123-456789abcdef";
  const amountPaisa = new anchor.BN(50000); // ₹500
  const currency = "INR";
  const timestamp = new anchor.BN(Math.floor(Date.now() / 1000));
  const recordHash = crypto.createHash("sha512")
    .update(`${donationId}${amountPaisa}${timestamp}${ngoId}`)
    .digest("hex");

  it("Records a donation on-chain", async () => {
    const [donationPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("donation"), Buffer.from(donationId)],
      program.programId
    );

    const tx = await program.methods
      .recordDonation(
        donationId,
        donorIdHash,
        ngoId,
        campaignId,
        amountPaisa,
        currency,
        timestamp,
        recordHash
      )
      .accounts({
        donationRecord: donationPda,
        authority: provider.wallet.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc({ commitment: "confirmed" });

    console.log("Transaction signature:", tx);

    // Fetch the account and verify
    const account = await program.account.donationRecord.fetch(donationPda);
    expect(account.donationId).to.equal(donationId);
    expect(account.donorIdHash).to.equal(donorIdHash);
    expect(account.ngoId).to.equal(ngoId);
    expect(account.amountPaisa.toNumber()).to.equal(50000);
    expect(account.status).to.equal(1); // SUCCESS
    expect(account.recordHash).to.equal(recordHash);
  });

  it("Prevents duplicate donation recording (idempotency)", async () => {
    const [donationPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("donation"), Buffer.from(donationId)],
      program.programId
    );

    try {
      await program.methods
        .recordDonation(
          donationId, donorIdHash, ngoId, campaignId,
          amountPaisa, currency, timestamp, recordHash
        )
        .accounts({
          donationRecord: donationPda,
          authority: provider.wallet.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
      expect.fail("Should have thrown — duplicate PDA");
    } catch (err: any) {
      // Expected: account already initialized
      expect(err.toString()).to.include("already in use");
    }
  });

  it("Updates donation status: SUCCESS -> ALLOCATED", async () => {
    const [donationPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("donation"), Buffer.from(donationId)],
      program.programId
    );

    await program.methods
      .updateDonationStatus(donationId, 2) // ALLOCATED
      .accounts({
        donationRecord: donationPda,
        authority: provider.wallet.publicKey,
      })
      .rpc({ commitment: "confirmed" });

    const account = await program.account.donationRecord.fetch(donationPda);
    expect(account.status).to.equal(2); // ALLOCATED
  });

  it("Rejects invalid status transition", async () => {
    const [donationPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("donation"), Buffer.from(donationId)],
      program.programId
    );

    try {
      await program.methods
        .updateDonationStatus(donationId, 4) // Trying to jump ALLOCATED -> DELIVERED
        .accounts({
          donationRecord: donationPda,
          authority: provider.wallet.publicKey,
        })
        .rpc();
      expect.fail("Should have thrown — invalid transition");
    } catch (err: any) {
      expect(err.toString()).to.include("InvalidStatusTransition");
    }
  });
});
```

Run with:
```bash
anchor test --provider.cluster devnet
```

---

### 5.3 Backend Integration — `blockchainService.ts`

This is the bridge between the Express backend and the Solana program. It lives in `backend/src/services/`.

#### 5.3.1 Install Dependencies

```bash
cd /home/aaditya/projects/Trace-It/backend
npm install @solana/web3.js @coral-xyz/anchor
```

#### 5.3.2 Interface Design

The service provides methods for:
- `recordDonation`: Primary integration point called after Razorpay webhook confirmation
- `updateDonationStatus`: Enforces valid transitions: SUCCESS→ALLOCATED→DISBURSED→DELIVERED
- `getDonationRecord`: Fetch a donation record from the chain for verification
- `verifyDonationIntegrity`: Verify a donation's integrity by recomputing the hash and comparing to on-chain

#### 5.3.3 Configuration via Environment Variables

Add to `backend/.env.example`:

```env
# ─── Blockchain Configuration ─────────────────────────────
SOLANA_RPC_URL=https://api.devnet.solana.com
SOLANA_CLUSTER=devnet
SOLANA_PROGRAM_ID=<your_program_id_after_deployment>
SOLANA_WALLET_KEYPAIR_PATH=~/.config/solana/devnet-traceit.json
# Or as JSON array: SOLANA_WALLET_KEYPAIR_JSON=[1,2,3,...]
BLOCKCHAIN_HMAC_SECRET=your_hmac_secret_for_donor_id_hashing
```

#### 5.3.4 Singleton Initialization

Create `backend/src/services/blockchainInstance.ts`:

```typescript
import { BlockchainService } from './blockchainService';
import path from 'path';

let instance: BlockchainService | null = null;

export async function getBlockchainService(): Promise<BlockchainService | null> {
  if (instance) return instance;

  if (!process.env.SOLANA_WALLET_KEYPAIR_PATH) {
    console.warn('[Blockchain] SOLANA_WALLET_KEYPAIR_PATH not configured — blockchain service disabled. This is expected in local dev.');
    return null;
  }

  const service = new BlockchainService({
    rpcUrl: process.env.SOLANA_RPC_URL,
    walletKeypairPath: process.env.SOLANA_WALLET_KEYPAIR_PATH,
    programId: process.env.SOLANA_PROGRAM_ID!,
    hmacSecret: process.env.BLOCKCHAIN_HMAC_SECRET!,
    commitment: 'confirmed',
  });

  // Load the IDL from the blockchain build output
  const idlPath = path.resolve(
    __dirname, '..', '..', '..', 'blockchain', 'target', 'idl', 'traceit.json'
  );
  await service.init(idlPath);

  instance = service;
  return instance;
}
```

---

### 5.4 Phase 1 Verification Checklist

Before moving to Phase 2, all of these must pass:

- [ ] Anchor program compiles with `anchor build` (zero errors)
- [ ] Program deploys to devnet successfully
- [ ] `record_donation` test passes — creates on-chain account with correct data
- [ ] Idempotency test passes — duplicate `donation_id` fails gracefully
- [ ] `update_donation_status` test passes — valid transition works
- [ ] Invalid status transition test passes — rejected with `InvalidStatusTransition`
- [ ] Zero amount test passes — rejected with `InvalidAmount`
- [ ] `BlockchainService.recordDonation()` works from Node.js against devnet
- [ ] `BlockchainService.getDonationRecord()` reads back the recorded data correctly
- [ ] `BlockchainService.verifyDonationIntegrity()` returns `valid: true` for unmodified data
- [ ] Service wallet balance check works
- [ ] All keypairs/secrets are in `.gitignore` (not committed)

---

## 6. Phase 2 — On-Chain Donation Recording + Webhook Integration

**Goal:** Wire the `blockchainService` into the actual backend donation flow — specifically the Razorpay webhook handler.

**Duration:** ~1 week  
**Depends on:** Phase 1 complete (Backend Razorpay webhook handler `backend/src/routes/webhooks/razorpay.ts` is ALREADY FULLY IMPLEMENTED)

### High-Level Tasks

1. **Webhook Integration Point**  
   The Razorpay webhook route `backend/src/routes/webhooks/razorpay.ts` is live and handles `payment.captured` with signature verification, DB updates (`status: SUCCESS`), audit logging, and receipt generation. Integrate `blockchainService.recordDonation()` at **line 199** where `// TODO(blockchain-team)` is placed, and store the returned transaction hash in `Donation.solanaTxHash`.

2. **Retry Queue**  
   Implement a simple retry mechanism for failed Solana submissions. Options:
   - Bull/BullMQ job queue with Redis
   - Simple `setInterval` poller for donations with `status=SUCCESS` and `solanaTxHash=null`
   - PostgreSQL-based queue (simplest: add a `blockchainStatus` column)

3. **Public Donation Timeline API**  
   `GET /api/public/donation/:publicId` is already live in `backend/src/routes/public.ts` and selects `solanaTxHash`. Once recorded on-chain and saved in DB, the public endpoint automatically exposes the transaction hash for explorer link generation.

4. **Allocation Flow**  
   When NGO or Admin triggers donation allocation (via `statusService.ts` or `POST /api/admin/disburse/:id/approve`), invoke `blockchainService.updateDonationStatus(donationId, ALLOCATED)` to sync on-chain state.

5. **Disbursement Flow**  
   When admin approves disbursement (`POST /api/admin/disburse/:id/approve`), invoke `blockchainService.updateDonationStatus(donationId, DISBURSED)` to sync on-chain state.

6. **Delivery Attestation Flow**  
   When NGO signs delivery attestation (`POST /api/charity/attestation/sign`), invoke `blockchainService.updateDonationStatus(donationId, DELIVERED)` to sync on-chain state.

7. **Reconciliation Script**  
   A CLI script or cron job that:
   - Finds all donations with `status != INITIATED` and `solanaTxHash = null`
   - Attempts to record them on-chain
   - Logs failures for manual review

### Security Considerations

- The webhook handler validates the Razorpay HMAC signature on the raw request body BEFORE triggering blockchain writes (already implemented in `razorpay.ts`)
- The `donorIdHash` uses HMAC-SHA-512 with secret key, keeping donor identity off-chain
- All blockchain operations are recorded in `AuditLog` via `writeAuditLog()`

### Webhook & Integration Status

No mock webhook is needed — `backend/src/routes/webhooks/razorpay.ts` is ready for direct hook-in. For local testing without a live Razorpay sandbox, use a local HTTP client (Postman/curl) with a signed webhook payload or trigger `blockchainService.recordDonation()` directly from a test runner.

---

## 7. Phase 3 — NGO Registry, Cohort Hashing & Disbursement Program

**Goal:** Implement the remaining three instruction types in the Anchor program and their backend integration.

**Duration:** ~1–2 weeks  
**Depends on:** Phase 2 complete (Backend NGO approval, cohort proof upload, and disbursement routes are ALREADY FULLY IMPLEMENTED in `admin.ts` and `charity.ts`)

### High-Level Tasks

1. **`register_ngo` Instruction**  
   When admin approves an NGO (`POST /api/admin/ngos/:id/approve` in `backend/src/routes/admin.ts`), record `{ngoId, status, metadataHash}` on-chain via `blockchainService.registerNgo()`. PDA seed: `["ngo", ngoId]`.

2. **`register_cohort` Instruction**  
   When NGO uploads cohort proof (`POST /api/charity/cohorts/:id/proof` in `backend/src/routes/charity.ts`), `documentService.ts` computes `sha512DocHash`. Call `blockchainService.registerCohort()` to record `{cohortId, ngoId, sha512DocHash, beneficiaryCount}` on-chain. PDA seed: `["cohort", cohortId]`.

3. **`record_disbursement` Instruction**  
   When admin approves a disbursement (`POST /api/admin/disburse/:id/approve` in `backend/src/routes/admin.ts`), integrate `blockchainService.recordDisbursement()` at **line 40** where `// TODO(blockchain-team)` is placed. Record `{disbursementId, ngoId, cohortId, amount, timestamp}` on-chain and store `solanaTxHash`. PDA seed: `["disbursement", disbursementId]`.

4. **Backend Integration**  
   Add `registerNgo()`, `registerCohort()`, `recordDisbursement()` methods to `BlockchainService`.

5. **Document Hash Verification**  
   Implement an API endpoint that, given a document ID, re-computes its SHA-512 from S3/B2 and compares it to the on-chain hash stored in the cohort record. This is the "any auditor can verify" flow from the architecture.

### Security Considerations

- Only `ADMIN` role can trigger `register_ngo` and `record_disbursement` approval
- Only `CHARITY` role with `ACTIVE` status can create campaigns/cohorts and request disbursements
- On-chain authority check: all instructions verify the signer is the backend service wallet (`authority: Signer`)

### Open Questions

- Should NGO status updates (SUSPENDED, REJECTED) also be recorded on-chain? Architecture says `{ngo_id, status, metadata_hash}` — implies yes, but this means the NgoRecord needs to be mutable.
- Should the `merkleRoot` field on `BeneficiaryCohort` be used? A Merkle tree of beneficiary IDs would allow individual beneficiary membership proofs, but adds significant complexity.

---

## 8. Phase 4 — Attestation Enhancements & Verification

**Goal:** Enhance attestation flows and verification mechanisms per architecture_working.md Section 5.

**Duration:** ~2 weeks  
**Depends on:** Phase 3 complete

### High-Level Tasks

1. **Enhance NGO Receipt Attestation** (Section 5.1)
   - Improve the storage and verification of NGO receipt attestations
   - Ensure proper linking to donation PDAs
   - Enhance verification APIs for third-party auditors

2. **Improve Optional Delivery Attestation** (Section 5.2)  
   - Implement beneficiary identification via keyed hashes: `beneficiaryIdHash = SHA512(beneficiaryId + NGO_SECRET)`
   - Store delivery attestations with beneficiaryIdHash (not raw ID)
   - Verify beneficiary hashes match campaign registrations
   - Ensure proper audit logging and blockchain status updates for DELIVERED status

3. **Improve Attestation Verification APIs**
   - Create endpoints for verifying attestation signatures
   - Provide tools for auditors to verify NGO signatures on-chain
   - Improve UX for attestation submission/display in charity portal

4. **Implement Off-chain ZK Proof Verification** (if applicable)
   - For Anon Aadhaar or similar ZK proofs, verify off-chain
   - Store verification attestations on-chain: `{proofHash, verifiedAt, verificationResultHash}`
   - Focus on privacy-preserving verification without revealing sensitive data

### Security Considerations

- ZK proofs (if used) must be verified before recording attestations
- Beneficiary identification uses keyed hashes to preserve privacy
- All beneficiary data handling follows the same anonymity principles as donor data
- Double-attestation prevention: ensure each donation has only one receipt and one delivery attestation

### Open Questions

- What specific ZK proof approach (if any) will be used for beneficiary validation?
- How should beneficiary identification be implemented in the delivery attestation flow?

---

## 9. Phase 5 — Hardening, Devnet Testing & Mainnet Readiness

**Goal:** Production-grade hardening, comprehensive testing, and mainnet deployment preparation.

**Duration:** ~2 weeks  
**Depends on:** Phases 1–4 complete

### High-Level Tasks

1. **Security Audit of Anchor Program**  
   - Manual review of all instructions for access control, integer overflow, account validation
   - Run `anchor verify` for program verification
   - Consider running Soteria or sec3 for automated analysis

2. **Authority Management**  
   - Implement program upgrade authority with multi-sig (Squads Protocol)
   - Or make program immutable if no upgrades are planned
   - Document the upgrade/freeze decision

3. **RPC Reliability**  
   - Switch from public devnet RPC to QuickNode or Helius (as specified in architecture)
   - Implement RPC failover: if primary fails, try secondary
   - Add RPC health checks to monitoring

4. **Gas/Storage Optimization**  
   - Review account sizes — are we storing more than necessary?
   - Implement account closing for finalized records (reclaim rent)
   - Evaluate ZK Compression (Light Protocol) for high-volume records if scale warrants it

5. **Monitoring & Alerting**  
   - Log all blockchain operations to CloudWatch (per architecture)
   - Alert on: failed transactions, low wallet balance, RPC errors
   - Dashboard: tx success rate, avg confirmation time, wallet balance

6. **Mainnet Deployment Checklist**  
   - Fund mainnet wallet with SOL
   - Deploy program to mainnet-beta
   - Update `SOLANA_RPC_URL` and `SOLANA_CLUSTER` env vars
   - Verify program on Solana Explorer
   - Run smoke tests against mainnet

7. **Load Testing**  
   - Simulate burst of 100 concurrent donation recordings
   - Verify no dropped transactions
   - Measure p95 confirmation time

8. **Documentation**  
   - Program deployment runbook
   - Keypair rotation procedure
   - Incident response for blockchain failures

---

## 10. Cross-Cutting Concerns

### Access Control Summary

| Operation | Who Can Trigger | On-Chain Authority | Backend Guard |
|-----------|----------------|-------------------|---------------|
| `record_donation` | Backend (after Razorpay webhook) | Service wallet signer | Webhook HMAC verification |
| `update_donation_status` | Backend (after NGO action) | Service wallet signer | `requireRole('CHARITY')` + NGO ACTIVE status |
| `register_ngo` | Backend (after admin approval) | Service wallet signer | `requireRole('ADMIN')` |
| `register_cohort` | Backend (after NGO uploads proof) | Service wallet signer | `requireRole('CHARITY')` + NGO ACTIVE status |
| `record_disbursement` | Backend (after NGO creates batch) | Service wallet signer | `requireRole('CHARITY')` + NGO ACTIVE status |

All on-chain instructions are backend-initiated. No end-user directly calls the Solana program. The backend service wallet is the sole authority.

### Idempotency Strategy

| Operation | Idempotency Key | Mechanism |
|-----------|----------------|-----------|
| Record donation | `donation_id` (PDA seed) | `init` fails if PDA already exists |
| Register NGO | `ngo_id` (PDA seed) | `init` fails if PDA already exists |
| Register cohort | `cohort_id` (PDA seed) | `init` fails if PDA already exists |
| Record disbursement | `disbursement_id` (PDA seed) | `init` fails if PDA already exists |
| Update status | DB check before call | Read current status before submitting tx |

### Transaction Failure Handling

```
[Razorpay Webhook] → [Update DB: SUCCESS] → [Submit to Solana] → [Update DB: solanaTxHash]
                                                      ↓ (failure)
                                              [Add to retry queue]
                                                      ↓
                                              [Retry with backoff]
                                                      ↓ (permanent failure)
                                              [Alert admin, log to SIEM]
```

### Event Handling / On-Chain/Off-Chain Consistency

- **Source of truth:** The PostgreSQL database is the operational source of truth. The blockchain is the immutable audit ledger.
- **Consistency model:** Eventual consistency. Blockchain recording happens asynchronously after the DB write.
- **Verification model:** Anyone can verify by recomputing the SHA-512 hash from off-chain data and comparing to the on-chain `record_hash`.
- **Conflict resolution:** If on-chain and off-chain disagree, the on-chain record is considered the authoritative audit trail. The off-chain DB is investigated for tampering.

### Upgradeability

- **Anchor programs are upgradeable by default** — the deployer's keypair is the upgrade authority
- **Recommendation:** After stabilization, either:
  - Transfer upgrade authority to a multi-sig (Squads Protocol)
  - Or set the program to immutable (`solana program set-upgrade-authority --final`)
- **Data migration:** If account structures change, a migration instruction must be added before upgrading. Anchor does not auto-migrate.

### Testability

| Test Type | Tool | Coverage |
|-----------|------|----------|
| Unit tests (Rust) | `cargo test` | Account struct validation, error codes |
| Integration tests | `anchor test` | Full instruction execution on localnet/devnet |
| Backend unit tests | Jest/Vitest | `BlockchainService` with mocked RPC |
| Backend integration tests | Jest + devnet | End-to-end: DB → blockchain → verify |
| Reconciliation tests | Custom script | Find orphaned records, verify hashes |

### `.gitignore` Additions

Ensure these are in the project `.gitignore`:

```
# Blockchain
blockchain/target/
blockchain/.anchor/
blockchain/node_modules/
*.so
*-keypair.json
```

---

## Summary — Phase Timeline

| Phase | Duration | Key Deliverable | Dependencies |
|-------|----------|----------------|-------------|
| **Phase 1** | 1–2 weeks | Anchor program deployed to devnet + `blockchainService.ts` working | None |
| **Phase 2** | 1 week | Donation recording wired to webhook + retry queue | DEV-A webhook handler |
| **Phase 3** | 1–2 weeks | NGO, Cohort, Disbursement recording on-chain | DEV-B NGO/document flows |
| **Phase 4** | 2 weeks | Attestation enhancements & verification | Attestation flow improvements |
| **Phase 5** | 2 weeks | Security hardening + mainnet readiness | All phases complete |

---

*Last updated: 2026-09-20 to align with architecture_working.md and remove outdated ImpactToken references*