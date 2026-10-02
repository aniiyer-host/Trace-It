# Phase 5 Focused Security Review

**Reviewed:** 2026-09-30  
**Scope:** `traceit_anchor`, Phase 2 client, Phase 3 worker, Phase 4 verifier, and Phase 5 release tooling.

## Findings

| Area | Result | Evidence / residual action |
|---|---|---|
| Authority constraints | Pass | Initialization is compiled-bootstrap-only; writes require `AnchorConfig.authority`; rotation is two-step. Devnet identity approval remains open. |
| PDA seeds | Pass | Singleton config uses `anchor_config`; immutable records use `anchor + exact 32-byte batchKey`; client and Rust vectors agree. |
| Duplicate/idempotency | Pass | On-chain `init` prevents overwrite; client accepts an existing PDA only after every immutable field matches. |
| Arithmetic/account sizing | Pass | Checked contiguous range/count arithmetic, `u64/u32` bounds, exact 77/167-byte allocations, and maximum-value tests pass. |
| RPC/account trust | Pass | Owner, executable bit, exact length, discriminator, PDA/bump, authority, schema, timestamp, and fields are checked before verification. Transaction evidence validates signer, accounts, program, and discriminator. |
| RPC failover | Pass | Reads fail over only on transport exceptions; writes remain primary-only and ambiguity enters reconciliation. |
| Secret boundaries | Pass with operational dependency | No secrets/keypairs are committed by Phase 5 tooling. Operators/DevOps must provide approved external custody and secret injection. |
| Upgrade authority | Blocked operationally | Final devnet program identity and upgrade authority must be approved and recorded before deployment. Production requires separate offline/multisig custody. |
| Deployment funding | Blocked operationally | Observed balance is 1.026224262 SOL versus a 3.5928428 SOL measured peak requirement. |

## Conclusion

No unresolved code-level critical finding was identified in the blockchain-owned path. Deployment is intentionally blocked until public identity consistency, custody approval, sufficient devnet funding, and explicit transaction approval are satisfied. These controls prevent an unreviewed keypair or underfunded partial deployment from becoming the canonical program.
