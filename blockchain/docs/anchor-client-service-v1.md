# Anchor Client Service v1

## Boundary

The Phase 2 client lives in `backend/src/services/anchor/`. It is deliberately
separate from the legacy `BlockchainService` and is not called by routes,
payment handlers, or workers. Its input is an immutable `AnchorBatch`; it never
accepts donor, beneficiary, payment, document, or other business payloads.

The adapter uses `@solana/web3.js` directly rather than the backend's Anchor
0.32 runtime. This isolates the Anchor 0.29 IDL format while retaining the exact
instruction and account layout generated in Phase 1.

## Service Methods

- `deriveAnchorPda(batchKey)` validates the 32-byte key and derives
  `["anchor", batchKey]`.
- `submitAnchorBatch(batch)` validates, checks for an existing record, simulates,
  submits, confirms, and returns a stable result.
- `fetchAnchorRecord(batchKey)` validates owner, executable flag, exact length,
  discriminator, PDA, stored bump, authority, schema, timestamp, and fields.
- `verifyAnchorRecord(batch)` compares every immutable field.
- `reconcileAnchorSubmission(batch)` checks the deterministic PDA and never
  blindly resubmits an ambiguous transaction.
- `getAnchorExplorerUrl(signature)` respects the configured cluster/RPC URL.

Stable outcomes include confirmed, matching duplicate, pending confirmation,
not found, retryable RPC/blockhash failures, program rejection, unauthorized,
integrity conflict, invalid account/schema, and invalid input.

## Production Construction

Create a `Connection`, obtain the server-controlled authority `Keypair` from an
approved secret provider, and inject `SolanaAnchorAdapter` into `AnchorService`.
Do not add filesystem key loading to this module or expose the service to normal
request handlers. Phase 3 owns worker construction and persisted batch state.

The signer is both fee payer and configured authority. Submission always calls
`simulateTransaction`, uses preflight, sends once, and confirms with the same
blockhash validity window. A timeout after obtaining a signature returns
`PENDING_CONFIRMATION`; the caller must reconcile before retrying.

No compute-budget or priority-fee instruction is added in v1 because anchoring
is asynchronous and low throughput. Phase 5 must reassess fees and compute on
devnet. Trusted historical authorities must be supplied during key rotation so
old records remain verifiable.

## Tests

`backend/tests/anchorService.test.ts` covers deterministic PDAs, exact wire
encoding, input boundaries, success, matching/mismatching duplicates, malformed
and adversarial accounts, authority trust, all error categories, simulation
ordering, ambiguous confirmation, reconciliation, and explorer URLs.
