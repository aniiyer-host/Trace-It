# Trace-It Minimal Anchor Program v1

## Program Boundary

`programs/traceit_anchor` is a new minimal program. It stores immutable audit
anchors only and deliberately excludes donation, status, disbursement, NGO,
cohort, and attestation instructions. The legacy `traceit` program remains in
the workspace for historical reads and migration testing.

The current Anchor v1 program ID configured for the reviewed Devnet candidate
and local tests is
`3CLytt82BKNwqMQA7M9fqJrMAhgD5t9dpuDC4TwutVFa`. The deployment record remains
`BLOCKED_PREDEPLOYMENT`; configuring an ID does not mean the program has been
deployed. The legacy program ID remains
`5fj53usXqFvfah3x7rYo6BxQnrvBprBZsGU49XhQxzV3`.

## Instructions

- `initialize_config`: creates the singleton config and requires the compiled
  bootstrap authority
  `5jV2gq2stVAbNnrHW8w55LyDWEhcAQPdZpWFwxpW9q7W`; arbitrary first-caller
  initialization fails.
- `set_paused`: the current authority pauses or resumes new anchors.
- `propose_authority`: records a nonzero, different pending authority.
- `accept_authority`: requires the pending authority's signature and completes
  rotation. The old authority immediately loses write access.
- `record_anchor`: creates an immutable PDA for a nonempty, contiguous,
  schema-v1 range with a nonzero 64-byte SHA-512 root.

All successful test transactions are simulated before submission. Anchor 0.29
under Node 24 cannot directly simulate valid transactions signed by a wallet
other than the provider; those cases use Solana RPC's mandatory transaction
preflight simulation before localnet submission.

## Accounts and Rent

| Account | Bytes | Rent-exempt minimum* |
|---|---:|---:|
| `AnchorConfig` | 77 | 1,041,400 lamports |
| `AnchorRecord` | 167 | 1,498,600 lamports |

\*Calculated using the Solana 1.17 rent parameters; deployment tooling must
query the target cluster again before funding.

`AnchorRecord` stores `[u8;32]` batch key, `[u8;64]` root, start/end `u64`,
count `u32`, schema `u16`, recording authority, Solana Clock timestamp, and PDA
bump. See `anchor-protocol-v1.md` for byte encoding and seeds.

## Generated Interfaces

- IDL: `blockchain/idl/traceit_anchor.json`
- TypeScript type/IDL constant: `blockchain/client/traceit_anchor.ts`
- Immutable-field matcher: `blockchain/client/anchorRecord.ts`

Regenerate with `NO_DNA=1 anchor build`, then update both committed generated
files from `target/idl` and `target/types` in the same change.
