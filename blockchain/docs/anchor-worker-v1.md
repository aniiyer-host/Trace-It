# Anchor Worker v1

The Phase 3 worker is implemented in `backend/src/services/anchor/anchorWorker.ts`. It accepts only the immutable Phase 2 `AnchorBatch` shape and is intentionally not called by application request handlers. Normal API success is therefore independent of Solana availability.

## Persistence contract

Backend/Data must implement `AnchorBatchRepository` with database transactions and row locking. `claimNext` must atomically select one due `PENDING`, `RETRYABLE`, `SUBMITTING`, or `RECONCILIATION_REQUIRED` row, assign an opaque claim token and lease expiry, and return its prior status as `claimedFromStatus`. `renewClaim` extends only the matching live token; the worker calls it every third of a lease while processing. Every transition must compare both the row ID and current claim token. A stale token must never update a row.

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

Call `start()` only from the process bootstrap after the production repository is available. Await `stop()` during `SIGINT` and `SIGTERM`; it aborts polling and waits for active processing. The current repository has no production `AnchorBatch` datastore, so bootstrap wiring is deliberately gated rather than backed by transient memory.
