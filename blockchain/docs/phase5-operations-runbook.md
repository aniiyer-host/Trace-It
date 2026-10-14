# Phase 5 Devnet Operations Runbook

## Release boundary

The minimal `traceit_anchor` program is a new deployment. The legacy `traceit` program remains read-only-compatible and must not be upgraded as part of this release. Mainnet is excluded until a separate checklist and explicit approval are completed.

Never commit or print a keypair, seed phrase, private RPC token, or populated environment file. Deployment commands receive keypair paths from the operator environment. Public addresses and artifact hashes are recorded in `blockchain/deployments/devnet-anchor.json`.

## Identities and custody

The following roles are distinct even when the approved devnet policy temporarily assigns the same address:

- fee payer: pays deployment and anchor rent/fees;
- bootstrap/runtime authority: initializes config and signs anchors;
- upgrade authority: controls program upgrades;
- program keypair: fixes the executable address and is needed only for initial deployment.

Production must place upgrade authority under offline or multisig custody and keep it separate from the online runtime signer. Runtime rotation uses `propose_authority` followed by `accept_authority`; both transactions must be simulated and independently approved. Fee-payer rotation is an off-chain configuration change followed by a balance and smoke check. Upgrade-authority transfer uses `solana program set-upgrade-authority` only after verifying both public addresses and obtaining change approval.

## Deployment procedure

1. Allocate the program identity under approved custody. Synchronize `declare_id!`, both relevant `Anchor.toml` entries, test/client constants, backend configuration, and generated interfaces in one reviewed change.
2. Run `NO_DNA=1 anchor build`, the full local-validator suite, backend tests, and IDL compatibility checks.
3. Record the binary and IDL SHA-256 hashes. Preserve the reviewed `.so` as the rollback artifact.
4. Run the read-only preflight:

   ```bash
   TRACEIT_DEPLOYMENT_PROGRAM_ID=<public-program-id> \
   TRACEIT_FEE_PAYER_PUBKEY=<public-fee-payer> \
   TRACEIT_UPGRADE_AUTHORITY_PUBKEY=<public-upgrade-authority> \
   npm run phase5:preflight
   ```

5. Review cluster, program ID, fee payer, upgrade authority, hashes, balance, and peak rent estimate. Obtain explicit transaction approval.
6. After approval, set the guarded consent variable and invoke `bash scripts/deploy-devnet.sh`. The script rebuilds, checks the binary hash against the reviewed manifest, confirms the supplied fee payer/upgrade authority public keys, refreshes the Devnet preflight, and refuses to proceed if preflight is not ready or the program account already exists. It uses the same `ANCHOR_WALLET` as fee payer and upgrade authority. It does not upgrade an existing program.
7. Record program ID, ProgramData address, deployment slot, authorities, artifact hashes, and explorer evidence in the manifest.
8. Configuration initialization and anchor creation are separate approvals and separate invocations of the guarded `npm run phase5:smoke`. Set `TRACEIT_SMOKE_ACTION=initialize-config` for only the config instruction; after verifying its result and obtaining a new approval, set `TRACEIT_SMOKE_ACTION=write-anchor` to write only the public `multiple_events` fixture. Each action checks Devnet genesis and authority, simulates its instruction before sending, and verifies the resulting account. Anchor mode refuses to initialize a missing config.
9. Rerun preflight with `TRACEIT_EXPECT_DEPLOYED=true` and archive command output with the release evidence.

The preflight queries current rent rather than assuming static fees. The read-only preflight on 2026-10-15 verified the 232,136-byte artifact and estimated peak temporary funding at 3,592,842,800 lamports, including program, doubled ProgramData capacity, deploy buffer, config, first anchor, and a 0.05 SOL fee reserve. The observed fee-payer balance was 4,870,691,200 lamports. The buffer is temporary but must be fundable during deployment. Refresh all values immediately before any transaction.

The current deployment identity and artifact hash are recorded in
[`../deployments/devnet-anchor.json`](../deployments/devnet-anchor.json). The
last preflight there is historical; deployment requires a fresh successful
preflight immediately before submission.

## Submission and RPC policy

Phase 2 simulates each anchor transaction, submits once with preflight enabled, and confirms against the same blockhash validity window. `maxRetries` is zero at the client because Phase 3 owns durable retries. Confirmation ambiguity enters PDA reconciliation and is never blindly resent.

`ReadFailoverAnchorChainAdapter` and `ReadFailoverAnchorTransactionVerifier` may use secondary RPCs after transport failure. Authoritative `null`, invalid-account, mismatch, or transaction-integrity results do not fail over. Writes always use the primary RPC; a write transport ambiguity is reconciled by deterministic PDA.

## Monitoring and alerts

The DevOps dashboard must include authority balance, pending/retrying/dead-letter counts, oldest pending age, confirmation latency, RPC outcomes by class/provider, recovered claims, and integrity conflicts. Default alerts are:

| Condition | Warning | Critical |
|---|---:|---:|
| Oldest pending batch | 5 minutes | 30 minutes |
| RPC failure ratio | 5% | 25% |
| Authority balance | — | Below 1 SOL |
| Dead-letter batch | — | Any |
| Integrity conflict | — | Any |

Alert routing and paging ownership belong to DevOps; the blockchain team supplies the metrics and thresholds.

## Pause, incident, and recovery

- RPC outage: stop new worker claims if necessary, retain durable states, restore/fail over reads, then reconcile every `SUBMITTING` batch before resuming writes.
- Runtime-key concern: pause using a still-trusted authority, disable the worker, inspect recent anchors, and complete two-step authority rotation. If no trusted runtime signer remains, escalate to the approved program-upgrade procedure.
- Upgrade-key concern: halt releases, transfer upgrade authority from an uncompromised signer or organizational recovery mechanism, and audit program data. Never deploy an emergency binary without normal build/hash review.
- Integrity conflict: stop the affected batch, preserve database/on-chain evidence, page Security, and do not overwrite or reinterpret the PDA.
- Bad release: pause new anchors, verify historical accounts remain readable, then redeploy the preserved previous `.so` through the same approval process. Account layouts are immutable for v1; rollback must not downgrade incompatible state.

## Release checklist

- [ ] Program identity and all configured IDs match.
- [ ] Build and local-validator tests pass from the committed lockfile.
- [ ] Backend service/worker/verifier suites pass.
- [ ] IDL and binary hashes match reviewed artifacts.
- [ ] Authority, upgrade authority, fee payer, cluster, and balance are reviewed.
- [ ] Security review has no unresolved critical finding.
- [ ] Deployment and smoke transactions are explicitly approved.
- [ ] ProgramData address, slot, signatures, and hashes are recorded.
- [ ] Config authority/version/pause state and fixture anchor read-back match.
- [ ] Monitoring, alert routing, rollback artifact, and incident contacts are active.
