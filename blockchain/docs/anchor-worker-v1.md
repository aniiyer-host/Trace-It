# Anchor Worker v1

The Phase 3 worker is implemented in `backend/src/services/anchor/anchorWorker.ts`. The PostgreSQL repository, event batch builder, scheduler, and runtime bootstrap live alongside it under `backend/src/services/anchor/`. Normal API success remains independent of Solana availability.

## Persistence contract

`PrismaAnchorBatchRepository` implements the durable contract using PostgreSQL row locks (`FOR UPDATE SKIP LOCKED`), claim-token compare-and-set transitions, and atomic batch/event status updates. `AnchorBatchService` serializes competing batch construction with a transaction-scoped advisory lock. It consumes unbatched chained provenance records in ID order, verifies canonical hashes and chain links, and groups only contiguous IDs; a sequence gap produces a smaller batch (possibly a single event), never a fabricated contiguous range.

Apply migration `20261014180000_add_durable_anchor_worker` before enabling the runtime. Startup checks the required schema columns and disables anchoring with an explicit error if the migration is missing. The anchor writer uses the separate `TRACEIT_ANCHOR_RPC_URL`, `TRACEIT_ANCHOR_WALLET_KEYPAIR_PATH`, `TRACEIT_ANCHOR_PROGRAM_ID`, and `TRACEIT_ANCHOR_CLUSTER` configuration; legacy `SOLANA_PROGRAM_ID` is not used for the v1 anchor program.

The migration is forward-only once new worker states are written: the legacy
enum cannot represent all v1 statuses, and removing the added columns would
discard leases, retry history, and reconciliation evidence. Rollback requires a
reviewed data-preserving conversion or a database snapshot; there is no
automated down migration.

`claimNext` selects one due `PENDING`, `RETRYABLE`, `SUBMITTING`, or `RECONCILIATION_REQUIRED` row, assigns an opaque claim token and lease expiry, and returns its prior status as `claimedFromStatus`. `renewClaim` extends only the matching live token; the worker calls it every third of a lease while processing. Every transition compares the row ID and current claim token, and an expired/stale token cannot update a row.

The repository must keep `batchKey`, `auditRoot`, sequence range, count, schema version, and source creation time immutable. `recoverExpiredClaims` clears expired ownership without discarding the prior state. Due work is ordered by `nextAttemptAt`, then source creation time. Terminal and confirmed rows are never claimable.

Required durable states are:

```text
PENDING -> SUBMITTING -> CONFIRMED
                     -> RECONCILIATION_REQUIRED -> CONFIRMED | RETRYABLE
PENDING/RETRYABLE -> RETRYABLE | TERMINAL_FAILURE | DEAD_LETTER
```

## Failure safety

The worker verifies the deterministic PDA before every fresh send. It persists `SUBMITTING` before the RPC call. A timeout after send retains the signature and enters reconciliation. Recovered `SUBMITTING` and ambiguous rows are reconciled without sending. Only after three separately claimed absence checks does a row become eligible for a new submission. Existing records succeed only when the Phase 2 client validates every immutable field; mismatches are terminal integrity conflicts.

Retryable failures use bounded exponential backoff with symmetric jitter. The default policy is eight attempts, 1–60 second delay, a 30-second lease, and three reconciliation checks. Exhaustion enters `DEAD_LETTER` for manual review. A database failure after an on-chain confirmation leaves the `SUBMITTING` lease recoverable so the next worker confirms by PDA.

## Operations and lifecycle

Inject implementations of `AnchorWorkerLogger`, `AnchorWorkerMetrics`, and `AnchorAuthorityMonitor`. Metrics expose backlog counts, oldest pending age, operation outcomes/latency, end-to-end confirmation latency, recovered claims, integrity conflicts, and authority balance. Logs contain event names and structured fields without payload or key material.

The application starts the event scheduler and worker only after configuration and schema checks succeed. Shutdown stops scheduling first and then waits for active worker processing. The migration is additive and was created with the integration; it must be reviewed and applied to the intended database before anchoring is operational.

## PostgreSQL integration test

`backend/tests/anchorPersistence.integration.test.ts` exercises actual PostgreSQL
transactions, advisory locks, row claims, lease recovery, and state transitions.
It is skipped unless `ANCHOR_TEST_DATABASE_URL` is set. Before running it, create
a separate, empty, disposable PostgreSQL database on loopback with a name
beginning `traceit_anchor_test_`, and apply the normal migrations to that
database only. Set `ANCHOR_TEST_DATABASE_DISPOSABLE=YES_I_CONFIRM` to opt in.
The suite refuses non-loopback hosts and databases containing provenance or
anchor-batch rows; it never falls back to `DATABASE_URL`, applies migrations,
resets a database, or contacts Solana.

Run from `backend/` with:

```sh
ANCHOR_TEST_DATABASE_URL='postgresql://…/traceit_anchor_test_<unique>' \
ANCHOR_TEST_DATABASE_DISPOSABLE=YES_I_CONFIRM \
npm test -- --runTestsByPath tests/anchorPersistence.integration.test.ts
```
