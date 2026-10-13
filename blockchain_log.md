# Blockchain Audit & Cutover Log

**Date:** 2026-10-08:19:58:00

### Changes Made

**1. Disabled legacy blockchain call for `recordDonation`**
- **File:** `backend/src/services/donationService.ts`
- **Lines changed:** 310
- **Reason:** To prevent the system from attempting to write donation records to the legacy `traceit` Solana program during the normal donation success flow. This stops `Donation.solanaTxHash` from being populated with synthetic or real transaction hashes from the legacy system without breaking PostgreSQL state. The conditional check `if (process.env.NODE_ENV !== 'test' && !process.env.JEST_WORKER_ID)` was changed to `if (false /* legacy blockchain disabled... */)`.

**2. Disabled legacy blockchain calls for admin operations**
- **File:** `backend/src/routes/admin.ts`
- **Lines changed:** 84, 177, 467
- **Reason:** To prevent the application from making asynchronous best-effort calls to the legacy blockchain for `recordDisbursement`, `updateDonationStatus`, and `registerNgo`. These are no longer needed and isolating them preserves the PostgreSQL data as the sole source of truth. Each check `if (process.env.NODE_ENV !== "test" && !process.env.JEST_WORKER_ID)` was replaced with `if (false /* legacy blockchain disabled... */)`.

**3. Disabled legacy blockchain call for `registerCohort`**
- **File:** `backend/src/routes/charity.ts`
- **Lines changed:** 568-580
- **Reason:** To isolate the system from legacy cohort registration. The `handleBlockchainOperation` call responsible for pushing cohort data on-chain was commented out, ensuring it does not execute during normal cohort registration flow.

**4. Disabled `BlockchainRetryProcessor` startup**
- **File:** `backend/src/index.ts`
- **Lines changed:** 90
- **Reason:** The retry processor continuously polls for and retries failed legacy blockchain operations. Since the legacy blockchain runtime calls are disabled, the retry processor must not be started to prevent it from processing the backlog and continuing legacy side-effects. The conditional check was updated to `if (false /* legacy blockchain disabled... */)`.

**5. Removed frontend claims of Solana devnet recording**
- **File:** `frontend/src/components/DonateDialog.tsx`
- **Lines changed:** 437-439
- **Reason:** Since the legacy blockchain is disconnected, donations will no longer get a verified Solana transaction signature by default. The UI text `Recorded on Solana devnet` (shown when `txHash` is missing) was misleading and demonstrably invalid in this new isolated state. It was changed to `Payment recorded successfully`.

### Errors Encountered & Fixes
- **None.** The changes were straightforward condition-overrides and code commenting to cleanly disable the legacy integration boundaries without modifying application state machine logic or deleting the underlying implementations.

**Date:** 2026-10-08:20:28:00
### Fixes

**1. Removed dead code `handleBlockchainOperation`**
- **File:** `backend/src/routes/charity.ts`
- **Lines changed:** 27-95
- **Reason:** The helper function became dead code after its only runtime caller was removed during the legacy blockchain isolation step. Consequently, its dependencies (`getBlockchainService` and `addToBlockchainRetryQueue`) were removed from the imports, causing TypeScript compiler errors. The helper function itself was safely removed to resolve the ReferenceErrors.

**Date:** 2026-10-10

### Recent Application Changes and Validation

**1. Exact monetary validation and financial handling**
- **Commit:** `dabf856 fix: use exact monetary validation across payment flows`
- Added exact decimal monetary parsing and safe integer-paise validation, preserving ordinary numeric API inputs while preventing unsafe values from reaching payment or financial side effects. Decimal-safe handling is used for persisted monetary values and allocation-related comparisons.

**2. Provenance and attestation corrections**
- **Commit:** `d851335 fix: make attestation records and verification claims truthful`
- Corrected attestation response typing and consumer handling, removed fabricated verification results, and corrected UI wording so PostgreSQL attestation records are not presented as cryptographic signatures or blockchain broadcasts.
- Provenance work remains in the committed history through `3dbcfa3 feat: add provenance outbox schema`, `03c5f2e feat: add canonical provenance hashing`, `5ce9609 feat: record donation success provenance`, and `85683a9 fix: make disbursement allocation transactional`.

**3. Legacy blockchain runtime isolation**
- **Commit:** `dd09e3c chore: isolate legacy blockchain runtime paths`
- Disconnected legacy runtime calls and retry startup from donation, administrative, and cohort flows, and removed misleading on-chain success claims from the application UI. PostgreSQL remains the financial source of truth; no external blockchain anchoring is claimed by these changes.

**Validation completed**
- Backend TypeScript type-check: passed.
- Frontend TypeScript type-check: passed.
- Database-free money/provenance tests: 20 passed.
- Validator-free Anchor protocol and phase-five operations tests: 10 passed.
- Rust workspace tests: 4 passed.
- Database-backed integration tests, the full frontend build, validator-backed Anchor tests, and complete end-to-end verification were not performed.

### Isolated Blockchain Testing

- A disposable test environment was created at `/tmp/traceit-localtest`.
- A sandbox-only wallet and `traceit_anchor` program keypair were generated. Private keys and keypair contents are intentionally not recorded here.
- Only the sandbox program ID and bootstrap authority configuration were changed. The program authorization check remains enabled.
- The legacy `traceit` program was not modified or used.
- The isolated Anchor build is currently blocked by `ahash 0.8.5` failing on the obsolete `stdsimd` feature gate. The installed Anchor CLI is `1.1.2`, while the project framework dependencies are pinned to `0.29.0`, producing an additional CLI/framework mismatch.
- The documented candidate image `backpackapp/build:v0.29.0` was identified but not downloaded or tested.
- No validator-backed tests have run, and no claim of external blockchain anchoring or recovered original bootstrap authority is made.

The intentional deletion of `agents.md` and the separate modification to `frontend/src/pages/Profile.tsx` remain unrelated working-tree state and are not part of this log entry.

**Date:** 2026-10-10

### Reproducible Isolated Local Blockchain Test Environment

#### Purpose and sandbox

The original blockchain setup contains identity/configuration mismatches and legacy validator scripts with unsafe process-management behavior. The original bootstrap authority keypair was not created by the current developer, and the available wallet does not match the original hard-coded bootstrap authority. An isolated local-testing sandbox was therefore created instead of changing the original blockchain setup.

- **Sandbox:** `/tmp/traceit-localtest`
- **Source:** `blockchain/`
- The sandbox was copied from `blockchain/`, excluding `.git/`, `node_modules/`, `target/`, and `.surfpool/`.
- Sandbox `node_modules` is a symlink to the original `blockchain/node_modules`.
- Sandbox-specific directories include `keys/`, `target/deploy/`, and `logs/`.
- The original blockchain source and configuration remain outside this testing workflow and must remain untouched.

#### Toolchain compatibility

The repository uses Rust `1.89.0`, Anchor framework `0.29.0`, and Solana program dependencies around `1.17.25`. The host tools were mismatched: Anchor CLI `1.1.2` and Solana CLI `1.18.17`. A host build failed in `ahash 0.8.5` because of the obsolete `stdsimd` feature gate.

The documented Docker image `backpackapp/build:v0.29.0` was pulled for an isolated compatible build. The image reported:

- Anchor CLI `0.29.0`
- Solana CLI `1.17.0`
- Rust `1.89.0`
- Cargo `1.89.0`

The command used was:

```bash
docker run --rm \
  --platform linux/amd64 \
  -v /tmp/traceit-localtest:/work \
  -w /work \
  backpackapp/build:v0.29.0 \
  bash -lc 'anchor build -p traceit_anchor'
```

The captured output showed the `traceit_anchor` release build completing and the test profile building. The final exit status and complete test summary were not captured, so this records artifact production only and does not claim a confirmed successful build exit status.

#### Sandbox-only identity and artifact

The sandbox `traceit_anchor` program ID is:

`E34Pu2JCA2EcYRbEPaMcE4EFzEaeM56239UKupjAkUoW`

The sandbox `declare_id!`, Anchor configuration, and test support were updated to match this identity. The sandbox bootstrap authority was set to the sandbox test wallet, while the authorization check remains enabled. The legacy program was not modified or used.

The generated artifact was verified at:

`/tmp/traceit-localtest/target/deploy/traceit_anchor.so`

Its reported size was approximately 227 KB, and the generated program keypair public key matched the sandbox program ID. Private key material and keypair JSON contents are intentionally not recorded here.

#### Local validator and macOS workaround

The validator is running successfully on local RPC port `18899`, bound to `127.0.0.1`. The first two attempts failed during genesis archive extraction with:

```text
Archive error: extra entry found: "._genesis.bin" Regular
```

No corresponding `._*` files were found by filesystem searches. Launching with `COPYFILE_DISABLE=1` resolved the observed failure:

```bash
COPYFILE_DISABLE=1 nohup solana-test-validator \
  --ledger /tmp/traceit-localtest/ledger-cfdisable \
  --rpc-port 18899 \
  --bind-address 127.0.0.1 \
  --bpf-program E34Pu2JCA2EcYRbEPaMcE4EFzEaeM56239UKupjAkUoW \
    /tmp/traceit-localtest/target/deploy/traceit_anchor.so \
  > /tmp/traceit-localtest/logs/validator-cfdisable.log 2>&1 \
  < /dev/null &
```

`COPYFILE_DISABLE=1` is scoped to this validator process; no global macOS settings were changed. The validator returned version `1.18.17` from:

```bash
solana cluster-version --url http://127.0.0.1:18899
```

The deployed program was inspected with:

```bash
solana program show E34Pu2JCA2EcYRbEPaMcE4EFzEaeM56239UKupjAkUoW \
  --url http://127.0.0.1:18899
```

The output confirmed the expected program ID, a program data account, and a data length of `232136` bytes. The deployment was immutable, with the all-ones system address reported as authority.

#### Safety constraints

- Do not run `blockchain/scripts/start-validator.sh` or `blockchain/scripts/stop-validator.sh`; they have broad process-killing behavior, use a different ledger path, and specify a Linux-only wallet path.
- Do not run `npm test`; its `pretest` and `posttest` lifecycle scripts invoke those validator scripts.
- Use direct, focused test-runner commands only after verifying the actual wallet path and test prerequisites.
- Keep the RPC restricted to localhost.
- The validator log reported the faucet listening on `0.0.0.0:9900`; its network exposure still needs to be checked before treating this environment as safely isolated.
- Never use devnet or real funds for these tests.
- This environment does not establish backend-to-Solana integration or external blockchain anchoring.

#### Current status

Confirmed:

1. The sandbox program artifact exists.
2. The artifact keypair public key matches the sandbox program ID.
3. The local validator responds on `http://127.0.0.1:18899`.
4. The expected program is deployed and visible to `solana program show`.
5. `node_modules/.bin/ts-mocha` exists in the sandbox.

Not yet confirmed:

1. The final exit status and complete summary from `anchor build -p traceit_anchor`.
2. The exact generated sandbox wallet path; `/tmp/traceit-localtest/keys/test-wallet.json` did not exist.
3. Faucet network exposure.
4. Validator-backed Anchor test results. `tests/traceit_anchor.test.ts` and `tests/anchor_protocol_vectors.test.ts` exist, but the focused validator-backed suite has not been run.
5. End-to-end backend-to-chain integration.

**Date:** 2026-10-10

### Latest Verified Local Blockchain Test Results

The isolated environment at `/tmp/traceit-localtest` was updated to resolve the Anchor dependency mismatch without changing the original repository. The sandbox now independently uses Anchor `0.29.0`, matching the program’s `anchor-lang` dependencies, instead of the original shared Anchor `0.30.1` dependency set. The original `blockchain/` source and configuration remain untouched.

The local Solana validator is healthy at `127.0.0.1:18899`, and the deployed sandbox program is:

`E34Pu2JCA2EcYRbEPaMcE4EFzEaeM56239UKupjAkUoW`

The validator-backed focused Anchor test run completed with **8 passing**. The eight tests were:

1. Rejects initialization by a non-bootstrap signer.
2. Initializes the singleton config with the bootstrap authority.
3. Prevents config reinitialization.
4. Rejects unauthorized and invalid anchor submissions.
5. Records and reads back exact immutable bytes.
6. Supports the maximum `u64` sequence without overflow.
7. Blocks anchor creation while paused.
8. Rotates authority through propose and accept.

The run emitted non-blocking warnings about the BigInt native binding and Node’s module type. These warnings did not prevent the eight tests from passing.

These results verify local `traceit_anchor` program behavior against the sandbox validator only. They do not demonstrate production backend activation, backend-to-Solana integration, external blockchain anchoring, or real-network transactions. No devnet or real funds were used.

**Date:** 2026-10-10

### Reproducible Fresh-Ledger Validator Workflow

The following workflow repeats the isolated local test using only `/tmp/traceit-localtest` and the sandbox program identity:

- **RPC:** `http://127.0.0.1:18899`
- **Program:** `E34Pu2JCA2EcYRbEPaMcE4EFzEaeM56239UKupjAkUoW`
- **Wallet:** `/tmp/traceit-localtest/wallet-localtest.json`
- **Artifact:** `/tmp/traceit-localtest/target/deploy/traceit_anchor.so`
- **Fresh ledger:** `/tmp/traceit-localtest/ledger-fresh`
- **Validator log:** `/tmp/traceit-localtest/logs/validator-fresh.log`
- **Isolated Anchor version:** `0.29.0`

#### 1. Start the local validator

```bash
cd /tmp/traceit-localtest

COPYFILE_DISABLE=1 nohup solana-test-validator \
  --ledger /tmp/traceit-localtest/ledger-fresh \
  --rpc-port 18899 \
  --bind-address 127.0.0.1 \
  --bpf-program E34Pu2JCA2EcYRbEPaMcE4EFzEaeM56239UKupjAkUoW \
    /tmp/traceit-localtest/target/deploy/traceit_anchor.so \
  > /tmp/traceit-localtest/logs/validator-fresh.log 2>&1 \
  < /dev/null &
```

This starts the validator in the background, loads the existing sandbox artifact, binds RPC to localhost, and writes logs to the specified file. `COPYFILE_DISABLE=1` avoids macOS resource-fork sidecar files in the ledger.

#### 2. Verify startup and RPC health

```bash
sleep 3
tail -n 40 /tmp/traceit-localtest/logs/validator-fresh.log
```

```bash
curl -s http://127.0.0.1:18899 \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}'
```

Expected response:

```json
{"jsonrpc":"2.0","result":"ok","id":1}
```

Check for an existing validator before starting another one:

```bash
ps -Ao pid,command | grep '[s]olana-test-validator'
```

Do not start a second validator on port `18899` if one is already running.

#### 3. Check and fund the sandbox wallet

```bash
cd /tmp/traceit-localtest

solana balance \
  --url http://127.0.0.1:18899 \
  --keypair /tmp/traceit-localtest/wallet-localtest.json
```

If the fresh local ledger has insufficient funds, request local test SOL:

```bash
solana airdrop 5 \
  --url http://127.0.0.1:18899 \
  --keypair /tmp/traceit-localtest/wallet-localtest.json
```

Repeat the balance check afterward. These tokens exist only on this local validator; they are not real SOL on mainnet or devnet.

#### 4. Run validator-backed Anchor tests

```bash
cd /tmp/traceit-localtest

ANCHOR_PROVIDER_URL=http://127.0.0.1:18899 \
ANCHOR_WALLET=/tmp/traceit-localtest/wallet-localtest.json \
./node_modules/.bin/ts-mocha -p ./tsconfig.json -t 1000000 tests/traceit_anchor.test.ts
```

The verified fresh-ledger run passed 8 tests:

1. Rejects initialization by a non-bootstrap signer.
2. Initializes the singleton config with the bootstrap authority.
3. Prevents config reinitialization.
4. Rejects unauthorized and invalid anchor submissions.
5. Records and reads back exact immutable bytes.
6. Supports the maximum `u64` sequence without overflow.
7. Blocks anchor creation while paused.
8. Rotates authority through propose and accept.

The run emitted the non-blocking warnings `bigint: Failed to load bindings, pure JS will be used` and Node.js `MODULE_TYPELESS_PACKAGE_JSON` for the test file. They did not prevent the eight tests from passing. This is a recorded result, not a guarantee that every subsequent run will pass.

#### 5. Fresh-ledger troubleshooting

Validator state persists in its ledger directory. Tests that initialize singleton configuration accounts can fail or behave differently when repeated against a used ledger.

For a clean run:

1. Identify the existing local validator with the process-check command above.
2. Stop only that verified process with `kill -TERM <PID>`.
3. Verify that it has stopped before restarting.
4. Use a new ledger directory, such as `/tmp/traceit-localtest/ledger-fresh-2`, and update `--ledger` accordingly.
5. Check RPC health and fund the wallet on the new ledger before testing.

Do not delete the old ledger or use broad `pkill` commands. A new ledger has an independent wallet balance and requires a new local airdrop.

#### 6. Safety boundaries

- Do not run `blockchain/scripts/start-validator.sh` or `blockchain/scripts/stop-validator.sh`; their process handling and paths are not appropriate for this isolated workflow.
- Do not run `npm test`, because its lifecycle scripts invoke those validator scripts.
- Keep RPC restricted to localhost and never use devnet or real funds.
- These local tests do not prove production backend activation, production credentials, backend transaction submission, real transaction signatures, or external blockchain anchoring.

### Backend Integration Status & Phase 4 Preparation (Oct 11, 2026)

**Completed:**
- Blockchain signature recovery improvements.
- Retry processor handling for missing signatures and terminal retries.
- Reconciliation script fixes and queue-feeding behavior.
- Phase 3 transactional outbox that inserts `RECORD_DONATION` into `BlockchainRetryQueue` inside the same transaction as donation success and provenance creation.

**Phase 3 audit:**
- Transaction atomicity and normal duplicate-webhook protection reviewed.
- Retry worker runs separately from the backend API.
- Note: Webhook retry behavior and the pre-existing queue-row edge case should be treated as caveats, not fully proven guarantees.

**Current blocker:**
- `bash scripts/start-validator.sh` attempted `anchor build`, which failed in `ahash` with `error[E0635]: unknown feature 'stdsimd'`. Anchor CLI 1.1.2 and `anchor-lang` 0.29.0 also mismatch, and the configured keypair program ID differs from the source program ID. Do not run `anchor keys sync` or modify IDs.

**Tomorrow's next steps:**
- Check whether `/tmp/traceit-localtest/target/deploy/traceit_anchor.so`, `/tmp/traceit-localtest/wallet-localtest.json`, and `/tmp/traceit-localtest/logs` exist.
- Inspect running `solana-test-validator` processes.
- If safe, start the isolated validator using the existing artifact on RPC port `18899`.
- Verify RPC health.
- Verify backend RPC/program-ID configuration before the manual Phase 4 donation test.

**Important:** The isolated validator workflow and artifact have not yet been verified. No Phase 4 end-to-end donation test has been completed.
