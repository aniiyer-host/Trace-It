# Phase 6 Legacy Cutover and Compatibility Policy

> **Implemented:** 2026-10-02
>
> **Code status:** Blockchain-owned retirement implementation complete
>
> **Operational status:** Awaiting Phase 5 devnet completion, Backend/Data audit-batch integration, outage evidence, and deployment of this backend release

## Cutover Decision

Trace-It no longer authorizes individual Solana writes for donations, donation statuses, disbursements, NGO registrations, cohort registrations, or receipt/delivery attestations. No Product/Compliance exception was approved for NGO, cohort, or direct-attestation writes, so all of them follow the audit-batch architecture.

The application write gateway `getBlockchainService()` now always returns `null`. Every legacy `BlockchainService` write method also fails closed with the stable error prefix `LEGACY_BLOCKCHAIN_WRITE_RETIRED` before initialization, account lookup, simulation, or submission. This defense in depth prevents a forgotten call site from sending a transaction.

The old `BlockchainRetryProcessor` is a transaction-free compatibility shell and is no longer started by the API process. Existing `BlockchainRetryQueue` rows are retained as migration evidence but cannot create obsolete accounts. Backend/Data may archive them only under its data-retention procedure.

## Write Disposition

| Legacy operation | Phase 6 treatment |
|---|---|
| `recordDonation` | Retired; donation events belong in immutable audit batches. |
| `updateDonationStatus` | Retired; PostgreSQL status plus canonical audit event is authoritative. |
| `recordDisbursement` | Retired; disbursement/payment references remain off-chain and their audit evidence is anchored. |
| `registerNgo` | Retired; no exceptional public registry requirement was approved. |
| `registerCohort` | Retired; cohort proof hashes migrate to audit events. |
| `storeNgoAttestation` / legacy alias | Retired; receipt attestations migrate to audit events. |
| `storeDeliveryAttestation` | Retired; delivery attestations migrate to audit events. |

Only the new `traceit_anchor` program may receive new blockchain writes, and only through immutable `AnchorBatch` publication. The legacy program itself remains deployed and technically callable by external parties; Trace-It must not treat records created after the operational cutover boundary as application-authoritative.

## Historical Read Compatibility

The legacy program remains at:

```text
5fj53usXqFvfah3x7rYo6BxQnrvBprBZsGU49XhQxzV3
```

Historical account fetch methods remain available through the narrow `getLegacyBlockchainReader()` interface. It exposes donation, NGO, cohort, disbursement, and attestation fetches but no write method. The frozen legacy IDL is committed as `blockchain/idl/traceit_legacy.json` so readers do not depend on a generated `target/` artifact.

Compatibility is indefinite until Product/Compliance approves a dated sunset and all required evidence has been exported and independently validated. Closing or upgrading the legacy program is not part of Phase 6. The previous `verifyAttestation()` account-existence behavior is not a cryptographic signature check and is not exposed by the read-only compatibility interface.

## Operational Boundary Record

The code-level boundary is the Phase 6 release containing this document. The operational boundary cannot yet contain a truthful Solana slot because:

- the new anchor program has not completed Phase 5 devnet deployment;
- this backend release has not been deployed;
- the required Backend/Data cutover evidence has not been supplied.

At operational rollout, Release Engineering must append the following evidence without rewriting this historical decision:

| Field | Required value |
|---|---|
| Backend release/commit | Exact deployed revision containing the fail-closed gateway. |
| Cutover time | UTC deployment time. |
| Legacy devnet slot | Final trusted legacy-write boundary observed at rollout. |
| New anchor program | Deployed program ID and ProgramData address. |
| First anchor | First confirmed batch key, PDA, signature, and slot. |
| Queue disposition | Count and archive reference for inert legacy retry rows. |
| Evidence owner | Named Release/Backend approver. |

Historical verification must label records by this boundary. A legacy account is evidence of the pre-cutover system, not current PostgreSQL state.

## Configuration Changes

`SOLANA_WALLET_KEYPAIR_PATH`, `SOLANA_PROGRAM_ID`, and `BLOCKCHAIN_HMAC_SECRET` no longer enable a legacy application writer. Historical raw reads require only `SOLANA_RPC_URL`; the reader fixes the known legacy program ID and uses an ephemeral non-signing provider identity.

The new anchor worker requires a separate, server-only signer configuration supplied during Backend/Data/DevOps integration. Do not reuse ambiguous legacy variable names for the new program.

## Required Regression Evidence

Validated on 2026-10-02: the backend suite passed 200 tests, the blockchain/local-validator suite passed 41 tests (including `anchor build`), and backend plus frontend production builds completed successfully.

- The legacy application gateway always returns unavailable.
- All legacy write methods return `LEGACY_BLOCKCHAIN_WRITE_RETIRED:*` without RPC work.
- Starting the legacy retry processor performs no database or blockchain work.
- The API bootstrap does not start the legacy processor.
- Historical read methods and the frozen legacy IDL remain available.
- New anchor service, worker, verifier, local-validator, and release tests remain green.
- Normal workflows pass with all legacy wallet/program/HMAC configuration absent.

## Remaining External Work

Blockchain-owned Phase 6 implementation does not create the Backend/Data-owned canonical audit chain, immutable `AnchorBatch` repository, worker bootstrap, public verification composition, or workflow outage evidence. Operational cutover must not be declared complete until those dependencies and Phase 5 devnet evidence exist.
