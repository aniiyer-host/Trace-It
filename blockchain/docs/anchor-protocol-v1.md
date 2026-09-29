# Trace-It Anchor Protocol v1

## Status and Compatibility

This specification freezes the blockchain boundary for Phase 1. The legacy
program remains readable at `5fj53usXqFvfah3x7rYo6BxQnrvBprBZsGU49XhQxzV3`.
The stale devnet entry `5AFcU61X6LoQSNTcCFeEKauVsfCwfvtUDXY6XhMq7oCM` is
closed and must not be reused. The minimal anchor program will be a new
deployment so its authority model and IDL are independent of legacy writes.

The supported build matrix is Anchor CLI/Rust/TypeScript `0.29.0`, Solana CLI
and `solana-program` `1.17.25`, and the committed `Cargo.lock`. Backend code may
use Anchor `0.32.x` only behind the legacy adapter; the v1 anchor client must use
the generated v1 IDL through a version-isolated adapter.

## Integer and Hash Encoding

All strings below are raw ASCII without a terminator. Integers are unsigned,
fixed-width, big-endian bytes. Hashes are raw bytes, never hex text.

```text
auditRoot = SHA-512(
  "TRACEIT_AUDIT_ROOT_V1" ||
  schemaVersion:u16 || startSequence:u64 || endSequence:u64 ||
  eventCount:u32 || eventHash[0]:[u8;64] || ... || eventHash[n-1]:[u8;64]
)

batchKey = first_32_bytes(SHA-512(
  "TRACEIT_ANCHOR_V1" ||
  schemaVersion:u16 || startSequence:u64 || endSequence:u64 ||
  eventCount:u32 || auditRoot:[u8;64]
))
```

Events are ordered by ascending, contiguous audit sequence. The Backend/Data
team owns canonical event serialization and each 64-byte `eventHash`; this
contract owns their ordered aggregation. Validation rejects an empty batch,
zero root, `endSequence < startSequence`, or a count unequal to both the number
of hashes and `endSequence - startSequence + 1`. Arithmetic is checked.
The initial program accepts only `schemaVersion = 1`; later versions require an
explicit program/client compatibility update.

## Accounts and Authority

- `AnchorConfig` PDA seeds: `["anchor_config"]`.
- `AnchorRecord` PDA seeds: `["anchor", batchKey]`.
- `AnchorConfig`: discriminator (8), authority (32), pending authority
  (`Option<Pubkey>`, 33), version (2), paused (1), bump (1): **77 bytes**.
- `AnchorRecord`: discriminator (8), batch key (32), audit root (64), start/end
  (8 each), event count (4), schema version (2), authority (32), timestamp (8),
  bump (1): **167 bytes**.

Initialization must require a compiled bootstrap authority signer; first-caller
initialization is forbidden. Version 1 includes pause/unpause and two-step
authority rotation (`propose`, then `accept`). Every write checks the config,
current authority, pause flag, exact PDA, and fixed input sizes. Duplicate PDAs
are idempotent only after every immutable field matches.

## Legacy and Deployment Decisions

The new deployment contains only config/authority operations and
`record_anchor`. Legacy accounts remain read-only through compatibility
adapters. New donation, status, and disbursement writes stop at cutover. NGO and
cohort writes may continue asynchronously only until cutover; receipt/delivery
attestations migrate into audit batches unless Product/Compliance explicitly
approves a separately secured individual-record requirement.

The shared normative vectors are in `tests/fixtures/anchor-protocol-v1.json`.
