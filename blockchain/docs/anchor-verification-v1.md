# Anchor Verification v1

`AnchorVerificationService` is the blockchain-owned half of public audit verification. The backend audit layer must first reconstruct and validate the local audit chain, then pass only a `LocallyVerifiedAnchorBatch`. Raw events, donor data, beneficiary data, documents, and payment details are neither accepted nor required.

## Input contract

The internal TypeScript input contains `localVerification: "VERIFIED"`, the immutable `AnchorBatch`, its durable anchor lifecycle state, and an optional stored transaction signature. API adapters must decode 32-byte batch keys and 64-byte roots from canonical lowercase hex and parse sequence strings as unsigned integers before calling the service.

The JSON integration fixture is `blockchain/tests/fixtures/anchor-verification-v1.json`. Public outputs use decimal strings for `u64`/`i64`, base58 for public keys, and lowercase hex for hashes, so every result is JSON-safe.

## Result states

| State | Meaning |
|---|---|
| `VERIFIED` | The deterministic PDA contains a fully validated record matching every local batch field. |
| `LOCAL_VALID_PENDING_ANCHOR` | Local verification passed, but durable state or transaction metadata says anchoring is still pending. |
| `ANCHOR_NOT_FOUND` | A non-pending batch expected an anchor, but its deterministic PDA is absent. |
| `ANCHOR_MISMATCH` | A valid account or supplied transaction reference does not match the expected evidence. |
| `ANCHOR_ACCOUNT_INVALID` | Owner, discriminator, PDA, authority, length, timestamp, or decoded fields are invalid. |
| `RPC_UNAVAILABLE` | RPC transport or transaction lookup failed; this is not evidence of tampering. |
| `UNSUPPORTED_SCHEMA_VERSION` | The local input or stored record uses an unsupported schema. |

Account existence alone never returns `VERIFIED`. Validation reuses the Phase 2 decoder to check configured program ownership, exact discriminator and size, deterministic PDA/bump, trusted authority, schema, root, range, and count.

## Transaction metadata

Transaction verification is configurable. When enabled, `SolanaAnchorTransactionVerifier` requires a confirmed/finalized successful transaction, the configured authority as a signer, and a `record_anchor` instruction for the configured program and exact PDA. Only then are `signature`, `explorerUrl`, and `transactionSlot` returned. Unchecked signatures are never reflected to public clients.

## Integration and compatibility

The verifier is read-only and must be called outside mutation workflows. The public route remains an external integration dependency until the backend audit layer supplies locally verified batches. Existing legacy readers in `blockchainService.ts` remain unchanged for historical donation, NGO, cohort, disbursement, and attestation accounts during the declared compatibility window.
