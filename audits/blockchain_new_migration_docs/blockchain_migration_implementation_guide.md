# Trace-It Blockchain Migration Implementation Guide

## 1. Purpose

This is a migration of the existing Trace-It blockchain implementation, not a greenfield rewrite. The current implementation already provides an Anchor program, Solana connection and wallet handling, SHA-512/HMAC-SHA-512 hashing, PDA-based accounts, transaction submission, retry processing, verification helpers, and integrations for donations, NGO registration, cohorts, disbursements, and attestations.

The migration is required because PostgreSQL already owns Trace-It's operational state and business rules. Recording every ordinary business event separately on Solana duplicates PostgreSQL data, creates consistency and operational overhead, and does not enforce the application rules that matter. The target is PostgreSQL-first: business operations complete in PostgreSQL, audit events form a tamper-evident hash chain, and periodic roots are submitted to Solana for external/public integrity evidence.

The objective is to preserve approximately 70-80% of the existing blockchain work. Reuse existing infrastructure wherever possible, adapt individual-recording code into anchor code, and remove individual blockchain recording from the application's critical path only after the replacement path is tested.

## 2. Target Architecture

### PostgreSQL

PostgreSQL is the operational source of truth for:

- Donations and donation status
- Payment/donation confirmation state
- Razorpay order and payment identifiers
- Payment amount, currency, provider status, and required timestamps
- Provider event identity needed for webhook idempotency, where the final schema requires it
- NGO data and NGO status
- Campaigns and campaign ownership
- Cohorts and cohort documents
- Disbursements and disbursement status
- Attestations
- Financial amounts and application transaction references
- Operational audit events

Business validation, authorization, status transitions, and ACID updates remain in the backend and database.

### Hash-Chain Audit Layer

Add an audit-chain representation alongside the existing `AuditLog` system. Each relevant event must have a deterministic representation, a data hash, a reference to the previous hash, and enough metadata to verify ordering and integrity. This layer provides immediate tamper evidence and audit history even when Solana or an RPC endpoint is unavailable.

The existing `backend/src/services/hashService.ts` primitives are the intended cryptographic foundation. Do not change from SHA-512/HMAC-SHA-512 without a demonstrated compatibility or security reason.

### Blockchain Anchoring Layer

Solana becomes an asynchronous integrity and public-verification layer. A periodic job collects a deterministic range or batch of audit-chain entries, calculates an audit/Merkle root, and submits a minimal anchor record. The resulting transaction signature is stored in PostgreSQL and exposed through verification APIs.

Solana must not own ordinary application state and must not be required for donation, disbursement, status, attestation, NGO, or cohort workflows to complete.

### Payment boundary

Payment-provider state follows the same ownership rule. Razorpay is the payment provider; PostgreSQL owns the durable Trace-It payment/donation record and its relationship to the internal donor, NGO, campaign, amount, and status. Existing schema fields such as `Donation.razorpayOrderId`, `Donation.razorpayPaymentId`, `Donation.amount`, `Donation.currencyCode`, and `Donation.status` are the starting points. Provider timestamps, failure/refund details, and webhook event identity must be added or persisted only if the confirmed integration requires them; do not invent column names.

The required dependency direction is:

```text
Razorpay -> PostgreSQL -> Audit Chain -> Solana
```

Neither `Razorpay -> Solana` nor `Razorpay -> Blockchain -> PostgreSQL` is a required application flow. A successful payment does not require an immediate Solana transaction.

## Payment Provider Integration — Razorpay

The payment path must be integrated upstream of the blockchain migration:

```text
Donor
       -> Trace-It Frontend
       -> Trace-It Backend
       -> Razorpay Order Creation
       -> Razorpay Checkout
       -> Payment Confirmation / Webhook
       -> Server-Side Verification
       -> PostgreSQL Payment + Donation State
       -> Audit Event
       -> Hash Chain
       -> Periodic Anchor Batch
       -> Solana
```

The current repository does not yet contain a live Razorpay SDK/API client. `backend/src/services/donationService.ts:createRazorpayOrder()` returns a locally generated mock order, and `frontend/src/services/mockPayments.ts` returns local payment-shaped IDs that are not used to correlate the backend donation. `backend/src/routes/webhooks/razorpay.ts` does contain webhook-shaped handling for payment capture, failure, and refund processing, including raw-body HMAC verification.

The migration must separate these responsibilities without discarding compatible work:

- Razorpay integration creates orders, runs Checkout, and supplies provider confirmations/events.
- Server-side verification establishes whether a provider response or webhook is authentic and matches the server-created order/payment context.
- PostgreSQL persists the Trace-It payment/donation state and Razorpay identifiers.
- Audit logging records business-significant payment transitions.
- The hash-chain worker makes those audit events tamper-evident.
- Solana receives periodic roots or anchor batches, not individual payment records.

The confirmed Razorpay contract is limited to the audited provider documentation and repository behavior. The documented Checkout success fields are `razorpay_payment_id`, `razorpay_order_id`, and `razorpay_signature`; Checkout verification uses the server-created order ID and payment ID with the payment key secret. Webhook verification uses the raw request body, `X-Razorpay-Signature`, and the webhook secret. The documented `x-razorpay-event-id` header is the provider event identity for durable duplicate handling. Exact account configuration, SDK choice, selected webhook events, refund behavior, and any additional fields remain implementation questions.

### Payment-to-audit-chain boundary

A successfully verified Razorpay payment becomes an application event, not an individual blockchain transaction:

```text
Razorpay payment confirmed
                            -> PostgreSQL payment/donation state updated
                            -> payment audit event created
                            -> audit event enters the hash chain
                            -> future anchor batch includes the event
                            -> anchor root is submitted to Solana
```

The payment workflow must complete even when Solana RPC is unavailable, Solana submission fails, the anchor worker is delayed, or an anchor batch requires retry. A payment failure, invalid signature, or provider API failure must not create a false successful PostgreSQL state or a success audit event.

## 3. What You Are Keeping

| Existing component | Existing location | Action | Why |
|---|---|---|---|
| SHA-512 implementation | `backend/src/services/hashService.ts`, `HashService.sha512()` | Keep | Provides deterministic record, document, message, and future audit-entry hashing. |
| Donor privacy hashing | `backend/src/services/hashService.ts`, `HashService.hmacSha512()` | Keep | Keeps raw donor IDs off-chain and can protect sensitive values used in audit data. |
| Beneficiary encryption utilities | `backend/src/services/hashService.ts`, `encryptBeneficiaryId()` and `decryptBeneficiaryId()` | Keep | Existing server-side handling pattern remains useful for sensitive identifiers. |
| Solana connection and Anchor provider | `backend/src/services/blockchainService.ts`, constructor | Keep | Reuse connection, provider, commitment, and program initialization for anchor submission. |
| Server-side wallet loading | `backend/src/services/blockchainService.ts`, constructor and `backend/src/services/blockchainInstance.ts` | Keep | Private keys remain backend-only; the frontend must never sign anchor transactions. |
| Singleton initialization | `backend/src/services/blockchainInstance.ts`, `getBlockchainService()` | Keep/adapt | Prevents duplicate service initialization and already disables the service when wallet configuration is absent. |
| Transaction submission and confirmation | `backend/src/services/blockchainService.ts`, existing `.rpc({ commitment: 'confirmed' })` calls | Keep/adapt | Extract or reuse the low-level submission pattern for anchor transactions. |
| Explorer URL generation | `backend/src/services/blockchainService.ts`, `getExplorerUrl()` | Keep | Reuse for public anchor verification links. |
| Retry persistence | `backend/src/services/blockchainRetryQueue.ts` and Prisma `BlockchainRetryQueue` model | Keep/adapt | The persistence/upsert and failure-recording pattern is useful for anchor batches. |
| Retry worker loop | `backend/src/services/blockchainRetryProcessor.ts` | Keep/adapt | Reuse batch processing, backoff, startup/shutdown, and audit logging patterns; change the unit of work from donations to anchors. |
| PDA derivation patterns | `backend/src/services/blockchainService.ts`, `getNgoPda()`, `getAttestationPda()`, and program instruction account contexts | Keep/adapt | Deterministic addressing and authority constraints remain useful for anchor records. |
| Authority access control | `blockchain/programs/traceit/src/instructions/*.rs` and `authority` accounts | Keep | Restricts on-chain writes to the backend authority wallet. |
| Input validation patterns | `blockchain/programs/traceit/src/instructions/*.rs` and `errors.rs` | Keep/adapt | Apply validation to the smaller anchor payload. |
| NGO registration | `backend/src/services/blockchainService.ts`, `registerNgo()`, and `backend/src/routes/admin.ts` | Keep initially | The salvage audit classifies this lower-frequency flow as reasonable to retain asynchronously. |
| Cohort registration | `backend/src/services/blockchainService.ts`, `registerCohort()`, and `backend/src/routes/charity.ts` | Keep initially | The salvage audit classifies this lower-frequency flow as reasonable to retain asynchronously. |
| Existing integrity verification pattern | `backend/src/services/blockchainService.ts`, `verifyDonationIntegrity()` and `verifyCohortDocumentHash()` | Adapt | Reuse recomputation/comparison behavior for audit-chain and anchor verification. |
| Service and hash tests | `backend/tests/blockchainService.test.ts` | Keep/adapt | Hash, wallet, PDA, explorer, and verification patterns remain valuable. |
| Anchor program test structure | `blockchain/tests/` | Keep/adapt | Retain the Anchor build/test setup and adapt assertions for the anchor instruction. |
| Solana environment configuration | `SOLANA_RPC_URL`, `SOLANA_CLUSTER`, `SOLANA_PROGRAM_ID`, `SOLANA_WALLET_KEYPAIR_PATH`, `BLOCKCHAIN_HMAC_SECRET` | Keep initially | These remain necessary for the optional anchor worker and retained NGO/cohort flows. |

## 4. What Must Stop Being On-Chain

| Existing behavior | New behavior | Migration action |
|---|---|---|
| `recordDonation()` records each confirmed donation as a `DonationRecord` PDA. | Store the donation and a hash-chain audit event in PostgreSQL; include the event in a later anchor batch. | Remove reliance on `blockchainService.recordDonation()` from the Razorpay completion path. Keep the method temporarily behind a migration boundary until anchor verification is proven. |
| `recordDisbursement()` records each disbursement as a `DisbursementRecord` PDA. | Store the disbursement and its audit event in PostgreSQL; anchor a batch root asynchronously. | Remove the individual call from `approveDisbursement()` after the audit-chain path is working. Do not add a new call to `createDisbursement()` merely to satisfy the old design. |
| `updateDonationStatus()` writes ALLOCATED, DISBURSED, and DELIVERED transitions on-chain. | PostgreSQL remains authoritative for status; the transition is represented by an audit-chain event. | Stop treating calls from `backend/src/routes/admin.ts` and `backend/src/routes/charity.ts` as required synchronization. Remove them only after outage tests pass. |
| Routine individual transaction/memo records. | Store canonical event data and hashes in PostgreSQL, then anchor one batch root. | Do not add memo fields or individual-event transaction payloads to the new anchor path. |
| Blockchain-dependent business-state synchronization. | Backend/database validation and status services decide business state; Solana only provides later evidence. | Keep route responses independent of blockchain results and remove any success condition based on a Solana signature. |
| Frontend status display based on an individual Solana transaction ID. | Display PostgreSQL status first; optionally show audit integrity, anchor status, and an anchor signature. | Update `frontend/src/components/DonationHistoryTable.tsx`, `frontend/src/pages/DonorDashboard.tsx`, and related public API consumers after the backend verification shape exists. |
| High-volume PDA tracking for each ordinary donation/disbursement/status event. | Use deterministic identity for an anchor batch or root. | Do not carry individual donation/disbursement PDA requirements into the anchor design. Preserve PDA concepts only where needed by the retained contract or new anchor record. |

The existing `backend/src/routes/webhooks/razorpay.ts` currently awaits the blockchain attempt inside an error-isolated block. The migration must ensure payment completion is not delayed or made dependent on that attempt. Admin and charity integrations already use non-blocking patterns in several places, but their individual recording calls still need to be removed or repurposed after the replacement is verified.

## 5. What Must Be Refactored

### Smart Contract

Current responsibility: `blockchain/programs/traceit/src/lib.rs` exposes instructions for individual donations, status updates, NGO/cohort records, disbursements, and attestations. State accounts under `blockchain/programs/traceit/src/state/` mirror those records.

New responsibility: provide a minimal, authority-controlled record of periodic audit roots. The salvage audit describes a possible `record_anchor` direction, but the exact interface is not established by the repository. Define the instruction only after deciding the batch identity, root representation, timestamp/range metadata, and idempotency mechanism.

Retain:

- Anchor account-context patterns and authority constraints
- PDA derivation and deterministic addressing concepts
- Input length and timestamp validation patterns
- Record-hash/tamper-evidence concepts
- Existing program error handling where compatible

Change:

- Replace the need to write full donation, disbursement, and routine status data on-chain with a compact root and batch reference.
- Ensure the same deterministic anchor identity cannot create duplicate anchor accounts.
- Keep sensitive donor and beneficiary data off-chain; only hashes or aggregate roots may be submitted.

Remove or deprecate only after migration validation:

- Individual `record_donation`, `record_disbursement`, and donation-status writes as normal application behavior.
- Any contract fields that exist only to duplicate PostgreSQL business state.

The current program ID is declared in `blockchain/programs/traceit/src/lib.rs`. Changing instruction layouts or account types may require an Anchor build and a new deployment/program upgrade. Do not assume the deployed program can be modified in place; confirm the upgrade authority and deployment policy before changing the IDL or account layouts.

The retained `register_ngo`, `register_cohort`, and attestation instructions need an explicit decision before removal. The salvage audit allows NGO/cohort registration to remain and suggests attestation storage may be retained for high-value consent events, but it does not require all of them in the MVP anchor path.

### Blockchain Service

Current responsibility: `backend/src/services/blockchainService.ts` hashes donation data, derives PDAs, submits Anchor RPC calls, loads records, and verifies individual records. It exposes `recordDonation()`, `updateDonationStatus()`, `registerNgo()`, `registerCohort()`, `recordDisbursement()`, attestation methods, fetch helpers, and integrity helpers.

Refactor direction:

- Extract or add an anchor-submission operation that accepts a deterministic anchor payload and reuses the existing connection, wallet, provider, program, confirmation, and error handling.
- Keep `registerNgo()` and `registerCohort()` available while their asynchronous integrations are still supported.
- Adapt `verifyDonationIntegrity()`-style recomputation into verification of audit entries, a batch/root, and the corresponding on-chain account or transaction.
- Keep private-key loading and HMAC secret handling server-side.
- Do not expose an Anchor-specific dependency to ordinary route business logic; route code should record application state and enqueue/trigger asynchronous anchoring through a service boundary.

The audit uses conceptual names such as `AnchorService`, `createAnchor()`, `submitAnchor()`, `retryAnchor()`, and `verifyAnchor()`. Use those names only if they fit the existing service structure. The required behavior matters more than introducing a second service abstraction unnecessarily.

### Hashing

Extend the audit logging path around `backend/src/services/auditLogService.ts` or a service at the existing backend service boundary. The current `AuditLog` table is a flat append log and `writeAuditLog()` catches failures so they do not affect callers. A hash chain requires stronger atomicity for the chain entry itself: compute the canonical event representation, retrieve the prior chain hash, append the new hash, and commit it with the business operation where the event is part of that operation.

Reuse `HashService.sha512()` for event and root inputs and `HashService.hmacSha512()` where keyed privacy protection is needed. Define canonical serialization before computing hashes; the same bytes must be used by creation and verification.

### Verification

The verification path should be:

```text
PostgreSQL audit event
        -> previous-hash and current-hash validation
        -> batch/root recomputation
        -> anchor lookup on Solana
        -> root and metadata comparison
        -> transaction/signature verification
```

Reuse `getDonationRecord()`, `getCohortRecord()`, `getAttestation()`, `getExplorerUrl()`, and their decoding/error-handling patterns where applicable. Add verification at the API layer only after the underlying chain and anchor data are defined.

### Retry System

Retain the database-backed retry pattern in `BlockchainRetryQueue` and `BlockchainRetryProcessor`, but change the unit of work from donation/status operations to an anchor batch. The current queue has a unique `donationId` and processor logic that fetches donations; that schema and processor logic cannot be reused unchanged for anchors. Preserve the backoff, batching, persisted work, and graceful shutdown patterns while introducing anchor identity/range metadata through an additive migration.

### Idempotency

Use a deterministic identity derived from the anchored audit range/root or another stable batch identifier. The exact identity format is not fixed by the repository. It must be persisted before or with submission state, checked before creating a new on-chain account, and used during retry/reconciliation so a timeout or worker restart does not create a second anchor for the same batch.

## 6. New Data Flow

### Normal application operation

```text
Donation/disbursement/status/attestation operation
       -> PostgreSQL transaction validates and writes business state
       -> canonical audit event is built
       -> previous audit hash is read under the chain's concurrency rules
       -> current event hash is computed with HashService.sha512()
       -> audit-chain entry is appended in PostgreSQL
       -> API operation completes
```

The same rule applies to NGO and cohort operations. Existing NGO/cohort blockchain calls may remain asynchronous during the transition, but their result must not determine whether the application operation succeeds.

### Periodic anchoring

```text
Periodic anchor job
       -> select a stable range of unanchored audit entries
       -> validate chain linkage and canonical ordering
       -> calculate deterministic batch/root value
       -> persist pending anchor identity and range
       -> submit minimal anchor transaction asynchronously
       -> wait for confirmation
       -> record Solana transaction signature
       -> mark the exact range/root anchored
```

If submission fails, the audit entries remain in PostgreSQL and the anchor remains pending/retryable. If submission succeeds but the database update fails, reconciliation must find the deterministic anchor again before resubmitting.

## 7. Developer Task List

### Task 1 — Establish a Working Baseline

**Objective:** Preserve the existing implementation while creating a migration baseline.

**Inspect:** `blockchain/`, `backend/src/services/blockchainService.ts`, `backend/tests/blockchainService.test.ts`, `backend/tests/blockchainIntegration.test.ts`.

**Reuse:** Existing Anchor build/tests, service tests, wallet setup, and hash tests.

**Required change:** Record current test/build results and identify which tests require devnet/local validator credentials. Do not delete individual-recording code yet.

**Expected result:** The current implementation is reproducible and its retained behavior is known.

**Dependencies:** None.

**Test:** `npm test` in `backend/`; `npm test` in `blockchain/` where the configured validator/wallet are available.

### Task 2 — Define the Canonical Audit-Chain Event

**Objective:** Establish one deterministic representation for business audit events.

**Inspect:** `backend/src/services/auditLogService.ts`, Prisma `AuditLog` in `backend/prisma/schema.prisma`, and the existing route audit calls.

**Reuse:** Existing entity/action/metadata audit information and `HashService.sha512()`.

**Required change:** Add the database representation and service logic for chained events. The repository currently has `AuditLog` but no `AuditChain` model, so this is additive migration work. Define previous-hash linkage, canonical serialization, ordering, and verification behavior before anchoring.

**Expected result:** Business events can be verified for ordering and tampering without Solana.

**Dependencies:** Database migration and Prisma client generation.

**Test:** Sequential linkage, deterministic hash output, concurrent append behavior, and tamper detection.

### Task 3 — Make Business Transactions Own Their Audit Entry

**Objective:** Ensure the core PostgreSQL operation and its audit-chain event are committed consistently.

**Inspect:** Donation completion routes/services, `backend/src/routes/charity.ts`, `backend/src/routes/admin.ts`, `backend/src/services/statusService.ts`, and `backend/src/services/auditLogService.ts`.

**Reuse:** Existing business validation and audit actions.

**Required change:** Add chain-entry creation at the appropriate transaction boundary for donation, disbursement, status, and attestation changes. Do not let an anchoring failure roll back a valid business operation.

**Expected result:** Core records and their local integrity evidence exist even when Solana is disabled.

**Dependencies:** Task 2.

**Test:** Database transaction success/failure cases and audit creation with blockchain configuration absent.

### Task 3A — Integrate Razorpay Before Payment Anchoring

**Objective:** Replace the local payment mock boundary with a verified, idempotent Razorpay Test Mode flow before connecting payment events to the audit chain.

**Inspect:** `backend/src/routes/webhooks/razorpay.ts`, `backend/src/services/donationService.ts`, `backend/src/routes/donor.ts`, `backend/prisma/schema.prisma`, `frontend/src/components/DonateDialog.tsx`, `frontend/src/services/mockPayments.ts`, `backend/tests/e2e.test.ts`, and `backend/tests/donationServiceSecrets.test.ts`.

**Current behavior:** The backend creates a locally generated order; the frontend separately generates mock payment IDs; the webhook handles payment-shaped events; the payment signature helper exists but no active Checkout confirmation route was found.

**Required change:** Implement the confirmed provider flow using the selected SDK or direct HTTP approach. Create orders server-side, pass the server-created order ID to Checkout, verify Checkout responses server-side, verify webhook signatures against the raw body, persist the actual provider order/payment identifiers, validate amount and currency, and process provider events idempotently. Do not guess fields or event scope beyond the Razorpay integration audit and captured Test Mode payloads.

**Reuse:** Existing `Donation` fields, `verifyRazorpaySignature()`, webhook raw-body handling, audit actions, receipt generation, and environment-secret patterns.

**Expected result:** PostgreSQL contains the authoritative payment/donation state and external identifiers; invalid, duplicate, delayed, or failed provider events cannot create contradictory successful state.

**Dependencies:** Confirm the SDK/API choice, Checkout mode, webhook configuration, authoritative success event, retry identity, and refund scope.

**Test:** Order creation, verified Checkout success, invalid signature, valid/duplicate/delayed webhook, amount/currency mismatch, provider failure, database failure, and payment success while Solana is unavailable.

### Task 4 — Decouple Donation Completion From Individual Solana Recording

**Objective:** Donation completion must not depend on a `recordDonation()` transaction.

**Inspect:** `backend/src/routes/webhooks/razorpay.ts` and `backend/src/services/donationService.ts`.

**Current behavior:** After payment success, the webhook/service calls `blockchainService.recordDonation()` and may update `Donation.solanaTxHash`; failures are handled without failing the already-written database operation.

**Required change:** Make the PostgreSQL donation and audit-chain entry the completion boundary. Remove reliance on the individual donation transaction. Route any remaining legacy call only through a migration compatibility path, not as a success prerequisite.

**Reuse:** `HashService`, existing audit logging, and retry/error patterns until the anchor worker replaces them.

**Expected result:** Payment confirmation succeeds with no wallet, RPC, or Solana program available.

**Dependencies:** Tasks 2, 3, and 3A.

**Test:** Disable blockchain configuration/RPC and verify the webhook completes, donation status is correct, and the audit-chain entry exists.

### Task 5 — Decouple Disbursement and Status Workflows

**Objective:** Disbursement creation, approval, and donation status transitions must complete from PostgreSQL alone.

**Inspect:** `backend/src/routes/charity.ts` (`createDisbursement`, proof/attestation flows) and `backend/src/routes/admin.ts` (`approveDisbursement` and related status calls).

**Current behavior:** Disbursement creation already does not call blockchain; approval makes asynchronous `recordDisbursement()` and `updateDonationStatus()` calls; delivery attestation can update donation status on-chain.

**Required change:** Preserve database validation and status updates, append audit-chain events, and remove individual on-chain recording/status synchronization as an operational dependency. Do not add missing individual calls to `createDisbursement()` or proof upload.

**Reuse:** Existing authorization, status-service logic, and fire-and-forget boundaries while transitioning.

**Expected result:** Disbursement workflows succeed during Solana/RPC outages.

**Dependencies:** Tasks 2 and 3.

**Test:** Run creation, approval, proof, and status-transition tests with blockchain unavailable.

### Task 6 — Decide Retained NGO, Cohort, and Attestation Scope

**Objective:** Keep lower-frequency functionality where it provides value without making it a critical dependency.

**Inspect:** `backend/src/services/blockchainService.ts`, `backend/src/routes/admin.ts`, `backend/src/routes/charity.ts`, and `blockchain/programs/traceit/src/instructions/`.

**Required change:** Retain NGO and cohort registration asynchronously for the initial migration, as recommended by the salvage audit. Decide separately whether receipt/delivery attestations remain individual high-value on-chain records or become audit-chain events included in periodic roots. Do not remove them without reviewing their compliance/consent value.

**Expected result:** Existing useful low-frequency behavior is preserved while ordinary flows move to the hash chain.

**Dependencies:** Tasks 2-5.

**Test:** Existing NGO/cohort/attestation tests remain meaningful; add outage tests showing database completion regardless of blockchain result.

### Task 7 — Add Anchor Persistence and Batching

**Objective:** Represent pending, submitted, confirmed, and failed anchor batches in PostgreSQL.

**Inspect:** `backend/prisma/schema.prisma`, `BlockchainRetryQueue`, and existing audit records.

**Required change:** Add the minimum additive persistence needed for deterministic batch identity, selected audit range/root, submission status, retry data, and transaction signature. The repository does not currently define an anchor model; choose names and fields only after the event/root representation is fixed.

**Expected result:** An anchor batch survives process crashes and can be reconciled without losing audit entries.

**Dependencies:** Tasks 2 and 3.

**Test:** Batch selection is stable, ranges do not overlap incorrectly, and the same batch receives the same identity after restart.

### Task 8 — Adapt the Blockchain Service for Anchors

**Objective:** Submit a minimal anchor using existing Solana infrastructure.

**Inspect:** `backend/src/services/blockchainService.ts`, `backend/src/services/blockchainInstance.ts`, `blockchain/programs/traceit/src/lib.rs`, instruction modules, and state modules.

**Reuse:** Connection, Anchor provider, server-side keypair, program initialization, PDA derivation, authority accounts, confirmation, explorer URL, and error handling.

**Required change:** Add the anchor submission and anchor verification behavior. Adapt individual integrity verification to compare the computed PostgreSQL root with the on-chain anchor. Keep raw identities and ordinary business payloads off-chain.

**Expected result:** A pending PostgreSQL anchor can be submitted and verified without exposing application internals to route handlers.

**Dependencies:** Task 7 and the contract decision in Task 9.

**Test:** Mock submission, confirmation, failure, timeout, and idempotent retry behavior.

### Task 9 — Adapt the Anchor Program Carefully

**Objective:** Provide the smallest on-chain operation needed for periodic roots.

**Inspect:** `blockchain/programs/traceit/src/lib.rs`, `blockchain/programs/traceit/src/instructions/mod.rs`, `blockchain/programs/traceit/src/state/mod.rs`, and existing instruction/state files.

**Required change:** Define an anchor instruction only after determining the stable anchor identity and root metadata. Retain authority validation, deterministic addressing, input validation, and record integrity concepts. Do not add full donation, disbursement, beneficiary, or audit metadata to the account.

**Expected result:** The program stores a compact, publicly queryable proof for an audit batch.

**Dependencies:** Task 7 and a confirmed deployment/upgrade-authority decision.

**Test:** Anchor creation, invalid input rejection, duplicate identity rejection/idempotent lookup, and read-back verification.

### Task 10 — Reuse Retry Infrastructure for Anchor Batches

**Objective:** Make anchor submission asynchronous and durable.

**Inspect:** `backend/src/services/blockchainRetryQueue.ts`, `backend/src/services/blockchainRetryProcessor.ts`, and Prisma `BlockchainRetryQueue`.

**Reuse:** Batch size, persisted retries, exponential backoff, processor lifecycle, and audit logging.

**Required change:** Replace donation-specific lookup/processing with anchor batch processing or add an anchor-specific queue representation. Add maximum retry/dead-letter behavior and preserve enough data to reconcile an ambiguous submission.

**Expected result:** RPC failures delay anchoring but never lose audit entries or block application workflows.

**Dependencies:** Tasks 7-9.

**Test:** RPC outage, transaction rejection, worker crash/restart, max retries, and recovery after RPC restoration.

### Task 11 — Build Verification Through the Full Chain

**Objective:** Connect local audit verification to the public Solana proof.

**Inspect:** Existing service verification methods, `backend/src/routes/public.ts`, and frontend verification consumers.

**Required change:** Add an API-level verification flow that validates chain linkage, recomputes the batch/root, locates the anchor, compares root/metadata, and returns a public transaction reference where confirmed.

**Expected result:** A verifier can distinguish valid, tampered, pending, and failed/unanchored states.

**Dependencies:** Tasks 2, 7, 8, and 9.

**Test:** Valid chain/anchor, modified event, wrong root, missing anchor, pending anchor, and transaction lookup failure.

### Task 12 — Update Frontend Presentation

**Objective:** Keep normal UX dependent on application state, not Solana availability.

**Inspect:** `frontend/src/components/DonationHistoryTable.tsx`, `frontend/src/pages/DonorDashboard.tsx`, `frontend/src/pages/AttestationVerify.tsx`, `frontend/src/components/AttestationVerificationDialog.tsx`, `frontend/src/components/AttestationDetailsModal.tsx`, `frontend/src/components/DonateDialog.tsx`, `frontend/src/components/ProofUploadDialog.tsx`, and `frontend/src/types/index.ts`.

**Required change:** Show PostgreSQL donation/disbursement/attestation statuses as primary. Replace claims that every ordinary event is blockchain-confirmed. Add anchor/integrity/verification status only when supplied by the backend. Keep explorer links for confirmed anchor signatures.

**Expected result:** Users can complete normal workflows without a wallet, transaction ID, or Solana response.

**Dependencies:** Task 11 and the final API response shape.

**Test:** Render pending, verified, unanchored, and failed states without layout or workflow regressions.

### Task 13 — Remove Obsolete Paths After Proof

**Objective:** Reduce duplicate logic only after the new path is operational.

**Inspect:** All calls identified by searches for `recordDonation`, `recordDisbursement`, `updateDonationStatus`, `solanaTxHash`, and `BlockchainRetryQueue`.

**Required change:** Remove or deprecate individual event calls, obsolete status synchronization, individual-event frontend assumptions, and unused PDA/state paths only after Tasks 1-12 pass. Preserve retained NGO/cohort/attestation functionality until its scope decision is implemented.

**Expected result:** No ordinary core workflow requires an individual Solana transaction.

**Dependencies:** All previous tasks.

**Test:** Full backend tests, blockchain tests, outage tests, verification tests, and frontend build/lint.

## 8. Recommended Implementation Order

### Phase 1 — Protect Existing Implementation and Payment State

- Establish a passing baseline for backend, frontend, and Anchor tests.
- Confirm the deployed program ID and upgrade authority policy.
- Inspect the current Razorpay mock/webhook flow and the existing `Donation` fields.
- Do not delete existing payment or blockchain instructions, accounts, or service methods.

### Phase 2 — Implement Razorpay Payment Integration

- Confirm the official SDK versus direct HTTP choice, Test Mode credentials, Checkout mode, webhook URL, and selected events.
- Implement server-side order creation using the actual provider response.
- Pass the server-created order ID to Checkout and verify the documented success response server-side.
- Verify webhook signatures against the exact raw body.
- Add durable webhook/event idempotency, amount/currency validation, provider-state handling, and explicit provider failure/retry behavior.
- Persist the actual Razorpay identifiers against the existing PostgreSQL donation record; add schema support only where confirmed requirements need it.

### Phase 3 — PostgreSQL Payment and Audit Foundation

- Ensure a valid provider payment transitions PostgreSQL state exactly once.
- Distinguish provider events received from business-significant Trace-It state transitions.
- Create payment/donation audit events without creating individual Solana transactions.
- Keep receipt and notification work asynchronous and downstream of valid PostgreSQL state.

### Phase 4 — Hash-Chain Integration

- Define canonical payment/donation audit event serialization.
- Add chained persistence and verification for payment and other business events.
- Ensure duplicates do not create duplicate chain entries.
- Keep existing blockchain calls available only as non-authoritative compatibility paths while the new audit path is proven.

### Phase 5 — Remove Critical-Path Blockchain Dependencies

- Ensure payment confirmation, donation completion, disbursement, proof, attestation, and status workflows succeed without Solana.
- Remove reliance on `recordDonation()` from the payment path.
- Stop treating individual disbursement/status blockchain calls as required synchronization.

### Phase 6 — Build Anchor Batching

- Persist deterministic ranges/root values for unanchored audit events.
- Add pending/submitted/confirmed/failed state and retry/reconciliation data.
- Include payment audit events in future anchor batches without putting Razorpay identifiers on-chain as individual records.

### Phase 7 — Adapt Existing Blockchain Layer

- Reuse connection, server-side signing, transaction submission, PDA/authority, confirmation, and retry infrastructure.
- Add the minimal anchor contract operation after confirming upgrade/deployment constraints.
- Adapt verification from individual records to audit chain, root, anchor, and transaction verification.

### Phase 8 — Verification and Monitoring

- Verify the relationship between PostgreSQL state, audit event, hash chain, anchor batch, and Solana transaction.
- Monitor provider failures, duplicate events, unanchored audit ranges, anchor retries, and reconciliation outcomes.

### Phase 9 — Remove Obsolete Paths

- Remove individual donation/payment/disbursement/status recording from ordinary workflows only after payment and outage tests pass.
- Remove obsolete frontend assumptions and synchronization logic.
- Retain NGO/cohort and selected attestation paths where their value justifies them.

## 9. Smart Contract Migration

### Existing instructions

`blockchain/programs/traceit/src/lib.rs` currently exposes:

- `record_donation`
- `update_donation_status`
- `register_ngo`
- `register_cohort`
- `record_disbursement`
- `store_ngo_attestation`
- `store_delivery_attestation`

The handlers are registered through `blockchain/programs/traceit/src/instructions/mod.rs`; account structures are under `blockchain/programs/traceit/src/state/`.

### Instruction treatment

| Instruction | Migration treatment |
|---|---|
| `record_donation` | Stop using for ordinary donation flow. Review/adapt its PDA, authority, validation, and record-hash patterns for anchor storage before deprecation. |
| `update_donation_status` | Stop using for normal application status changes. Its transition-validation pattern may inform local validation or a future anchor-confirmation state, but PostgreSQL owns donation status. |
| `register_ngo` | Retain initially as asynchronous lower-frequency registration if the team still needs the public NGO record. It must not block NGO approval. |
| `register_cohort` | Retain initially as asynchronous proof-hash registration if useful. It must not block cohort proof upload. |
| `record_disbursement` | Stop using for ordinary individual disbursement recording. Review its account and authority patterns for the compact anchor operation. |
| `store_ngo_attestation` / `store_delivery_attestation` | Do not delete blindly. Decide whether high-value consent/receipt events remain individually anchored or are represented by PostgreSQL audit events and periodic roots. |

### Anchor operation

The salvage audit proposes adapting the structure toward an operation such as `record_anchor`, but the repository does not establish an exact interface. The developer must define only the minimum fields needed to identify the batch, store the computed root, record relevant range/timestamp metadata, and enforce authority/idempotency. Do not store raw donor IDs, beneficiary IDs, full business records, or routine status history on-chain.

Changing `lib.rs`, instruction contexts, or account layouts may require a new build and deployment or an authorized program upgrade. Confirm upgrade authority and preserve the current program ID/deployment policy before implementation. Do not silently assume account layouts can be changed in place.

## 10. Blockchain Service Migration

The existing `BlockchainService` is the primary reusable boundary. Retain its constructor, connection, wallet, provider, `init()`, explorer URL, and transaction error/confirmation patterns.

| Existing method/group | Treatment |
|---|---|
| `recordDonation()` | Deprecate from normal workflows; reuse hashing/PDA/submission patterns for anchor implementation where safe. |
| `updateDonationStatus()` | Remove from normal status synchronization after outage-safe audit events are proven. |
| `registerNgo()` | Retain initially as asynchronous. |
| `registerCohort()` | Retain initially as asynchronous. |
| `recordDisbursement()` | Deprecate from normal workflows; reuse account/submission patterns if useful for anchors. |
| Attestation methods | Keep only for the agreed high-value scope; otherwise represent events in the audit chain. |
| `get*Record()` methods | Adapt or retain for retained records; add equivalent anchor lookup/read-back. |
| `verifyDonationIntegrity()` and document verification | Adapt to chain/root/anchor verification. |
| `getNgoPda()` and `getAttestationPda()` | Retain where retained instructions need them; do not force individual PDAs into anchor batches. |

The rest of the backend should depend on an asynchronous anchoring capability rather than on Solana-specific business methods. Whether that is a new `AnchorService` or an adapted `BlockchainService` is an implementation choice; avoid duplicating connection and signing infrastructure.

## 11. Failure and Retry Behavior

### Solana unavailable

PostgreSQL business operations and audit-chain writes continue. Public anchoring is pending. The worker records or retains a retryable pending item.

### RPC unavailable

The anchor remains pending and is retried with the existing persisted backoff pattern. Core APIs return from PostgreSQL and do not wait for RPC confirmation.

### Anchor transaction fails

Do not discard audit entries. Update the anchor attempt state, retain the deterministic batch identity, and retry. After the configured maximum, retain the item for manual/dead-letter handling and alert on it.

### Worker crashes

Pending anchors remain in PostgreSQL. On restart, the worker selects pending/retryable work and resumes from the persisted batch identity.

### Transaction succeeds but database update fails

The worker must reconcile by deriving or querying the deterministic anchor identity before submitting again. A timeout or missing local signature must not automatically create a second anchor. After locating the confirmed transaction, record its signature and mark the exact batch/root complete.

### Duplicate retry

Use deterministic batch identity and an on-chain existence check where available. Treat an already-existing anchor as an idempotent success only after verifying that its stored root and metadata match the pending batch.

## 12. Frontend Changes

The following frontend areas currently display or describe individual blockchain records, transaction IDs, or blockchain-confirmed states:

- `frontend/src/components/DonationHistoryTable.tsx`
- `frontend/src/pages/DonorDashboard.tsx`
- `frontend/src/pages/AttestationVerify.tsx`
- `frontend/src/components/AttestationVerificationDialog.tsx`
- `frontend/src/components/AttestationDetailsModal.tsx`
- `frontend/src/components/DonateDialog.tsx`
- `frontend/src/components/ProofUploadDialog.tsx`
- `frontend/src/pages/NGODashboard.tsx`
- `frontend/src/types/index.ts`

Update these consumers after the backend verification response is defined. PostgreSQL/application status must be primary. The UI may show:

- Audit-chain integrity status
- Anchor pending/confirmed/failed status
- Anchor transaction signature and explorer link
- Public verification result

None of those states may prevent donation, disbursement, proof, attestation, or status workflows. Do not expose wallet private keys, HMAC secrets, or server signing credentials.

## 13. Testing Plan

### Existing tests to retain or adapt

- `backend/tests/blockchainService.test.ts`: retain hash, wallet construction, PDA determinism, explorer URL, and integrity-pattern tests; adapt transaction and integrity assertions to anchors.
- `backend/tests/blockchainIntegration.test.ts`: retain the service initialization and devnet integration structure; replace or supplement individual donation/status assertions with anchor submission/read-back tests.
- `blockchain/tests/`: retain Anchor build/test setup; adapt instruction tests to the final anchor operation and retain tests for any NGO/cohort/attestation instructions kept.
- Existing backend Jest configuration and scripts in `backend/package.json` remain the test entry points.

### Required new or modified tests

#### Core application

- Donation completion succeeds with Solana/RPC unavailable.
- Disbursement creation and approval succeed with Solana/RPC unavailable.
- Attestation and normal status updates succeed with Solana/RPC unavailable.
- No API response requires a Solana signature for business success.

#### Audit chain

- Canonical event hashing is deterministic.
- Sequential previous-hash links are correct.
- Concurrent writes cannot silently fork or overwrite the chain.
- Modified event data, previous hash, or ordering fails verification.

#### Anchoring

- A stable unanchored range produces the expected root.
- Anchor submission records confirmation and signature.
- RPC failure leaves the batch pending.
- Retry resumes after worker restart.
- Duplicate anchor submission is prevented or verified as idempotent.
- Failed anchoring does not delete or alter audit entries.

#### Verification

- Valid chain and valid anchor verify successfully.
- Modified event fails before or during root verification.
- Incorrect root fails against the on-chain anchor.
- Missing/pending anchor is reported distinctly from a tampered chain.
- Solana transaction lookup and explorer URL handling work for confirmed anchors.

#### Payment provider and blockchain independence

| Scenario | Expected behavior |
|---|---|
| Razorpay order creation succeeds | PostgreSQL tracks the appropriate internal donation/payment state and the actual provider order identifier. |
| Verified Checkout confirmation succeeds | The payment is verified server-side and PostgreSQL transitions once. |
| Invalid Checkout signature | The response is not trusted and the donation is not marked successful. |
| Valid payment webhook | Provider state is validated, PostgreSQL is updated idempotently, and the appropriate business audit event is generated. |
| Duplicate webhook | No duplicate business transition, receipt, notification, or audit-chain event is created. |
| Delayed or out-of-order webhook | State remains consistent and does not regress because an earlier provider event was not observed. |
| Razorpay API failure or timeout | No false successful donation is created; reconciliation follows the confirmed provider/idempotency design. |
| PostgreSQL failure during provider processing | The event is not treated as durably processed until the required database state is safely persisted. |
| Solana unavailable during valid payment | Payment and audit processing complete in PostgreSQL; the anchor remains pending/retryable. |
| Anchor submission fails | Existing payment/audit state remains intact and only the anchor is retried. |
| Anchor eventually succeeds | The existing audit-chain range becomes publicly anchored without changing payment state. |

Do not add exact provider HTTP status expectations or unconfirmed payload fields to tests. Use redacted Test Mode fixtures captured from the selected integration.

## 14. Environment and Deployment Changes

### Existing variables that remain relevant

- `SOLANA_RPC_URL`
- `SOLANA_CLUSTER`
- `SOLANA_PROGRAM_ID`
- `SOLANA_WALLET_KEYPAIR_PATH` or the existing JSON-keypair alternative supported by `BlockchainService`
- `BLOCKCHAIN_HMAC_SECRET`

The Solana wallet remains required by the anchor worker and by any retained NGO/cohort/attestation integrations, but it is not required for normal API business operations. `backend/src/services/blockchainInstance.ts` already disables the service when the wallet path is absent; preserve that behavior for local environments.

### New configuration and runtime needs

The repository does not currently define anchor-specific environment variables. Add only those required by the chosen scheduler/worker, batch interval, retry policy, or dead-letter monitoring design. Do not hard-code those values in application routes.

The deployment must run a durable periodic anchor worker or scheduled process with access to PostgreSQL and the server-side Solana wallet. The worker must support graceful shutdown and restart recovery, using the existing processor lifecycle as a model.

Protect the wallet and HMAC secret with the deployment's secret-management mechanism. A production secrets manager, key rotation, multisig, or HSM is hardening work and may be deferred, but secrets must not enter source control or the frontend bundle.

## 15. Migration Safety Rules

1. Do not delete the existing blockchain implementation before the replacement path works.
2. Do not make core application workflows depend on Solana.
3. Do not duplicate PostgreSQL business state on-chain unnecessarily.
4. Do not expose private keys or HMAC secrets to the frontend.
5. Do not lose audit records because anchoring fails.
6. Make anchor submission retryable.
7. Make anchor creation idempotent.
8. Keep blockchain operations asynchronous where possible.
9. Preserve existing cryptographic primitives unless a demonstrated reason requires replacement.
10. Razorpay identifiers remain provider/application metadata in PostgreSQL; they do not need individual on-chain records.
11. Record business-significant payment state transitions in the audit chain, not every duplicate provider callback.
12. A valid Razorpay payment must remain valid in PostgreSQL when Solana or the anchor worker is unavailable.
13. Remove obsolete functionality only after the replacement has been tested.

## 16. Definition of Done

- PostgreSQL is documented and implemented as the operational source of truth.
- Razorpay is integrated through the approved server-side payment flow.
- Razorpay Checkout responses and webhooks are cryptographically verified where required.
- Payment provider events are idempotently processed.
- Payment amount and currency are validated against PostgreSQL state.
- Razorpay order/payment identifiers are durably associated with the relevant PostgreSQL records.
- Donation workflows work without Solana.
- Disbursement workflows work without Solana.
- Ordinary status changes do not require blockchain transactions.
- Relevant payment, donation, disbursement, attestation, NGO, and cohort transitions are stored as PostgreSQL audit-chain events according to their business significance.
- Audit records form a tamper-evident, verifiable chain.
- Audit batches can be anchored to Solana.
- Anchor submission is asynchronous and retryable.
- Anchor identity prevents duplicate submissions.
- Worker restart and ambiguous transaction outcomes are recoverable.
- Existing useful Solana connection, wallet, hashing, retry, PDA, and verification infrastructure is reused.
- Public verification connects an audit-chain range/root to its Solana anchor.
- Individual-event blockchain logic is no longer part of the core critical path.
- Individual payment/donation blockchain writes are no longer part of the critical path.
- Tests cover payment-provider failures and blockchain failures independently.
- No private keys or secrets are exposed to the frontend.

## 17. Files Expected to Change

The paths below are based on the current repository. New files/models required for the audit chain, anchor persistence, scheduler, or verification API do not currently exist; choose their names only after the data model and worker boundary are agreed.

### Must change

| File/path | Expected change | Reason | Priority |
|---|---|---|---|
| `backend/prisma/schema.prisma` | Add the minimum audit-chain and anchor persistence structures; adapt retry persistence if needed. | Current schema has `AuditLog` and a donation-keyed retry queue, but no audit-chain or anchor model. | Highest |
| `backend/src/services/auditLogService.ts` | Extend or coordinate audit writing with canonical hash-chain creation. | Current `writeAuditLog()` writes flat logs and swallows errors; it does not create chain links. | Highest |
| `backend/src/services/blockchainService.ts` | Add/adapt anchor submission and verification while preserving low-level Solana infrastructure. | This is the current Solana service boundary. | Highest |
| `blockchain/programs/traceit/src/lib.rs` | Add or adapt the minimal anchor operation after upgrade/deployment review. | The current program exposes individual-record instructions only. | Highest |
| `blockchain/programs/traceit/src/instructions/mod.rs` | Register the final anchor instruction if the contract is adapted. | Current instruction module has no anchor instruction. | Highest |
| `blockchain/programs/traceit/src/state/mod.rs` | Register the final anchor state account if needed. | Current state module has individual business accounts only. | Highest |
| `backend/src/services/blockchainRetryQueue.ts` | Support anchor batch identity/metadata and retry semantics. | Current queue is keyed to `donationId`. | Highest |
| `backend/src/services/blockchainRetryProcessor.ts` | Process pending anchor batches and reconcile ambiguous submissions. | Current processor fetches donations and retries donation/status operations. | Highest |
| `backend/src/routes/webhooks/razorpay.ts` | Remove reliance on individual `recordDonation()` for payment completion. | Current webhook calls it after payment success. | Highest |
| `backend/src/routes/admin.ts` | Stop relying on individual disbursement/status blockchain calls; create local audit events instead. | Current approval path calls `recordDisbursement()` and status updates asynchronously. | Highest |
| `backend/src/routes/charity.ts` | Stop relying on individual status/attestation blockchain calls for workflow completion; preserve retained NGO/cohort behavior. | Current charity routes call blockchain operations for cohort and attestations/status. | Highest |

### Probably change

| File/path | Expected change | Reason | Priority |
|---|---|---|---|
| `backend/src/services/blockchainInstance.ts` | Point initialization at the adapted anchor-capable service/IDL if required. | It currently loads the existing `traceit.json` IDL and service. | High |
| `backend/src/services/donationService.ts` | Remove or isolate any individual donation recording call. | Search found a second `recordDonation()` integration here. | High |
| `backend/src/routes/public.ts` | Add audit/anchor verification status and stop treating individual donation transaction hashes as the primary proof. | It currently selects `solanaTxHash` and builds explorer URLs. | Medium |
| `backend/tests/blockchainService.test.ts` | Adapt transaction/integrity tests for anchor behavior. | Existing tests are donation-record oriented. | High |
| `backend/tests/blockchainIntegration.test.ts` | Add anchor and outage/recovery coverage. | Existing integration tests create and update individual donation records. | High |
| `blockchain/tests/` | Adapt/add tests for final anchor instruction and retained instructions. | Existing Anchor tests target the current program behavior. | High |
| `backend/src/services/blockchainInstance.ts` | Keep wallet-disabled behavior and make it compatible with a worker-only use. | Core APIs must operate without wallet configuration. | Medium |

### May change

| File/path | Expected change | Reason | Priority |
|---|---|---|---|
| `frontend/src/components/DonationHistoryTable.tsx` | Display application status plus optional audit/anchor state. | Currently includes individual blockchain verification messaging and explorer links. | Medium |
| `frontend/src/pages/DonorDashboard.tsx` | Remove assumptions that individual on-chain recording is required. | Current dashboard references blockchain verification availability. | Medium |
| `frontend/src/pages/AttestationVerify.tsx` | Adapt verification copy and results to audit/anchor verification. | Current page directly describes individual blockchain verification. | Medium |
| `frontend/src/components/AttestationVerificationDialog.tsx` | Adapt when the new verification API exists. | Current dialog presents blockchain verification as the proof. | Medium |
| `frontend/src/components/AttestationDetailsModal.tsx` | Update individual blockchain-record claims if attestations move to audit anchoring. | Current modal describes donation blockchain recording. | Medium |
| `frontend/src/components/DonateDialog.tsx` | Stop presenting a donation transaction as normal workflow proof. | Current flow creates explorer links from transaction-like values. | Medium |
| `frontend/src/components/ProofUploadDialog.tsx` | Replace direct blockchain submission language with application/audit status. | Current UI says proof is submitted to blockchain. | Medium |
| `frontend/src/pages/NGODashboard.tsx` | Adapt transaction display if individual records are removed. | It consumes `solanaTxHash`/explorer data. | Medium |
| `frontend/src/types/index.ts` | Add the eventual verification/anchor response shape and de-emphasize individual `solanaTxHash`. | Current types include transaction/explorer fields. | Medium |
| `backend/package.json` | Add a worker/scheduler command only if deployment requires a separate process. | Current scripts include backend tests/build and blockchain reconciliation. | Low/medium |

### No change required initially

| File/path or component | Reason |
|---|---|
| `backend/src/services/hashService.ts` | Existing SHA-512, HMAC-SHA-512, and encryption primitives are reusable. |
| `backend/src/services/blockchainInstance.ts` constructor pattern | Keep the singleton and server-side initialization pattern unless the worker boundary requires a small adapter. |
| Existing NGO/cohort route business validation | Blockchain must remain asynchronous and non-authoritative, but ordinary backend validation remains valid. |
| Existing server-side secret handling model | Keep private-key and HMAC secret access out of frontend code. |

## 18. Files That Should NOT Be Changed

Do not change `backend/src/services/hashService.ts` as part of this migration unless a specific canonicalization or security defect is demonstrated. Its `sha512()` and `hmacSha512()` methods are explicitly identified as reusable.

Do not rewrite the existing Solana connection, wallet, provider, singleton, retry, and explorer infrastructure merely to introduce anchoring. Adapt `backend/src/services/blockchainService.ts`, `backend/src/services/blockchainInstance.ts`, `backend/src/services/blockchainRetryQueue.ts`, and `backend/src/services/blockchainRetryProcessor.ts` in place or extract only the minimum shared logic.

Do not change core backend authorization and business validation in `statusService.ts`, route middleware, or PostgreSQL-backed status logic to make them blockchain-aware. The migration moves responsibility away from blockchain, not toward it.

Do not delete retained NGO/cohort/attestation code until the scope decision and replacement verification behavior are complete.

## 19. Open Implementation Questions

The following decisions remain open and must be confirmed before implementation. They are not assumptions in this guide.

| Question | Why it matters | Evidence still needed |
|---|---|---|
| Which official Razorpay integration will be used: Node SDK or direct HTTPS? | Determines dependency, client construction, error handling, and test approach. | No live SDK/API client currently exists in the repository. |
| Will Checkout use a handler, callback URL, webhook only, or a combination? | Determines whether a payment confirmation endpoint is required and how frontend success is processed. | Current frontend uses a mock and has no active Checkout integration. |
| Which Test Mode webhook URL and events are configured? | Determines the actual event set and delivery path. | Razorpay Dashboard configuration is not stored in the repository. |
| Should `payment.captured` or `order.paid` be the authoritative success signal? | Processing both without deduplication can duplicate business and audit effects. | Product/payment owner decision and redacted Test Mode payloads. |
| Should `payment.authorized` map to Trace-It `SUCCESS`? | Authorized is not the same as captured; uncaptured payments can later be refunded. | Capture policy and business requirement. |
| What is the payment-attempt retry identity? | Razorpay requires a new order for a retry; Trace-It must decide whether that is the same donation attempt or a new attempt record. | Product and database design decision. |
| Should provider event identity have durable persistence? | Required to deduplicate `x-razorpay-event-id` safely. | Final schema decision; current Prisma schema has no provider-event model. |
| Which provider timestamps, fees, failure details, and refund amounts must be persisted? | Affects reconciliation, support, compliance, and schema scope. | Product/compliance requirements and actual Test Mode payloads. |
| What is the partial-refund policy? | Current code maps `refund.processed` to whole-donation `REFUNDED` and has no refund record. | Confirmed refund requirements and provider payloads. |
| Should the development auto-transition and `simulate-success` endpoint remain? | They can race with real Test Mode events and synthesize payment IDs. | Development/test policy. |
| How should missing-donation webhooks be handled? | Current 200 acknowledgement prevents provider retries but can lose a correlating event. | Operational retry/reconciliation policy. |
| What payment-method mapping is required? | Provider methods and Trace-It `PaymentMethod` values are not automatically identical. | Product/payment owner decision and real Checkout behavior. |
| Which existing blockchain attestation events remain individually anchored? | Some may have consent/compliance value while ordinary payment events should be batched. | Compliance/product scope decision. |
| What program upgrade/redeployment path is available for the anchor instruction? | Existing Anchor account layouts may not be safely mutable in place. | Upgrade authority and deployment policy. |

## 19. Migration Risks

| Risk | Mitigation |
|---|---|
| A route still treats a Solana result as business success. | Search all `getBlockchainService()`, `recordDonation()`, `recordDisbursement()`, `updateDonationStatus()`, and `solanaTxHash` usages; add outage tests before removing code. |
| Existing webhook/service calls are awaited and increase completion latency. | Make the PostgreSQL transaction the response boundary and move anchoring to durable asynchronous work. |
| Flat `AuditLog` data is not sufficient to reconstruct a deterministic chain. | Define canonical event serialization and chain concurrency rules before building the anchor worker. |
| Anchor batches are duplicated after timeout or worker crash. | Persist deterministic batch identity, check existing anchor state, and reconcile confirmed transactions before retrying. |
| Solana succeeds but PostgreSQL does not record the signature. | Reconcile by deterministic identity/root; do not blindly submit a new batch. |
| Existing retry queue is keyed to donations. | Add anchor-aware persistence or an anchor queue path rather than overloading `donationId` with another entity type. |
| Smart-contract account layouts cannot be upgraded in place. | Confirm upgrade authority and deployment policy before modifying `lib.rs`, instruction contexts, or state accounts; plan a redeployment if required. |
| Frontend expects individual transaction IDs or mock transaction shapes. | Change backend response semantics first, then update the listed frontend consumers and types. |
| Retained NGO/cohort/attestation requirements are removed accidentally. | Treat them as separate scope decisions; keep them asynchronous until reviewed. |
| Historical individual on-chain records cannot be mapped to new anchors. | Preserve read/verification support during transition and define how historical records coexist with new audit-root verification. |
| Private key or HMAC secret is exposed during worker integration. | Keep signing server-side, use deployment secret storage, and never pass credentials to routes or frontend code. |

## 20. Final Developer Checklist

### Before Coding

- [ ] Confirm current backend and Anchor test/build baseline.
- [ ] Confirm program ID, deployed account layouts, and upgrade authority.
- [ ] Inventory every blockchain call and every frontend transaction-ID dependency.
- [ ] Agree on canonical audit event serialization and anchor identity.
- [ ] Audit `razorpay.ts` and its callers against the Razorpay integration findings.
- [ ] Confirm the Razorpay SDK/API, Checkout flow, Test Mode webhook configuration, and authoritative payment event.
- [ ] Confirm PostgreSQL payment/donation fields and the provider-event idempotency strategy.

### During Migration

- [ ] Create Razorpay orders server-side and persist the server-created order ID.
- [ ] Verify Checkout responses and webhook signatures server-side.
- [ ] Validate provider order/payment identifiers, amount, currency, and provider state.
- [ ] Ensure duplicate provider events do not create duplicate business or audit transitions.
- [ ] Define and test refund behavior without guessing unsupported provider fields.
- [ ] Emit business-significant payment/donation audit events into PostgreSQL.
- [ ] Add PostgreSQL audit-chain persistence before removing individual blockchain calls.
- [ ] Keep Solana calls asynchronous and non-authoritative.
- [ ] Reuse existing hashing, wallet, connection, PDA, submission, and retry infrastructure.
- [ ] Persist pending anchor batches before submission.
- [ ] Ensure payment confirmation does not depend on Solana and payment audit events can enter an anchor batch.
- [ ] Test RPC failure, worker restart, duplicate retry, and ambiguous confirmation.

### Before Removing Old Logic

- [ ] Real Razorpay Test Mode order creation and Checkout verification work.
- [ ] Captured, failed, delayed, duplicate, and out-of-order provider events are handled.
- [ ] Invalid provider signatures and API failures cannot create successful donations.
- [ ] Donation, disbursement, status, and attestation workflows succeed with Solana unavailable.
- [ ] Audit-chain verification works without Solana.
- [ ] Anchor submission and reconciliation work against the chosen cluster.
- [ ] Individual payment/donation blockchain recording is no longer required.
- [ ] Retained NGO/cohort/attestation scope is explicitly confirmed.
- [ ] Historical records and compatibility behavior are understood.

### Before Merge

- [ ] Backend tests and typecheck pass.
- [ ] Anchor build/tests pass where applicable.
- [ ] Payment-provider success, failure, signature, idempotency, database, and retry tests pass.
- [ ] Outage and recovery tests pass.
- [ ] Verification covers valid, tampered, pending, failed, and duplicate states.
- [ ] Payment succeeds operationally while Solana/RPC is unavailable and anchor retry is independent.
- [ ] Frontend no longer requires individual blockchain confirmation for normal workflows.
- [ ] No private keys or secrets are committed or exposed to the frontend.
- [ ] Documentation and deployment instructions describe PostgreSQL as the source of truth.