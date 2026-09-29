# TraceIt — Blockchain Implementation Roadmap (Blockchain Team Scope)

> **Authors:** Blockchain Engineering Team  
> **Date:** 2026-09-29  
> **Scope:** Trace-It Smart Contracts, Hash-Chain Engine, Anchor Batching & Verification Engine  
> **Current Status:** 🎯 **Phase 2: Hash-Chain Audit Layer & Program Refactoring (IN PROGRESS)**

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

## 4. Phase 1 — Environment Baseline & Legacy Program Audit (COMPLETED)

* **Status:** ✅ **COMPLETED**
* **Delivered Artifacts:**
  - Solana CLI, Anchor CLI, and Rust environment setup configured for Devnet.
  - Initial `traceit` Anchor program deployed on Devnet with legacy instructions (`record_donation`, `update_status`, `register_ngo`, `register_cohort`, `record_disbursement`).
  - Server-side keypair loading implemented in `backend/src/services/blockchainInstance.ts`.
  - Cryptographic primitives verified in `backend/src/services/hashService.ts`.

---

## 5. Phase 2 — Hash-Chain Audit Layer & Anchor Program Refactoring (IN PROGRESS)

* **Status:** 🎯 **CURRENT PHASE**
* **Target Completion:** Immediate Sprint
* **Detailed Technical Deliverables:**

### 5.1 Smart Contract Anchor Instruction (`lib.rs`)
Implement the `record_anchor` instruction in `blockchain/programs/traceit/src/lib.rs`:

```rust
pub fn record_anchor(
    ctx: Context<RecordAnchor>,
    batch_id: String,
    audit_root: String,
    start_sequence: u64,
    end_sequence: u64,
    timestamp: i64,
) -> Result<()> {
    require!(batch_id.len() <= 36, TraceItError::InvalidInput);
    require!(audit_root.len() == 128, TraceItError::InvalidInput); // 64 bytes hex SHA-512

    let anchor = &mut ctx.accounts.anchor_record;
    anchor.batch_id = batch_id;
    anchor.audit_root = audit_root;
    anchor.start_sequence = start_sequence;
    anchor.end_sequence = end_sequence;
    anchor.timestamp = timestamp;
    anchor.bump = ctx.bumps.anchor_record;

    msg!("TraceIt: Anchor recorded for batch {}", anchor.batch_id);
    Ok(())
}
```

### 5.2 Canonical Hash-Chain Linkage
Define standard serialization format for business audit events and generate hash-chain entries:

$$H_i = \text{HashService.sha512}\left(\text{entityType} \mathbin{\Vert} \text{entityId} \mathbin{\Vert} \text{action} \mathbin{\Vert} \text{payloadHash} \mathbin{\Vert} H_{i-1}\right)$$

---

## 6. Phase 3 — Anchor Batching Engine & Worker Adaptation

* **Status:** ⏳ **PENDING (Next Phase)**
* **Detailed Technical Deliverables:**

### 6.1 Database Models (Prisma Additions)
* `AuditChain`: Stores `sequence`, `entityType`, `entityId`, `action`, `payloadHash`, `previousHash`, `currentHash`, `timestamp`.
* `AnchorBatch`: Stores `batchId`, `startSequence`, `endSequence`, `auditRoot`, `status` (`PENDING`, `SUBMITTED`, `CONFIRMED`, `FAILED`), `solanaTxHash`, `retryCount`, `createdAt`, `anchoredAt`.

### 6.2 Worker Adaptation (`blockchainRetryProcessor.ts`)
* Build batch selection query: select unanchored `AuditChain` entries where `sequence > max(anchored sequence)`.
* Compute Merkle/audit root over the batch.
* Adapt `BlockchainRetryQueue` loop to process `AnchorBatch` units with exponential backoff ($2^n \times \text{base\_delay}$).

---

## 7. Phase 4 — Blockchain Service Integration & Non-Blocking Boundary

* **Status:** ⏳ **PENDING**
* **Detailed Technical Deliverables:**

### 7.1 Blockchain Service Methods (`blockchainService.ts`)
* `submitAnchorBatch(batch: AnchorBatch): Promise<string>` — Executes Anchor RPC call for `record_anchor`.
* `fetchAnchorRecord(batchId: string): Promise<AnchorRecord>` — Reads PDA account state from Solana.
* Ensure all methods isolate RPC exceptions and return standard error structures rather than interrupting caller workflows.

---

## 8. Phase 5 — Public Verification Engine & Outage Testing

* **Status:** ⏳ **PENDING (Final Phase)**
* **Detailed Technical Deliverables:**

### 8.1 Verification Engine (`verificationService.ts`)
* Endpoint `GET /api/public/verify/audit/:entityId`:
  1. Read all `AuditChain` records for `entityId`.
  2. Verify sequential linkage ($H_i$ matches calculated hash from $H_{i-1}$).
  3. Locate `AnchorBatch` covering the entity's audit sequence.
  4. Fetch on-chain `AnchorRecord` from Solana RPC using PDA `["anchor", batchId]`.
  5. Compare database `auditRoot` against on-chain `audit_root`.
  6. Return verification status response (`VERIFIED`, `PENDING_ANCHOR`, `TAMPER_DETECTED`, `UNANCHORED`).

### 8.2 Test Matrix
* **Outage Test:** Run full audit log creation while `SOLANA_RPC_URL` is unreachable; verify 0 application errors.
* **Idempotency Test:** Submit duplicate anchor transaction for existing `batchId`; verify PDA rejection is handled cleanly.
* **Tamper Detection Test:** Modify payload of a historical `AuditChain` record; verify verification engine detects hash mismatch.

---

## 9. Technical Specifications & Data Layouts

### On-Chain Account Layout (`AnchorRecord`)
```rust
#[account]
#[derive(InitSpace)]
pub struct AnchorRecord {
    #[max_len(36)]
    pub batch_id: String,       // 36 bytes UUID
    #[max_len(128)]
    pub audit_root: String,     // 128 chars hex (SHA-512)
    pub start_sequence: u64,    // 8 bytes
    pub end_sequence: u64,      // 8 bytes
    pub timestamp: i64,         // 8 bytes Unix timestamp
    pub bump: u8,               // 1 byte PDA bump
}
```

### PDA Derivation Formula
$$\text{PDA} = \text{findProgramAddress}\left(\left[\text{"anchor"}, \text{batch\_id.as\_bytes()}\right], \text{program\_id}\right)$$

---

*This roadmap is maintained exclusively for the Trace-It Blockchain Engineering Team.*