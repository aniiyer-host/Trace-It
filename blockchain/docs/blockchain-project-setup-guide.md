# Blockchain Project Setup Guide

> **Authoritative setup for the current repository**
>
> This guide is for every Trace-It contributor. Follow the section matching your role; most frontend and backend contributors do not need a Solana wallet or the full Rust toolchain.

## 1. Choose the Setup You Need

| Role or task | Required setup |
|---|---|
| Frontend or ordinary backend work | Node.js and the relevant application dependencies. Blockchain can remain disabled. |
| Backend anchor service/unit tests | Node.js plus `backend` dependencies; mocked tests do not require a validator or wallet. |
| Anchor program development or full blockchain tests | Node.js, Rust, Solana CLI, Anchor CLI, blockchain dependencies, and a local-only wallet. |
| Read shared devnet records | Solana CLI or the application client and a devnet RPC; no wallet is required for reads. |
| Deploy, initialize, smoke-test, or write to devnet | Operator-only setup, approved signer custody, devnet SOL, simulation, and explicit transaction approval. |

Windows contributors should use WSL2 with a current Ubuntu release. Run the repository and toolchain inside the WSL filesystem rather than mixing Windows and Linux binaries.

## 2. Supported Versions

Do not substitute the newest versions. The repository deliberately uses a compatibility matrix:

| Tool | Required/tested version | Source of truth |
|---|---:|---|
| Node.js | 24.x | `blockchain_implementation_plan.md` |
| npm | Compatible with Node 24; use the committed lockfile | `blockchain/package-lock.json` |
| Rust host toolchain | 1.89.0 with `rustfmt` and `clippy` | `blockchain/rust-toolchain.toml` |
| Solana CLI/SBF tools | 1.17.25 | protocol and Cargo workspace |
| Anchor CLI | 0.29.0 | protocol compatibility matrix |
| `anchor-lang` / TypeScript Anchor | 0.29.0 | `Cargo.toml` / `package.json` |

The backend separately contains Anchor 0.32.x for the legacy adapter. Do not upgrade the blockchain workspace to match it and do not let Anchor runtime types cross between these adapters.

The committed `blockchain/Cargo.lock` is part of the supported build. **Do not delete it or run an unreviewed dependency update.** Newer transitive crates can require an incompatible SBF Rust version; this was the source of the original build conflict.

## 3. Operating-System Prerequisites

On Debian/Ubuntu/WSL, install the usual native build packages:

```bash
sudo apt update
sudo apt install -y build-essential pkg-config libssl-dev libudev-dev clang cmake curl git
```

On macOS, install Xcode Command Line Tools and the equivalent packages through Homebrew. Apple Silicon users should keep all tools on the same architecture rather than mixing Rosetta and native installations.

## 4. Install the Toolchain

### Node.js

Use a version manager such as `nvm`, `fnm`, or `asdf`, then select Node 24:

```bash
nvm install 24
nvm use 24
node --version
npm --version
```

### Rust

Install Rust through `rustup`, then install the repository-pinned host toolchain:

```bash
rustup toolchain install 1.89.0 --profile minimal --component rustfmt --component clippy
cd blockchain
rustc --version
```

Entering `blockchain/` makes `rustup` select `rust-toolchain.toml`. Solana's SBF build uses its own compatible build tools; do not try to replace those by editing the Rust pin.

### Solana CLI 1.17.25

Install the official archived Solana CLI release for your operating system, then select exactly `1.17.25`. If `solana-install` is available:

```bash
solana-install init 1.17.25
solana --version
```

Expected output begins with `solana-cli 1.17.25`. If the legacy installer endpoint is unavailable, use the `v1.17.25` release artifact from the official `solana-labs/solana` GitHub releases. Do not silently fall forward to Solana 1.18 or Agave 2.x; ask the blockchain team to review a toolchain migration first.

Add the active Solana release directory printed by the installer to `PATH`, then open a new shell.

### Anchor CLI 0.29.0

Install Anchor Version Manager and select the project version:

```bash
cargo install --git https://github.com/coral-xyz/anchor --tag v0.29.0 avm --locked --force
avm install 0.29.0
avm use 0.29.0
anchor --version
```

Expected output is `anchor-cli 0.29.0`. If `anchor --version` tries to install Solana 1.18 or reports Anchor 0.30/0.32, the wrong Anchor executable is active. Check `which anchor`, re-run `avm use 0.29.0`, and open a fresh shell.

## 5. Install Repository Dependencies

Use clean, lockfile-based installs:

```bash
cd blockchain
npm ci

cd ../backend
npm ci
```

Install frontend dependencies separately only if your work requires them. Do not run `npm update`, remove either lockfile, or resolve the blockchain build by changing package versions locally.

The first Rust/Anchor build may need internet access to download pinned crates and toolchain components. Later clean builds should continue to use the committed lockfile.

## 6. Create a Local-Only Test Wallet

Full blockchain integration tests need a local keypair at the conventional path used by the validator script:

```bash
mkdir -p ~/.config/solana
solana-keygen new --no-bip39-passphrase --outfile ~/.config/solana/devnet-traceit.json
solana-keygen pubkey ~/.config/solana/devnet-traceit.json
```

Despite its filename, this keypair is safe to treat as a **local-test identity only**. The test validator mints local SOL to it automatically. Do not commit, message, email, or share the JSON file or its seed phrase. Every contributor should create their own.

If the file already exists, do not overwrite it. Point `ANCHOR_WALLET` to that file explicitly when testing:

```bash
export ANCHOR_WALLET="$HOME/.config/solana/devnet-traceit.json"
```

The repository currently defaults the TypeScript test wallet to an original developer's absolute path, so this export is required on other machines. The validator helper still expects the conventional file under `~/.config/solana/`.

## 7. Build and Test Locally

Run commands from `blockchain/`:

```bash
NO_DNA=1 anchor build
NO_DNA=1 npm test
```

`npm test` performs the complete local flow:

1. builds both `traceit` and `traceit_anchor`;
2. resets and starts `solana-test-validator` on `127.0.0.1:8899`;
3. preloads both compiled programs at their configured local IDs;
4. funds the local test wallet;
5. runs all TypeScript integration and protocol tests;
6. stops the validator afterward.

You do not need to start a validator separately. If a test is interrupted, clean up with:

```bash
bash scripts/stop-validator.sh
```

The helper stops any `solana-test-validator` process owned by the current environment, so do not use it while another local Solana test is important.

For backend blockchain unit tests:

```bash
cd ../backend
npm run typecheck
npm test -- --runInBand
```

These focused service/worker/verifier tests use dependency injection and do not need a live validator unless a test explicitly says it is an integration test.

## 8. Environment Configuration

### Ordinary local application development

The legacy blockchain service is disabled when `SOLANA_WALLET_KEYPAIR_PATH` is absent. This is expected and lets normal backend work run without a wallet or Solana RPC. Other backend features still require their own database, authentication, payment, and storage variables; consult `backend/README.md` and never copy another contributor's populated `.env`.

### Historical legacy reads

Phase 6 permanently retired legacy application writes. Historical raw account reads use the fixed legacy program ID and require only an RPC endpoint:

```env
SOLANA_RPC_URL=http://127.0.0.1:8899
```

Use `getLegacyBlockchainReader()` for compatibility reads. `SOLANA_WALLET_KEYPAIR_PATH`, `SOLANA_PROGRAM_ID`, and `BLOCKCHAIN_HMAC_SECRET` no longer activate a legacy writer. Do **not** point legacy decoding at the new anchor program; the programs have incompatible account layouts.

### New audit-anchor service

The Phase 2 service, Phase 3 worker, and Phase 4 verifier exist under `backend/src/services/anchor/`, but production bootstrap is intentionally not wired until Backend/Data provides the durable batch repository and locally verified audit input. Unit tests construct these services explicitly. A separate anchor-program environment contract must be finalized during integration rather than overloading the legacy `SOLANA_PROGRAM_ID`.

Expected integration values will include:

- primary and optional read-fallback RPC URLs;
- cluster (`localnet`, `devnet`, or later `mainnet-beta`);
- deployed `traceit_anchor` program ID;
- server-only runtime signer injection;
- trusted current/historical authority public keys;
- commitment and worker lifecycle configuration.

### Devnet read-only access

Reading devnet does not require a wallet:

```bash
solana program show <deployed-anchor-program-id> --url devnet
```

The new program is not deployed yet. Until the deployment manifest records otherwise, `5s9AEJfEKfUrcCszpfdkZmka1XcX2XA7mbyDTmKmQywW` is only the approved candidate identity.

## 9. Operator-Only Devnet Variables

Most contributors should not set these. They are for an approved release operator following `phase5-operations-runbook.md`.

Read-only preflight requires:

```env
ANCHOR_PROVIDER_URL=https://api.devnet.solana.com
TRACEIT_DEPLOYMENT_PROGRAM_ID=<approved-public-program-id>
TRACEIT_FEE_PAYER_PUBKEY=<approved-public-fee-payer>
TRACEIT_UPGRADE_AUTHORITY_PUBKEY=<approved-public-upgrade-authority>
TRACEIT_EXPECT_DEPLOYED=false
```

Deployment additionally requires server-local paths and guarded consent:

```env
ANCHOR_WALLET=<approved-operator-keypair-path>
TRACEIT_DEPLOY_PROGRAM_KEYPAIR=<approved-program-keypair-path>
TRACEIT_ANCHOR_PROGRAM_ID=<approved-public-program-id>
TRACEIT_ALLOW_DEVNET_TRANSACTIONS=I_ACKNOWLEDGE_DEVNET_FEES
```

Smoke testing also requires `TRACEIT_BOOTSTRAP_AUTHORITY=<public-key>`. Optional `TRACEIT_ANCHOR_BINARY` and `TRACEIT_ANCHOR_IDL` override artifact paths during preflight.

Never place operator keypairs, seed phrases, private RPC tokens, consent variables, or populated environment files in Git. Never reuse local/devnet keys on mainnet. Every devnet write must be simulated, summarized, and explicitly approved before sending.

## 10. Program IDs You May See

| Address | Meaning |
|---|---|
| `5fj53usXqFvfah3x7rYo6BxQnrvBprBZsGU49XhQxzV3` | Live legacy program and local legacy test ID. Preserve historical readers. |
| `4qLwniS2NeDrqftgb83GbYVHWVbBBbUcjDR1Ncm5GCHX` | Development-only local ID for `traceit_anchor`; not the intended devnet address. |
| `5s9AEJfEKfUrcCszpfdkZmka1XcX2XA7mbyDTmKmQywW` | Approved candidate devnet identity; not deployed at the time of this guide. |
| `5AFcU61X6LoQSNTcCFeEKauVsfCwfvtUDXY6XhMq7oCM` | Closed stale address; never reuse it. |

Do not “fix” an ID mismatch by changing only one file. A deployment ID change must update Rust `declare_id!`, `Anchor.toml`, generated IDL/client files, tests, backend configuration, and the deployment manifest together.

## 11. Troubleshooting

### `anchor build` fails after dependency resolution

Confirm Anchor 0.29.0 and Solana 1.17.25, restore the committed `Cargo.lock`, and use `npm ci`. Do not delete the lockfile. Errors mentioning unsupported Rust versions, `zeroize`, `toml_edit`, `borsh`, or lockfile version usually indicate version drift.

### `anchor --version` selects or installs the wrong Solana release

The active Anchor is not 0.29.0. Run `which anchor`, select `avm use 0.29.0`, confirm Solana 1.17.25 remains first on `PATH`, and retry in a fresh terminal.

### Wallet file not found or tests reference `/home/aaditya/...`

Create your own conventional local wallet and export `ANCHOR_WALLET` as shown above. Never request the original developer's wallet file.

### Validator does not start or tests time out

Check whether port `8899` is occupied. Stop an abandoned local validator with `bash scripts/stop-validator.sh`, then rerun `npm test`. Inspect `/tmp/traceit-validator.log` if startup still fails.

### Program ID or account-owner mismatch

Confirm the test uses localnet and the IDs in `Anchor.toml`. Do not point legacy code at `traceit_anchor` or vice versa. After a local ledger reset, old local accounts no longer exist; rerun the complete test setup.

### Devnet command returns localnet data

Pass `--url devnet` explicitly and verify the devnet genesis during release preflight. Do not rely solely on a developer's global Solana CLI configuration.

### Tests work locally but not for a teammate

Compare `node --version`, `rustc --version` inside `blockchain/`, `solana --version`, `anchor --version`, the committed lockfile hashes, `ANCHOR_WALLET`, port availability, and the current Git revision before changing code or dependencies.

## 12. Setup Verification Checklist

- [ ] Node is 24.x and dependencies were installed with `npm ci`.
- [ ] `rustc --version` inside `blockchain/` uses the pinned host toolchain.
- [ ] Solana CLI reports 1.17.25.
- [ ] Anchor CLI reports 0.29.0.
- [ ] The committed `Cargo.lock` and package lockfiles are unchanged.
- [ ] A personal local-only wallet exists at the conventional path.
- [ ] `ANCHOR_WALLET` points to that wallet on non-original machines.
- [ ] `NO_DNA=1 anchor build` succeeds.
- [ ] `NO_DNA=1 npm test` succeeds and stops the validator.
- [ ] No keypair, seed phrase, RPC token, or populated `.env` is staged in Git.
- [ ] Devnet/mainnet writes are not part of ordinary local setup.

For architecture and post-deployment behavior, continue with `post-deployment-changes-guide.md`. For release operations, use `phase5-operations-runbook.md`. For Phase 6 cutover, use `phase6-implementation-guide.md`.
