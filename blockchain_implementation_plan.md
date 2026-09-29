# Trace-It Blockchain Implementation Plan

> **Owner:** Trace-It Blockchain Engineering Team  
> **Last Updated:** 2026-09-29  
> **Canonical Status:** Active; replaces the previous account-per-business-event execution plan  
> **Current Phase:** Phase 3 — Anchor Submission Worker and Reconciliation (waiting on external AnchorBatch persistence)  
> **Architecture:** PostgreSQL-first application with asynchronous Solana audit anchoring

## 1. Purpose

This is the single execution plan for work owned exclusively by the Trace-It blockchain team. It replaces the earlier plan in which ordinary donations, donation-status transitions, and disbursements were individually recorded on Solana.

The existing implementation is a migration baseline, not discarded work. Its Solana connection, server-side wallet loading, Anchor provider, PDA patterns, transaction submission, confirmation handling, explorer links, retry-worker patterns, hash utilities, and tests should be reused where they fit the new architecture.

The blockchain team's objective is to provide a secure, asynchronous, publicly verifiable anchor for audit roots supplied by the PostgreSQL audit layer. Solana must not determine whether a donation, payment, disbursement, NGO action, cohort action, status change, or attestation succeeds.

## 2. Canonical Architecture Decisions

The following decisions are binding unless this document is deliberately amended:

1. PostgreSQL is the operational source of truth.
2. Backend business logic owns authorization, payments, status transitions, and ACID updates.
3. The backend audit-chain layer owns canonical business events and ordered audit entries.
4. The blockchain layer receives immutable anchor batches containing a deterministic identity, audit range, root, and schema version.
5. Solana stores compact anchor evidence only; it does not duplicate ordinary business records.
6. Anchor creation is asynchronous, retryable, idempotent, and outside request/response critical paths.
7. Public verification is read-only and must distinguish local-chain validity, anchor state, RPC availability, and tampering.
8. Sensitive donor, beneficiary, payment, and document data must never be placed on-chain. Only opaque identifiers, hashes, roots, ranges, and timestamps are allowed.
9. The existing individual-record instructions remain migration-era compatibility code until retirement criteria are met. They are not the target architecture.
10. No legacy blockchain path may be removed before replacement anchoring, outage behavior, historical compatibility, and verification are tested.

## 3. Target Data Flow

```text
Application / payment workflow
        -> PostgreSQL business state
        -> PostgreSQL audit-chain entry
        -> persisted immutable AnchorBatch
        -> asynchronous anchor worker
        -> Solana AnchorRecord PDA
        -> read-only public verification
```

The blockchain team begins ownership at the `AnchorBatch` contract. Creation of business records and atomic creation of audit-chain entries are external inputs.

## 4. Blockchain-Team Scope

### 4.1 Work owned by this team

- Anchor/Solana/Rust/TypeScript toolchain compatibility.
- Anchor program design, implementation, IDL generation, build, and tests.
- On-chain authority enforcement and deterministic anchor PDAs.
- Anchor payload validation, duplicate prevention, and read-back behavior.
- Blockchain client/service methods for submission, fetch, reconciliation, and verification.
- Blockchain-specific anchor worker logic: submission, confirmation, retry classification, ambiguous-result recovery, and idempotency checks.
- Blockchain-side verification of account ownership, discriminator, PDA, authority, range, root, and transaction reference.
- Historical compatibility for existing on-chain records during migration.
- Deprecation of legacy blockchain service methods after external replacement paths are proven.
- Localnet/devnet deployment, smoke tests, RPC behavior, wallet-balance monitoring requirements, and blockchain runbooks.
- Blockchain security review, including signer authority, upgrade authority, key rotation requirements, and account validation.

### 4.2 Explicitly out of scope

The following are dependencies or work owned by other teams and must not be absorbed into blockchain implementation:

- Razorpay SDK/API integration, Checkout, webhook policy, refunds, and payment reconciliation.
- PostgreSQL business models and business-state transactions.
- Canonical business-event selection and atomic audit-chain persistence.
- Backend authorization and business status rules.
- Frontend workflow implementation and UI copy.
- Production secret-manager administration, organizational wallet custody, or alert-routing ownership.
- ZK systems, tokenization, beneficiary wallets, redemption, or ImpactTokens without a separately approved product requirement.

The blockchain team may define interface requirements, review integrations, and supply fixtures, but those activities do not transfer implementation ownership.

## 5. Current Baseline

### 5.1 Confirmed working

- The unified `traceit` Anchor workspace exists.
- `anchor build` succeeds with Anchor CLI 0.29.0, Solana CLI 1.17.25, and the compatible SBF dependency lock.
- The program currently exposes:
  - `record_donation`
  - `update_donation_status`
  - `register_ngo`
  - `register_cohort`
  - `record_disbursement`
  - `store_ngo_attestation`
  - `store_delivery_attestation`
- Backend connection, provider, wallet loading, PDA helpers, transaction submission, record fetching, retry processing, and explorer-link generation exist.
- Legacy integrations exist for donations, status changes, NGO registration, cohort registration, disbursements, and attestations.

### 5.2 Known baseline defects

- Existing instructions accept an arbitrary signer and do not prove that the signer is the configured backend authority.
- `verifyAttestation()` treats account existence as validity and does not verify a cryptographic signature.
- Some attestation submissions use an empty NGO public key.
- Current retry and reconciliation data are donation-oriented, not anchor-batch-oriented.
- The program has no `AnchorConfig`, `AnchorRecord`, or `record_anchor` instruction.
- Existing individual-record transaction hashes are not suitable as the target public-proof model.

### 5.3 Legacy instruction disposition

| Existing instruction | Target treatment |
|---|---|
| `record_donation` | Stop using for new ordinary donations after replacement cutover; preserve historical read support. |
| `update_donation_status` | Stop using for operational status synchronization after outage-safe cutover. |
| `record_disbursement` | Stop using for new ordinary disbursements after cutover. |
| `register_ngo` | Retain only if a separately confirmed public NGO-registry requirement exists; always asynchronous. |
| `register_cohort` | Retain only if public cohort-proof registration is explicitly required; always asynchronous. |
| Attestation instructions | Retain only for an explicitly approved high-value consent/compliance case with real signature semantics. Otherwise migrate to batched audit anchoring. |

## 6. Interface Contracts Required From Other Teams

These are inputs to blockchain work, not deliverables owned by this team.

### 6.1 Immutable anchor-batch input

The backend/data layer must expose or persist an immutable batch containing at least:

| Field | Requirement |
|---|---|
| `batchKey` | Exactly 32 deterministic bytes, unique for the batch and stable across retries/restarts. |
| `schemaVersion` | Version of canonical audit serialization/root computation. |
| `startSequence` | First included audit sequence. |
| `endSequence` | Last included audit sequence. |
| `eventCount` | Number of included entries. |
| `auditRoot` | Exactly 64 bytes for the SHA-512 root. |
| `createdAt` | Database creation time for operations/monitoring; not trusted as on-chain time. |
| `status` | At least pending, submitting, confirmed, retryable failure, terminal failure. |

Recommended deterministic identity:

```text
batchKey = first_32_bytes(
  SHA-512("TRACEIT_ANCHOR_V1" || schemaVersion || startSequence || endSequence || eventCount || auditRoot)
)
```

All integer encodings and concatenation rules must be specified byte-for-byte in a versioned test-vector document before implementation. The blockchain team owns the compatibility specification and test vectors; the backend team owns production of batches matching it.

### 6.2 Persistence operations needed by the worker

The blockchain worker requires atomic operations to:

- claim one pending/retryable batch;
- prevent concurrent workers from submitting the same batch;
- persist attempt number and timestamps;
- persist a transaction signature or deterministic anchor address;
- record confirmed, retryable, terminal, and reconciliation-required outcomes;
- release or recover stale claims after a worker crash.

### 6.3 Cutover signals

The backend team must provide evidence that ordinary workflows succeed without Solana before the blockchain team removes legacy submission methods. Required evidence is listed in Phase 6.

## 7. Target On-Chain Design

The final field layout must be frozen in Phase 1, but the intended minimal design is:

### 7.1 `AnchorConfig` PDA

PDA seeds:

```text
["anchor_config"]
```

Proposed fields:

- `authority: Pubkey` — only signer allowed to create anchors.
- `pendingAuthority: Option<Pubkey>` — optional two-step rotation.
- `version: u16` — program/config schema version.
- `paused: bool` — emergency stop for new anchor writes.
- `bump: u8`.

Required operations:

- initialize config once;
- record anchor using the configured authority;
- optionally propose/accept authority rotation;
- optionally pause/unpause anchor writes.

If rotation and pause are not included in the first version, the omission and operational replacement must be documented before deployment.

### 7.2 `AnchorRecord` PDA

PDA seeds:

```text
["anchor", batchKey]
```

Proposed fields:

- `batch_key: [u8; 32]`
- `audit_root: [u8; 64]`
- `start_sequence: u64`
- `end_sequence: u64`
- `event_count: u32`
- `schema_version: u16`
- `authority: Pubkey`
- `anchored_at: i64` — Solana Clock timestamp.
- `bump: u8`

Required validation:

- signer equals `AnchorConfig.authority`;
- config is not paused;
- `audit_root` is not all zeroes;
- `event_count > 0`;
- `end_sequence >= start_sequence`;
- where batches contain contiguous global sequences, `event_count == end_sequence - start_sequence + 1` with checked arithmetic;
- the PDA is derived from the exact 32-byte `batch_key`;
- an existing record is never overwritten;
- all fixed-size inputs use bytes rather than variable-length hex strings.

### 7.3 Idempotency rule

Creating an already-existing AnchorRecord will fail on-chain. The client may translate this into idempotent success only after fetching the existing account and verifying every immutable field against the pending batch. An existing PDA with a different root, range, count, or schema version is a terminal integrity conflict, never a success.

## 8. Execution Phases

## Phase 0 — Baseline and Architecture Contract

**Status:** Complete (2026-09-29)  
**Goal:** Establish a reproducible legacy baseline and freeze decisions needed before the on-chain schema changes.

### Deliverables

- Keep `anchor build` green from a clean checkout with committed `Cargo.lock`.
- Align Anchor CLI, `anchor-lang`, TypeScript Anchor client, and IDL versions or document the exact supported combination.
- Restore reproducible local-validator integration tests for retained behavior.
- Record current program IDs for localnet and devnet.
- Determine whether the deployed program is upgradeable and identify the upgrade authority without exposing its secret material.
- Decide upgrade-in-place versus a new program deployment for the anchor architecture.
- Inventory historical account types and define how long legacy readers remain supported.
- Freeze the first version of:
  - anchor payload fields;
  - byte encoding;
  - deterministic `batchKey` derivation;
  - root algorithm input/output;
  - PDA seeds;
  - authority model;
  - IDL compatibility policy.
- Publish shared test vectors for at least empty/invalid input, one event, multiple events, maximum values, and altered-root cases.

### Tests and evidence

- `anchor build` exits 0.
- Rust unit tests pass.
- TypeScript tests use the same Anchor IDL/version as the program.
- At least one local-validator test creates and reads a legacy account.
- Architecture test vectors produce identical bytes and keys in Rust and TypeScript.

### Exit criteria

- No unresolved field-layout, seed, authority, upgrade, or versioning decision remains.
- The current program can be rebuilt and tested by another team member from documented commands.

### Completion record

- Supported legacy matrix: Anchor CLI, `anchor-lang`, and blockchain TypeScript client `0.29.0`; Solana CLI/`solana-program` `1.17.25`; Node.js 24; committed `Cargo.lock`.
- The backend's Anchor `0.32.1` dependency is confined to the legacy adapter. The v1 anchor client must be a version-isolated adapter generated from the new program IDL; Anchor types must not cross that boundary.
- `NO_DNA=1 npm test` passes all 17 legacy local-validator integration tests, including creation and read-back of legacy accounts.
- Localnet and live legacy devnet program ID: `5fj53usXqFvfah3x7rYo6BxQnrvBprBZsGU49XhQxzV3`.
- The previously configured devnet ID `5AFcU61X6LoQSNTcCFeEKauVsfCwfvtUDXY6XhMq7oCM` is closed and has been removed from active configuration.
- The live legacy program is upgradeable. Its ProgramData address is `7BAG1hbTUTn9xDYQ638EsQmjs9TzP1zvxCSHGq3Zv4Ds`; its public upgrade authority is `Emi2GHuHM4UnY6TqcXio3Cbfe5H1E2uukL3QgBziQSrG`.
- Deployment decision: create a new minimal anchor-only program. Preserve the legacy program and accounts for read compatibility; do not extend its business-record schema.
- Authority decision: initialization requires a compiled bootstrap authority; v1 includes pause/unpause and two-step authority rotation.
- Legacy disposition: the new program excludes legacy business instructions. Donation/status/disbursement writes stop at cutover. NGO/cohort writes may continue asynchronously only until cutover. Attestations migrate to audit batches unless separately approved by Product/Compliance.
- The normative protocol, account sizes, byte order, domains, seeds, validation, and compatibility policy are frozen in `blockchain/docs/anchor-protocol-v1.md`.
- Shared one-event, multi-event, maximum-value, invalid-input, and altered-root vectors are committed in `blockchain/tests/fixtures/anchor-protocol-v1.json` and verified by Rust and TypeScript tests.

## Phase 1 — Secure Minimal Anchor Program

**Status:** Complete (2026-09-29)  
**Goal:** Implement the smallest authority-controlled program capable of storing immutable audit anchors.

### Deliverables

- Add `AnchorConfig` state and initialization instruction.
- Add `AnchorRecord` state and `record_anchor` instruction.
- Add custom errors for unauthorized signer, paused program, invalid range/count/root, and integrity conflict where applicable.
- Implement deterministic PDA constraints and fixed-size account fields.
- Implement authority rotation/pause controls if included by the Phase 0 decision.
- Decide and implement the safe treatment of legacy write instructions:
  - secure retained instructions using the same authority configuration; or
  - exclude/deprecate them in a new deployment while preserving historical readers.
- Regenerate and commit the IDL and generated types used by the blockchain client.
- Document account sizes and rent requirements.

### Required tests

- Authorized anchor creation succeeds.
- Unauthorized signer is rejected.
- Duplicate `batchKey` cannot overwrite an account.
- Duplicate lookup is accepted by client logic only when all fields match.
- Zero root, empty batch, invalid range, count mismatch, and wrong PDA are rejected.
- Maximum supported sequences and checked-arithmetic boundaries behave correctly.
- Pause and authority rotation tests pass if implemented.
- Existing retained instructions cannot be invoked by an arbitrary signer.
- Anchor account read-back exactly matches submitted bytes.

### Exit criteria

- `anchor build` and all Anchor tests pass.
- No privileged write instruction accepts an unconstrained signer.
- IDL, program code, and client types describe the same layout.

### Completion record

- Added the separate minimal `traceit_anchor` program. The legacy `traceit` program remains unchanged for historical compatibility.
- Implemented bootstrap-authority-only config initialization, pause/unpause, two-step authority rotation, and immutable `record_anchor` creation.
- Enforced singleton config and deterministic anchor PDAs, current-authority signing, schema v1, nonzero roots, nonempty contiguous ranges, checked arithmetic, and fixed-size byte fields.
- Confirmed exact account allocations: `AnchorConfig` 77 bytes and `AnchorRecord` 167 bytes. Rent requirements and deployment-time recheck requirements are documented.
- Added generated IDL and TypeScript types under `blockchain/idl/` and `blockchain/client/`, plus an immutable-field matcher for safe duplicate classification.
- Added localnet coverage for unauthorized initialization/writes, config reinitialization, wrong PDA, invalid root/range/count/schema, exact read-back, duplicate overwrite rejection, matching/mismatching duplicate comparison, maximum `u64`, pause, and authority rotation.
- `NO_DNA=1 npm test` passes all 30 TypeScript tests across the new and legacy programs; Rust vector/unit tests and `anchor build` also pass.
- The development-only program ID is `4qLwniS2NeDrqftgb83GbYVHWVbBBbUcjDR1Ncm5GCHX`. No deployment keypair is stored in the repository. Security/DevOps must allocate the deployable ID under approved custody in Phase 5.

## Phase 2 — Anchor Client and Service Boundary

**Status:** Complete (2026-09-29)  
**Goal:** Adapt existing blockchain infrastructure into a narrow anchor submission and verification service.

### Deliverables

Add or adapt blockchain-team-owned service methods with explicit typed results:

- `deriveAnchorPda(batchKey)`
- `submitAnchorBatch(batch)`
- `fetchAnchorRecord(batchKey)`
- `verifyAnchorRecord(batch)`
- `getAnchorExplorerUrl(signature)`
- `reconcileAnchorSubmission(batch)`

Service requirements:

- validate input lengths and numeric ranges before RPC calls;
- never accept raw sensitive business data;
- use the configured server-side fee payer/authority only;
- use explicit cluster and commitment configuration;
- distinguish simulation, submission, confirmation, timeout, RPC transport, program rejection, authorization, and integrity-conflict errors;
- validate fetched account owner, data length, discriminator, PDA, and decoded fields;
- never treat a missing/undecodable account as verified;
- return stable domain results instead of leaking Anchor-specific exceptions to callers;
- support dependency injection or adapters for deterministic unit tests.

Recommended result categories:

```text
CONFIRMED
ALREADY_CONFIRMED_MATCH
PENDING_CONFIRMATION
RETRYABLE_RPC_FAILURE
RETRYABLE_BLOCKHASH_FAILURE
PROGRAM_REJECTED
UNAUTHORIZED
INTEGRITY_CONFLICT
INVALID_INPUT
```

### Required tests

- deterministic PDA derivation matches Rust test vectors;
- successful submission and read-back;
- unauthorized and invalid-input classification;
- existing matching account is idempotent success;
- existing mismatching account is an integrity conflict;
- malformed, wrong-owner, wrong-discriminator, and truncated accounts are rejected;
- timeout after possible submission enters reconciliation rather than blind retry;
- explorer URL respects configured cluster.

### Exit criteria

- Route/business code needs no Anchor-specific types.
- All blockchain outcomes are represented by stable typed results.
- Account validation follows untrusted-input rules.

### Completion record

- Added a version-isolated service under `backend/src/services/anchor/`; it uses raw `@solana/web3.js` wire encoding and does not expose Anchor runtime types to route/business code.
- Implemented `deriveAnchorPda`, `submitAnchorBatch`, `fetchAnchorRecord`, `verifyAnchorRecord`, `getAnchorExplorerUrl`, and `reconcileAnchorSubmission`.
- Added strict pre-RPC validation for byte lengths, zero roots, unsigned bounds, contiguous ranges, counts, and schema version.
- Added strict untrusted-account validation for program owner, executable flag, exact 167-byte length, discriminator, PDA, stored bump, trusted authority, schema, timestamp, and all decoded fields.
- Submission uses the configured server authority/fee payer, explicit commitment, simulation, preflight, one send, and confirmation against the same blockhash validity window.
- Added stable domain outcomes for confirmed, matching duplicate, pending confirmation, missing, retryable RPC/blockhash failures, rejection, authorization, integrity conflict, invalid account/schema, and invalid input.
- Ambiguous confirmation is never blindly retried; reconciliation checks the deterministic PDA first.
- Added dependency-injected adapters and 26 focused tests covering wire encoding, success, all validation/error paths, malformed accounts, duplicate matching/conflict, simulation ordering, confirmation timeout, reconciliation, and explorer URLs.
- The service remains disconnected from routes and business workflows. Phase 3 owns worker wiring and persisted batch state.

## Phase 3 — Anchor Submission Worker and Reconciliation

**Status:** Pending external AnchorBatch persistence; all independent Phase 2 prerequisites complete  
**Goal:** Reliably publish already-created batches without blocking application workflows.

### Deliverables

- Adapt the existing retry processor or add a dedicated anchor processor.
- Consume persisted immutable `AnchorBatch` records instead of fetching donations.
- Claim work safely so concurrent workers cannot submit the same batch.
- Simulate before submission where supported by the execution path.
- Persist attempt state before and after external calls through the provided persistence interface.
- Use bounded exponential backoff with jitter.
- Classify failures as retryable, terminal, or reconciliation-required.
- Reconcile `submitting` or ambiguous batches by deterministic PDA before creating another transaction.
- On existing PDA, verify all immutable fields before confirmation.
- Implement graceful shutdown and restart recovery.
- Add dead-letter/manual-review state after configured retry limits.
- Emit structured operational metrics/logs for:
  - oldest unanchored batch age;
  - pending/retrying/dead-letter counts;
  - confirmation latency;
  - RPC failures by class;
  - integrity conflicts;
  - authority wallet balance.

### Required tests

- RPC unavailable before submission.
- Simulation rejection.
- transaction submitted and confirmed.
- transaction submitted but confirmation times out.
- transaction confirmed while persistence update fails.
- worker crashes after claim and after submission.
- duplicate worker/duplicate retry.
- existing matching and mismatching PDA.
- retry-limit/dead-letter behavior.
- restoration after RPC recovery.

### Exit criteria

- No tested failure mode loses or mutates an audit batch.
- Ambiguous submissions are reconciled before resubmission.
- Worker downtime does not affect normal application API success.

## Phase 4 — Blockchain Verification Layer

**Status:** Pending Phases 1–3 and external local audit verification  
**Goal:** Provide the blockchain half of public, read-only audit verification.

### Deliverables

- Accept a locally verified batch/root from the backend verification layer.
- Derive and fetch the expected AnchorRecord.
- Validate RPC response, account owner, discriminator, PDA, program ID, schema version, authority, root, range, and event count.
- Optionally verify transaction confirmation/signature metadata when required by the API contract.
- Return explicit verification states:
  - `VERIFIED`
  - `LOCAL_VALID_PENDING_ANCHOR`
  - `ANCHOR_NOT_FOUND`
  - `ANCHOR_MISMATCH`
  - `ANCHOR_ACCOUNT_INVALID`
  - `RPC_UNAVAILABLE`
  - `UNSUPPORTED_SCHEMA_VERSION`
- Supply confirmed signature and explorer URL only for verified anchors.
- Provide integration fixtures and API-contract documentation to the backend/frontend teams.
- Preserve historical readers for legacy DonationRecord, NGO, cohort, disbursement, and attestation accounts while they remain supported.

### Required tests

- valid root/range/account;
- wrong root, range, count, authority, PDA, owner, discriminator, and program ID;
- missing, pending, and unsupported-version anchors;
- malformed RPC data;
- RPC outage and recovery;
- historical legacy-record read compatibility.

### Exit criteria

- Account existence alone can never produce `VERIFIED`.
- Verification clearly distinguishes unanchored, unavailable, invalid, mismatched, and verified states.
- No secret or private audit payload is required by public verification.

## Phase 5 — Devnet Deployment and Operational Hardening

**Status:** Pending Phases 1–4  
**Goal:** Demonstrate the complete blockchain-owned path on devnet and prepare it for controlled operation.

### Deliverables

- Deploy or upgrade the anchor program on devnet according to the Phase 0 decision.
- Record program ID, IDL hash/version, deployment slot, and upgrade authority policy.
- Run end-to-end devnet smoke tests using non-sensitive fixtures.
- Test primary RPC failure and configured fallback behavior if failover is in scope.
- Document fee payer, commitment, recent-blockhash handling, retry behavior, expected fees, and minimum wallet-balance threshold.
- Define wallet rotation procedure and program-authority rotation procedure.
- Define upgrade, rollback, pause, incident, and compromised-key procedures.
- Provide monitoring dashboard/alert requirements to DevOps.
- Establish a release checklist that requires build, tests, IDL compatibility, and program-ID verification.
- Perform a focused security review of:
  - authority constraints;
  - PDA seeds;
  - duplicate/idempotency handling;
  - arithmetic and account sizing;
  - untrusted RPC/account decoding;
  - upgrade authority;
  - secret boundaries.

### Exit criteria

- A fixture audit batch can be submitted, reconciled, fetched, and verified on devnet.
- RPC outage does not cause duplicate or lost anchors.
- Operational procedures are documented and reviewed.
- Mainnet is not attempted without a separate approval and deployment checklist.

## Phase 6 — Legacy Cutover and Retirement

**Status:** Pending external outage/cutover evidence and Phases 1–5  
**Goal:** Remove obsolete blockchain execution paths without losing historical verification.

### Required external evidence before cutover

- Donation/payment workflows succeed with Solana disabled.
- Disbursement and status workflows succeed with Solana disabled.
- NGO/cohort/attestation workflows selected for migration succeed with Solana disabled.
- Audit-chain entries are created and locally verified.
- Immutable AnchorBatch records are created without individual Solana writes.
- Backend and frontend no longer require individual transaction signatures for business success.

### Blockchain-team deliverables

- Disable/remove normal use of `recordDonation()`.
- Disable/remove normal use of `updateDonationStatus()`.
- Disable/remove normal use of `recordDisbursement()`.
- Remove donation/status operation handling from the blockchain retry worker.
- Retire status-parity reconciliation in favor of anchor reconciliation.
- Retain read-only historical account fetch/verification for the documented compatibility window.
- Retain or retire NGO/cohort/attestation methods according to the recorded scope decisions.
- Mark deprecated IDL/client APIs and publish migration notes.
- Document the last block/slot or release after which new individual business accounts are no longer created.
- Remove obsolete blockchain configuration only after confirming no retained path consumes it.

### Exit criteria

- No ordinary business event requires an individual Solana transaction.
- Only anchor publication and explicitly retained exceptional records can write on-chain.
- Historical records remain verifiable according to the compatibility policy.
- Legacy retry jobs cannot create new obsolete records.

## 9. Testing Strategy

### 9.1 Required layers

- Rust/Anchor unit and account-constraint tests.
- Local validator integration tests for program/client behavior.
- TypeScript service tests with mocked RPC responses and malformed-account cases.
- Worker state-machine and restart/reconciliation tests.
- Devnet smoke tests using fixtures only.
- Cross-language test vectors for batch identity, PDA derivation, and field encoding.

### 9.2 Mandatory security cases

- arbitrary signer attempts every write instruction;
- wrong program/account owner;
- wrong discriminator and truncated data;
- duplicate PDA with matching and mismatching data;
- maximum and overflow-adjacent sequences;
- zero/incorrect root;
- stale or unsupported schema version;
- RPC response corruption/unavailability;
- ambiguous confirmation and repeated retry;
- key rotation and old-authority rejection.

### 9.3 Standard commands

```bash
cd blockchain
NO_DNA=1 anchor build
NO_DNA=1 anchor test
```

Backend-side blockchain service tests should use the backend package's supported test command after its test selection and Anchor client versions are aligned.

## 10. Environment and Secret Boundaries

Expected blockchain configuration:

```env
SOLANA_RPC_URL=https://api.devnet.solana.com
SOLANA_CLUSTER=devnet
SOLANA_PROGRAM_ID=<deployed-anchor-program-id>
SOLANA_WALLET_KEYPAIR_PATH=<server-only-path>
BLOCKCHAIN_HMAC_SECRET=<server-only-secret-if-still-required>
```

Rules:

- Never commit or distribute a shared private key through the repository.
- Never expose wallet material or HMAC secrets to frontend code.
- Localnet/devnet and production authorities must be different.
- Normal backend APIs must start and function when blockchain configuration is absent.
- Only the anchor worker and explicitly retained asynchronous blockchain paths require a funded wallet.
- Production key custody, secret storage, and alert routing are implemented by Security/DevOps from blockchain-team requirements.

## 11. Cross-Team Dependency Register

| Dependency | Owning team | Needed by blockchain phase | Required interface/evidence |
|---|---|---|---|
| Canonical audit serialization and ordered chain | Backend/Data | Phases 0, 3, 4 | Versioned byte contract and verified root. |
| Immutable AnchorBatch persistence | Backend/Data | Phase 3 | Claim/update/recovery interface and stable batch fields. |
| Business workflows independent of Solana | Backend | Phase 6 | Passing outage tests. |
| Public verification API composition | Backend | Phase 4 | Supplies locally verified batch; consumes blockchain verification result. |
| Verification UI | Frontend | After Phase 4 | Consumes status/signature/explorer contract. |
| Worker deployment, secrets, and alerts | DevOps/Security | Phase 5 | Durable process, secret injection, dashboards, alert routing. |
| Product decision on NGO/cohort/attestations | Product/Compliance | Phases 0 and 6 | Written retain/deprecate decision. |

A blocked external dependency does not authorize the blockchain team to implement another team's subsystem. The team should complete all independent program, client, fixture, mock, and documentation work while reporting the exact missing contract.

## 12. Risks and Controls

| Risk | Required control |
|---|---|
| Arbitrary signer writes anchors or legacy state | Config PDA plus explicit authority constraint on every retained write. |
| Same batch submitted twice | Deterministic PDA, persisted batch identity, full field comparison on existing account. |
| Transaction succeeds but DB update fails | Reconcile deterministic PDA before any resubmission. |
| RPC returns malicious or malformed data | Validate owner, PDA, discriminator, length, schema version, and all immutable fields. |
| Hash encoding differs between teams | Versioned byte specification and cross-language fixtures. |
| Audit ranges overlap or skip entries | Backend persistence invariant plus worker preflight validation and monitoring. |
| Upgrade breaks historical clients | Versioned IDL/schema and documented compatibility window. |
| Old instructions remain insecure | Secure every retained write or retire it in the new deployment. |
| Secrets leak through logs/UI | Server-only loading, redaction, and no sensitive data in payloads. |
| Anchor backlog grows silently | Oldest-unanchored-age and dead-letter alerts. |

## 13. Overall Definition of Done

The blockchain team's migration is complete when:

- Anchor builds and tests are reproducible from a clean checkout.
- The deployed program accepts anchors only from the configured authority.
- Anchor records are minimal, immutable, deterministic, and contain no sensitive business data.
- The client validates all untrusted on-chain/RPC data.
- Submission is asynchronous, retryable, idempotent, and recoverable after ambiguous outcomes.
- A locally verified audit root can be matched to its Solana anchor with explicit verification states.
- Devnet submission, fetch, reconciliation, and verification pass end to end.
- Ordinary donations, statuses, and disbursements no longer create individual on-chain records.
- Retained NGO/cohort/attestation behavior is explicitly justified, secured, asynchronous, and documented.
- Historical on-chain records remain readable for the declared compatibility period.
- Wallet, authority, upgrade, incident, monitoring, and release procedures are documented.
- No mainnet transaction or deployment occurs without separate approval.

## 14. Immediate Next Actions

1. Obtain the Backend/Data-owned immutable `AnchorBatch` persistence and atomic claim/update/recovery interface defined in Section 6.
2. Map persisted batches into the completed `AnchorBatch` service contract without reconstructing or mutating their identity fields.
3. Add the dedicated anchor worker state machine with bounded jittered backoff, stale-claim recovery, dead-letter state, and graceful shutdown.
4. Reconcile every ambiguous or previously `submitting` batch before considering resubmission.
5. Add worker crash, duplicate-worker, persistence-failure, RPC-outage, retry-limit, and recovery tests using the injected Phase 2 adapter.
6. Define structured logs and metrics for backlog age/count, confirmation latency, RPC classes, integrity conflicts, and authority balance.

---

This document is maintained exclusively for the Trace-It Blockchain Engineering Team. Cross-team work appears only as an interface dependency or cutover prerequisite.
