# Phase 6 Implementation and Handoff Guide

> **Updated:** 2026-09-30
>
> **Architecture:** PostgreSQL-first application with asynchronous Solana audit anchoring
>
> **Current position:** Blockchain-owned implementation through Phase 6 is complete. Legacy application writes and retry execution fail closed while historical readers remain available. The new anchor program has **not** yet been deployed or smoke-tested on devnet, and the Backend/Data integration evidence below is still required before operational rollout.

## 1. Purpose

This document is the continuation guide for a developer or a new chat starting Phase 6. The canonical requirements remain in [`../../blockchain_implementation_plan.md`](../../blockchain_implementation_plan.md). This guide explains what was actually delivered, what remains operationally incomplete, and the safe order for retiring the old account-per-event blockchain paths.

The target architecture is:

```text
business transaction -> PostgreSQL state + audit entry
                     -> immutable AnchorBatch
                     -> asynchronous anchor worker
                     -> Solana AnchorRecord PDA
                     -> read-only public verification
```

Solana proves that a previously calculated audit root existed; it does not authorize or execute donations, payments, disbursements, status changes, or attestations.

## 2. Achievement Summary: Phases 0–5

| Phase | Delivered | Current qualification |
|---|---|---|
| **0 — Baseline and contract** | Restored reproducible Anchor 0.29/Solana 1.17 builds, committed the compatible lockfile, retained 17 legacy local-validator tests, chose a separate minimal program, froze serialization/PDA/authority rules, and added shared Rust/TypeScript vectors. | Complete. Legacy program remains at `5fj53u…XzV3`; it is preserved for historical compatibility. |
| **1 — Minimal anchor program** | Added `traceit_anchor`, singleton `AnchorConfig`, immutable `AnchorRecord`, `record_anchor`, pause/unpause, and two-step authority rotation. Enforced signer, PDA, schema, root, range, count, and overflow constraints. | Complete locally. Account sizes are 77 bytes and 167 bytes. Development ID `4qLw…GCHX` is not the selected deployment ID. |
| **2 — Client/service boundary** | Added typed submission, fetch, verification, reconciliation, PDA derivation, strict account decoding, simulation-before-send, error classification, and explorer URL support in `backend/src/services/anchor/`. | Complete but intentionally disconnected from business routes. An ambiguous send is reconciled by PDA and is never blindly retried. |
| **3 — Worker/reconciliation** | Added `AnchorWorker`, repository contract, leases, claim tokens, heartbeats, crash recovery, bounded retries, reconciliation, dead-letter behavior, metrics, and graceful shutdown. | Blockchain-owned code complete. Backend/Data must still implement the durable `AnchorBatchRepository` and bootstrap the worker. |
| **4 — Verification** | Added read-only verification with explicit states, adversarial account checks, optional transaction inspection, JSON-safe output, fixtures, and legacy-reader compatibility. | Blockchain-owned code complete. Backend must first verify the local audit chain and wire a public route; frontend must consume that route. |
| **5 — Devnet/operations** | Added read-only RPC failover, deployment preflight, guarded deployment and smoke scripts, release controls, artifact/IDL hashes, monitoring thresholds, incident procedures, and focused security review. Local recovery evidence recorded 39 blockchain tests and 189 backend tests passing. | Tooling complete; release incomplete. No new-program devnet deployment, initialization, or smoke write has occurred. |

Important implementation references:

- protocol: `blockchain/docs/anchor-protocol-v1.md`
- program: `blockchain/docs/anchor-program-v1.md`
- client: `blockchain/docs/anchor-client-service-v1.md`
- worker: `blockchain/docs/anchor-worker-v1.md`
- verifier: `blockchain/docs/anchor-verification-v1.md`
- release runbook: `blockchain/docs/phase5-operations-runbook.md`
- release state: `blockchain/deployments/devnet-anchor.json`

## 3. Phase 5 Work That Must Precede Operational Rollout

The user approved candidate program address `5s9AEJfEKfUrcCszpfdkZmka1XcX2XA7mbyDTmKmQywW`. The repository still declares development address `4qLwniS2NeDrqftgb83GbYVHWVbBBbUcjDR1Ncm5GCHX`. Treat the candidate as approved but **not synchronized or deployed**.

Before deploying the Phase 6 cutover release:

1. Synchronize the selected ID through `declare_id!`, both `Anchor.toml` cluster entries, generated IDL/client constants, tests, backend configuration, and the deployment manifest.
2. Rebuild and rerun the full local suites; record the new binary and IDL hashes.
3. Re-run the read-only devnet preflight. `Emi2GHuHM4UnY6TqcXio3Cbfe5H1E2uukL3QgBziQSrG` is the current fee payer/bootstrap authority. Funds sent to `5s9A…QywW` belong to the candidate address, not automatically to `Emi2…QSrG`; verify that the actual fee payer can cover the measured peak requirement.
4. Review simulation results and obtain explicit approval for each deployment/initialization/smoke transaction.
5. Deploy, initialize `AnchorConfig`, submit the public fixture, verify exact read-back, and update the manifest with ProgramData address, slot, authorities, signatures, PDAs, hashes, and explorer evidence.
6. Demonstrate submission, ambiguous-result reconciliation, fetch, and verification on devnet. Do not attempt mainnet.

## 4. Phase 6 Entry Gate: Evidence Owned by Other Teams

Phase 6 is a cutover, not simply code deletion. Backend/Data/Product must first supply evidence that:

- donation and payment flows succeed while Solana is disabled or unavailable;
- disbursement and status flows succeed while Solana is disabled;
- chosen NGO, cohort, and attestation flows succeed without individual Solana writes;
- each relevant business transaction atomically produces a canonical PostgreSQL audit entry;
- the audit chain can be reconstructed and locally verified;
- immutable `AnchorBatch` rows are created with the v1 fields and byte rules;
- a durable `AnchorBatchRepository` implements claim, lease, transition, recovery, and immutable-field guarantees;
- the worker is bootstrapped outside request handlers with secure signer injection and graceful shutdown;
- backend and frontend do not use an individual transaction signature as proof that a business operation succeeded;
- Product/Compliance has made a written retain-or-retire decision for NGO, cohort, and direct-attestation writes.

If this evidence is missing, record the dependency and continue only with non-destructive inventories, tests, fixtures, deprecation annotations, and migration preparation.

## 5. Phase 6 Blockchain-Team Work

The work in this section was implemented on 2026-10-02. The definitive disposition and rollout fields are in `blockchain/docs/phase6-legacy-cutover.md`.

### 5.1 Inventory and freeze legacy writers — complete

Create an exact call-site inventory before editing. Current normal write paths include `recordDonation`, `updateDonationStatus`, `recordDisbursement`, NGO/cohort registration, attestation storage, and donation/status retry operations. Identify routes, services, jobs, configuration, tests, and generated APIs that can initiate each instruction. Record a cutover release and Solana slot after which no new ordinary business-event account should appear.

### 5.2 Remove ordinary business-event writes — complete at the application gateway

After the entry gate passes:

- remove/disable normal calls to `recordDonation()`;
- remove/disable normal calls to `updateDonationStatus()`;
- remove/disable normal calls to `recordDisbursement()`;
- remove donation/status operations from `blockchainRetryProcessor` and prevent old queued jobs from producing new legacy accounts;
- replace status-parity reconciliation with `AnchorBatch`/PDA reconciliation;
- remove obsolete write-only configuration only after proving no retained reader or exceptional path consumes it.

Business routes must commit their PostgreSQL transaction and audit entry without waiting for Solana. They must not convert an anchor outage into an API failure.

### 5.3 Resolve exceptional legacy instructions — complete

No exception was approved, so Phase 6 retires NGO, cohort, and direct-attestation writes along with ordinary donation/status/disbursement writes:

- `register_ngo` and `register_cohort`: retain only if a public registry/proof requirement is explicitly justified; retained calls remain asynchronous and require a secured authority.
- direct attestation instructions: normally retire in favor of audit batches. Retain only for an explicitly approved consent/compliance case and only after implementing real signature semantics. The legacy `verifyAttestation()` account-existence check is not cryptographic verification.

Do not silently preserve these paths “just in case.” Document the owner, purpose, payload privacy review, authority, retry model, and retirement condition for every retained write.

### 5.4 Preserve historical verification — complete

Do not delete legacy account decoders or read APIs during initial cutover. Existing DonationRecord, NGO, cohort, disbursement, and attestation accounts must remain readable for the declared compatibility window. Mark old write methods and IDL/client APIs deprecated, publish migration notes, and distinguish “historical record found” from “current application state.” PostgreSQL remains authoritative.

### 5.5 Validate the cutover

Required evidence includes:

- outage tests showing normal APIs succeed with Solana/RPC disabled;
- tests proving no ordinary workflow calls an individual-record instruction;
- tests proving stale retry rows cannot create legacy records;
- anchor worker tests for claim/restart/timeout/reconciliation/dead-letter behavior against the durable repository;
- public verification tests for pending, missing, mismatch, invalid account, RPC unavailable, unsupported schema, and verified states;
- legacy read-only compatibility tests;
- a devnet observation window showing only `AnchorRecord` writes (plus explicitly approved exceptions);
- metrics and alerts for backlog age, failures, dead letters, integrity conflicts, latency, and authority balance.

Standard local checks remain:

```bash
cd blockchain
NO_DNA=1 anchor build
NO_DNA=1 npm test

cd ../backend
npm run typecheck
npm test
```

## 6. Ownership During Phase 6

| Owner | Responsibility |
|---|---|
| Blockchain | Legacy-write inventory/removal, anchor client/worker/verifier behavior, historical readers, migration notes, devnet evidence, blockchain tests and runbooks. |
| Backend/Data | Canonical audit entries, hash-chain/root generation, durable batch schema/repository, ACID guarantees, route composition, outage behavior. |
| Frontend | Stop depending on individual signatures; present verification states and explorer links without treating RPC outage as tampering. |
| Product/Compliance | Decide exceptional NGO/cohort/attestation retention and compatibility duration. |
| DevOps/Security | Key custody, secret injection, worker process, RPC configuration, dashboards, alert routing, upgrade controls. |

## 7. Phase 6 Definition of Done

The blockchain-owned implementation is complete: ordinary and exceptional legacy writes fail closed, legacy retry jobs cannot execute, and historical readers/IDL remain available. Operational Phase 6 is complete only after the durable anchor worker publishes immutable batches, the release/slot boundary is recorded, and external outage and integration evidence confirms normal workflows do not depend on Solana.

## 8. New-Chat Restart Checklist

At the beginning of a continuation session:

1. Read `blockchain_implementation_plan.md`, this guide, the Phase 5 runbook, and `blockchain/deployments/devnet-anchor.json`.
2. Inspect `git status`; the worktree contains uncommitted Phase 5 work and the intentional deletion of `blockchain_implementation_roadmap.md`. Do not discard unrelated changes.
3. Confirm whether the `5s9A…QywW` ID synchronization and devnet deployment have since occurred. Trust the manifest and on-chain read-only checks, not memory.
4. Confirm which Phase 6 external evidence is available and obtain the Product/Compliance scope decision.
5. Run baseline tests before changing legacy call sites.
6. Make no Solana transaction without showing cluster, instruction, accounts, fee payer, expected cost, and simulation result, followed by explicit approval.
