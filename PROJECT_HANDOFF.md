# Trace-It project handoff

**Verified:** 2026-10-15 (WSL, branch `Aarush-system`). This note records the
repository state checked during the completion pass. It does not certify a
production release.

## Project map

- `frontend/`: React, TypeScript, Vite, Tailwind/shadcn client.
- `backend/`: Express API, Prisma/PostgreSQL persistence, payment and storage
  integrations, email outbox, provenance chain, and optional Anchor worker.
- `blockchain/`: legacy program compatibility, minimal Anchor v1 program,
  local validator tests, read-only Devnet preflight, and guarded deployment and
  smoke scripts.
- Root `docker-compose.yml` describes local PostgreSQL, Redis, Elasticsearch,
  and Kibana services. Compose startup was not exercised in this pass.

Implemented code and committed migrations cover donor and charity workflows,
admin review, document evidence, persisted provenance, queued email delivery,
bank-transfer evidence review, and durable batched Solana anchoring. The
completion pass did not verify every user flow against running services.

## Safe local commands

Use the application directories independently; there is no root npm workspace.
The verified environment was Node.js 24.19.0 / npm 11.17.0, Anchor CLI 0.29.0,
Solana CLI 1.17.25, and Rust 1.97.1.

```bash
cd backend && npm ci
cd ../frontend && npm ci
cd ../blockchain && npm ci
```

Copy `backend/.env.example` and `frontend/.env.example` to local `.env` files
and fill only local/test configuration. The environment examples are
intentionally allowed by `.gitignore`; populated `.env` files remain ignored.
Configure a disposable PostgreSQL database before running Prisma migrations or
seeds. Do not direct tests or migration commands at shared or production data.

```bash
cd backend && npm run dev
cd frontend && npm run dev
```

Validated checks in this pass:

```bash
cd backend && npm run typecheck && npm run build && npx prisma validate
cd frontend && npm run lint && npm run build
cd blockchain && npm test
```

Backend DB integration tests require the explicitly named, loopback-only,
disposable `traceit_anchor_test_*` database described in
`backend/tests/anchorPersistence.integration.test.ts` and must not be run
against a populated database. Do not run seeds as part of routine local test
setup unless using a disposable database.

## Donation and evidence guarantees

Payment initiation, provider-confirmed payment, stored donation, requested
disbursement, reviewed evidence, and independently confirmed beneficiary
receipt are different states. The application’s stored records and admin review
do not independently prove that a real-world charity claim is true. Blockchain
anchors bind a digest and event range; they do not validate the underlying
claims or execute payments.

## Anchor v1 and Devnet status

| Milestone | Verified state |
|---|---|
| Built locally | Deployed artifact SHA-256 `a4722659f20a5990da82b5f83d40a81e59b2f740d50e10cb7d02e666f7c9a17a`; pending marker-upgrade artifact is recorded below. |
| IDL consistency | Deployed IDL SHA-256 `4283336d28fa716d37ca5be36991b1d7f031cad990af8fabbf85329eef198bd1`; pending marker-upgrade IDL is recorded below. |
| Local validator suite | Passed: 43 tests on 2026-10-15 against the local validator. |
| Devnet preflight | Passed read-only after the local rebuild on 2026-10-15. Refresh before any program upgrade or transaction. |
| Devnet deployment | Deployed and independently verified finalized on 2026-10-15. |
| Config initialization | Finalized and independently verified on 2026-10-15. |
| Smoke anchor | Finalized and independently verified on 2026-10-15; signature is recorded below. |
| Backend-to-Devnet anchor integration | On-chain record decoding verified independently; DB-backed worker remains disabled pending an isolated database. |

Current identities:

- Anchor v1 candidate: `3CLytt82BKNwqMQA7M9fqJrMAhgD5t9dpuDC4TwutVFa`.
- Bootstrap/runtime authority: `5jV2gq2stVAbNnrHW8w55LyDWEhcAQPdZpWFwxpW9q7W`.
- Intended deployment fee payer and upgrade authority:
  `EWT5ZZqNpfwD6yGzhf7SUJCPceq5VxfqMyjWQ6wumnJh`.
- Legacy program (preserved): `5fj53usXqFvfah3x7rYo6BxQnrvBprBZsGU49XhQxzV3`.

The fresh pre-deployment read-only Devnet preflight on 2026-10-15 observed
fee-payer balance **4.8706912 SOL**, program account absent, estimated peak
**3.5928428 SOL**, and headroom **1.2778484 SOL**. Rent components were program account
0.00083312 SOL, ProgramData 2.3593806 SOL, temporary buffer 1.18008908 SOL,
config 0.0010414 SOL, first anchor 0.0014986 SOL, plus a 0.05 SOL fee reserve.
These estimates and balance are time-sensitive; there is RPC and fee/rent
uncertainty, so re-run preflight immediately before an approved transaction.
The runtime authority was independently verified at **10 SOL** against Devnet
genesis hash `EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG`. These are faucet
SOL and do not represent a real-money blockchain expenditure. Deployment was
approved and finalized at slot `511237360` with signature
`4o8naSdxt8psBnFMbPZ22PNz4B56vT9cnK5pPRVwjRiNMee4BmrwAGRWjsUNU8bXjJbpWZX5ubeN1agcTdxehMZE`.
The program is executable, its ProgramData address is
`8q1qfVdA4atWqse3bd8nSLm7WdMxcdwN6StKjFaghQA1`, and the upgrade authority is
the expected fee-payer wallet. The fee-payer balance after deployment is
**2.50930748 SOL**; runtime authority remains at **10 SOL**.

The refreshed preflight returned `ready: true`, with declared, configured, and
deployment program IDs all matching. The 232,136-byte binary hash remains
`a4722659f20a5990da82b5f83d40a81e59b2f740d50e10cb7d02e666f7c9a17a`; the IDL
hash remains
`4283336d28fa716d37ca5be36991b1d7f031cad990af8fabbf85329eef198bd1`. A
separate read-only query confirmed the runtime authority balance is **10 SOL**
and the derived config PDA
`8N5q5EGcTPcjDMGa2zKQTEp2RmZKLSdZdPDMaundRav8` is absent. Deployment has since
been independently confirmed finalized. The deployed ProgramData has 464,272
bytes of code capacity: the reviewed 232,136-byte executable occupies the
first half and its SHA-256 matches the reviewed binary; the remaining capacity
is zero padded. The first preflight attempt failed with an RPC fetch error; a
bounded `getHealth` request then succeeded and the fresh preflight passed.
Two previous guarded config-init invocations stopped before submission with
`Blockhash not found`; no detailed RPC response was retained. Inspection showed
Anchor's simulation helper fetched a blockhash internally, then `.rpc()` built
a separate transaction with a different blockhash. The initialization branch
now signs a single versioned transaction, simulates it with signature
verification, submits that same transaction with preflight enabled, checks its
block-height validity, and confirms using the same blockhash validity window.
Simulation failures include logs and context slot. The configured endpoint was
`https://api.devnet.solana.com` at `confirmed` commitment; health and Devnet
genesis checks passed.

The approved single config initialization finalized at slot `511241376` with
signature
`5kJQBRAbsv6sax9o49t5p2hzbPqr6UpMv5CFRSbPcCNms78Ryb1wwTgogggsmACkNELaFBJHQz7XbkaLdri17aCK`.
Independent read-back confirmed config PDA
`8N5q5EGcTPcjDMGa2zKQTEp2RmZKLSdZdPDMaundRav8`, owned by the deployed program,
77 bytes, authority `5jV2gq2stVAbNnrHW8w55LyDWEhcAQPdZpWFwxpW9q7W`, no pending
authority, version 1, and unpaused state. The actual fee was 5,000 lamports;
rent was estimated at 1,041,400 lamports. Runtime authority balance after
initialization was **9.9989536 SOL**. The separately approved smoke anchor is
now finalized and independently verified; see the outcome below.

### Synthetic test-anchor marker upgrade candidate

The original Phase 5 acceptance criteria require a public `multiple_events`
fixture anchor with exact read-back, but do not require an on-chain synthetic
marker. The smoke anchor therefore uses deployed `record_anchor`; a chain-only
reader cannot distinguish this synthetic fixture from an ordinary batch. Its
fixture meaning is documented here and contains no real donor, beneficiary,
payment, or personal data. The optional local candidate adds a separate
`TestAnchorMarker` PDA at
`[b"test_anchor", batch_key]`, linked to the existing `AnchorRecord` address
and batch key and carrying marker version 1. Its Anchor account discriminator
and dedicated PDA seed make synthetic records independently identifiable by a
Devnet reader. A new `record_test_anchor` instruction creates the normal
`AnchorRecord` and marker together. Production `record_anchor` remains
unchanged and never creates a marker.
For the `multiple_events` fixture, the AnchorRecord PDA is
`H8kUqQkJZQAK9BxCGGxZ9fYuHeEQ56rgEW787zW9Z4gj`. The optional marker PDA is
`Bsr3iN8sE74AeiunjokurQcBZ8JcQL6427VjTuhAqFuK`; it remains absent and unused.

Compatibility: existing `AnchorRecord` remains 167 bytes with the same fields,
serialization, discriminator, and `[b"anchor", batch_key]` PDA; existing
records require no migration and remain readable. The config and program IDs
are unchanged. The marker adds a new 73-byte account type and instruction, so
it requires an in-place program upgrade before use on Devnet. The currently
deployed program remains the earlier binary. The standard deployment script
refuses an existing program and is not an upgrade tool; a reviewed upgrade
path and separate explicit approval are required before upgrading Devnet.

The candidate build SHA-256 is
`360f16ce7b43cfbb8483e4c7728871e755ad6ac1e3ab97fac4504b2f2790aa57`; candidate
IDL SHA-256 is
`42b37eb7d1826171df9ca9e688f5a7985a539ff058f6c608b6b3d91af37e0b8f`. The
candidate binary is 252,560 bytes and fits within the existing 464,272-byte
ProgramData code capacity. The
deployment manifest preserves the deployed hashes and records these separately
as `pendingUpgrade`; no upgrade has been submitted. `npm test` passed all 43
blockchain tests on the local validator, including synthetic-marker linkage,
ordinary-anchor marker absence, and test-instruction authorization/payload
validation. `NO_DNA=1 anchor build` and `npx tsc --noEmit` passed. The guarded
smoke script now refuses if either target PDA already exists, simulates and
submits the same signed transaction, then verifies both accounts. No Devnet
transaction was made for this change.

The marker candidate is optional for the college demo and is not deployed.
Using it later would require separate approval for a reviewed in-place program
upgrade; the normal deployment script refuses existing programs. It was not
used for the Phase 5 smoke anchor.

### Devnet smoke anchor result — 2026-10-15

The approved single `record_anchor` transaction finalized at slot `511247078`
with signature
`636Ca1QTwMTKgDVN1vHwNn4KAGCMZbCTsRHpTvQNuunQnSWAmuSgQX83uzzny1i1XKgnitgiamQjVUY1XkH6RZ8b`.
An independent Devnet read at slot `511247149` confirmed the AnchorRecord PDA
`H8kUqQkJZQAK9BxCGGxZ9fYuHeEQ56rgEW787zW9Z4gj` is owned by program
`3CLytt82BKNwqMQA7M9fqJrMAhgD5t9dpuDC4TwutVFa`, is 167 bytes, and decodes to
the expected `multiple_events` batch key, audit root, sequence range 42–44,
event count 3, schema version 1, runtime authority, and bump 255. The fixture
is synthetic and has no on-chain marker. The transaction fee was 5,000
lamports; the account holds 1,498,600 lamports rent. Runtime authority balance
afterward was **9.99745 SOL**. The configured RPC and commitment were
`https://api.devnet.solana.com` and `confirmed`.

The guarded script was changed to call the deployed `record_anchor` instruction;
its definition matches the deployed IDL exactly. It fetches a fresh blockhash,
simulates and submits the same signed transaction, checks blockhash validity,
and verifies the resulting record. Backend runtime/DB integration remains
pending: keep the worker disabled until a disposable loopback test database is
confirmed, migrated, and used for focused verification. Do not use
`backend/.env.test`'s existing `TraceIt` database target.

Before any deployment, config initialization, or anchor write, review
`blockchain/docs/phase5-operations-runbook.md` and obtain explicit approval
for that specific operation. Deployment uses
`TRACEIT_ALLOW_DEVNET_TRANSACTIONS=I_ACKNOWLEDGE_DEVNET_FEES` and
`bash scripts/deploy-devnet.sh`; the guarded script now checks program ID,
deployment manifest identity, binary and generated/committed IDL hashes,
deployment wallet identities,
fresh preflight readiness, and that the program account is absent. Those
checks prepare deployment but do not authorize it. Configuration initialization
and smoke anchor creation are separate transaction approvals and separate
`TRACEIT_SMOKE_ACTION` invocations; anchor mode refuses a missing config.

The backend uses the separate `TRACEIT_ANCHOR_RPC_URL`,
`TRACEIT_ANCHOR_WALLET_KEYPAIR_PATH`, `TRACEIT_ANCHOR_PROGRAM_ID`, and
`TRACEIT_ANCHOR_CLUSTER` variables. The ignored local `backend/.env` has all
four Devnet values active and points to
`/home/aarus/.config/solana/traceit-v1-authority.json`, which derives the
expected bootstrap/runtime authority. Do not start the normal worker until the
database and transaction approvals are ready. Docker Compose does not mount
this host keypair, and the repository-root `.env` supplied to Compose is
absent; this host path is for a native WSL backend process only.

## Verification gaps and known risks

- All 18 migration directories are tracked, including the five directories
  previously reported as untracked. Static review found no row deletion or
  truncation in the migration SQL. The October 14 anchor migrations convert
  `anchor_batches.status` from `BatchStatus` to `TEXT`, preserve old `SUBMITTED`
  and `FAILED` semantics as review/dead-letter states, and deliberately drop
  then restore the claim index across the ordered migrations. The email and
  bank-transfer migrations add tables, indexes, constraints, and enum values.
  Prisma schema validation passed. No local PostgreSQL listener or Docker
  Compose plugin is available; no migration was applied and no migration replay
  or DB integration test was run. The backend test configuration attempted a
  non-loopback database host and was blocked by the sandbox; do not retry it.
  Configure a confirmed-empty, loopback `traceit_anchor_test_*` database and
  use the guarded integration test before claiming DB validation.
  The subsequently proposed target identifies database `TraceIt` at host
  `172.17.160.1`; it fails both the loopback and disposable-name checks. A
  statement that its contents are seed data does not establish an empty,
  isolated test database. No connection or write was made to that target.
  CI now uses its ephemeral PostgreSQL service under the permitted
  `traceit_anchor_test_ci` name and supplies the explicit disposable-test
  acknowledgment, so the guarded anchor integration suite can run there. The
  service database is migrated and seeded first; the seed leaves provenance
  and anchor batches empty, as required by the test guard. This workflow change
  has not yet been exercised by GitHub Actions.
- Backend typecheck, build, and Prisma validation passed. The full Jest run
  completed 32 suites: 16 passed, 15 failed, and 1 skipped (132 passed, 117
  failed, 4 skipped tests). Failures include unavailable non-loopback DB access
  and `envValidator.test.ts` expectations missing the now-required
  `RESEND_API_KEY`, `EMAIL_FROM`, and `AES_DOCUMENT_KEY`. Those stale test
  expectations and the valid-production fixture have since been updated; the
  focused `envValidator.test.ts` run now passes all 5 tests. Seven independent
  focused suites passed (51 tests); the new webhook-signature suite passed (3
  tests). The anchor persistence integration suite remains unrun without the
  disposable database.
- Frontend lint passed. The production build passed after route-level lazy
  loading; its largest JS chunk is 348.37 kB (previously 838.93 kB), and the
  build no longer reports a chunk over Vite's 500 kB advisory threshold. No
  frontend test script is configured.
- Backend `npm audit` was refreshed against the registry on 2026-10-15. Two
  semver-safe `npm audit fix` passes updated the lockfile, including
  `proxy-addr` to 2.0.8, Joi to 18.2.9, Multer to 2.4.0, Axios to 1.20.0,
  and other affected transitive packages. The critical proxy-address finding
  and the prior Joi/Multer findings are resolved. The resulting full tree has
  25 findings (22 moderate, 3 high); the production-pruned tree has 6 (3
  moderate, 3 high). Remaining findings include Anchor's `toml` 3.0.0 high
  advisories (no compatible automatic fix), Prisma CLI's mysql2 advisory, and
  `jayson`/`stream-json` moderate advisories. Prisma CLI is still declared as a
  production dependency; moving it to dev dependencies was rejected during the
  requested package operation. Do not force major upgrades to Prisma or TOML
  without compatibility testing. Registry audit on 2026-10-15 is the current
  evidence; frontend and blockchain audits have not been refreshed. An offline
  audit returned no advisory data and must not be treated as a clean audit.
  CI now fails on high or critical production audit findings; the dedicated
  security workflow also runs for `Aarush-system` and `main` and no longer
  ignores audit failures.
- Reviewed official advisories: [proxy-addr CVE-2026-90711](https://github.com/jshttp/proxy-addr/security/advisories/GHSA-jqcg-44mw-7w3h), [Joi CVE-2026-92599](https://joi.dev/resources/changelog), [Multer CVE-2026-77078](https://github.com/advisories/GHSA-wc9g-mqfw-jrwm), and [toml GHSA-82x6-q7mm-w9cf](https://github.com/advisories/ghsa-82x6-q7mm-w9cf).
- `.github/workflows/ci.yml` still runs CI on pushes and pull requests for
  `Aarush-system`; Docker Hub publishing now runs only on `push` to `main`.
  CI now generates an ephemeral test wallet instead of writing a persistent
  GitHub wallet secret to disk. YAML parsing and shell syntax checks passed.
  Actual GitHub Actions behavior and repository secret settings were not
  exercised. The Docker publish remains dependent on configured Docker Hub
  secrets and was not triggered. Added Docker context exclusions for env files,
  dependencies, build outputs, and Git metadata; final context size was 1.6 MB.
  The final backend image build passed with the refreshed dependency lockfile,
  pruned development dependencies, and ran as the unprivileged `node` user.
  The production-pruned image still includes Prisma CLI because it remains a
  production dependency.
- Security review found role-based account lookups in `requireAuth`, 10 MiB
  Multer limits with a MIME allowlist, and raw-body HMAC webhook verification.
  Webhook audit metadata no longer records full request headers or signature
  values, and payment/refund signatures now share length-checked timing-safe
  comparison. A focused regression test covers valid, mismatched, and malformed
  signatures. File MIME values remain client-provided metadata; add content
  sniffing before treating uploaded evidence as a verified file type.
- Local Anchor build and artifact hashes remain unchanged. The local validator
  suite passed all 41 tests after rerunning with local-port permission. Anchor
  CLI remains 0.29.0 and Solana CLI 1.17.25. The pre-deployment preflight
  observed **4.8706912 SOL** and a **3.5928428 SOL** peak estimate; deployment
  was subsequently approved and finalized, as recorded above. The candidate
  program, bootstrap/runtime, and fee-payer keypair files derive the reviewed
  public identities. The generated
  `blockchain/target/deploy/traceit_anchor-keypair.json` derives a different
  address and was not used. Post-deployment read-only checks confirm the
  executable and matching reviewed binary, current balances, and absent config
  account. Config initialization and the approved smoke anchor are finalized
  and independently verified; the smoke outcome is recorded above.
- Compose services and full payment, object-storage, email-provider, donor,
  charity, admin, and backend-to-chain flows remain unverified with isolated
  services and provider test credentials.

## Repository state

Work remains on `Aarush-system` at commit `0da5192` (`Some CI workflow update`).
The earlier completion-pass commit reference above was stale relative to the
checked-out branch. Current uncommitted changes are limited to this handoff,
the donor anchor-status API, its focused test, and the corresponding frontend
display. No commit or push was made.

## Final completion review — 2026-10-15

- Frontend lint and production build passed; largest JS chunk is 348.42 kB.
- Backend typecheck, build, and Prisma validation passed. Focused provenance and
  anchor tests including donor anchor API ownership passed: 8 suites / 69
  tests. The local Anchor validator suite passed all 41 tests.
- Full Jest and PostgreSQL anchor integration tests were not run: `.env.test`
  points at database `TraceIt` on non-loopback host `172.17.160.1`, which fails
  the integration suite's disposable-database guard. No connection, migration,
  seed, or write was made to that database.
- A donor-authenticated `GET /api/donor/donations/:id/anchors` endpoint now
  returns only chained provenance events owned by that donor, including
  persisted anchor status and transaction reference. The verification dialog
  labels pending/retrying/failed/confirmed states and says its status is from
  the database; it does not independently query chain state or prove real-world
  claims.
- Refreshed backend production audit: 6 findings (3 moderate, 3 high, no
  critical). `@coral-xyz/anchor` reaches vulnerable `toml@3.0.0`; no compatible
  fix is available. `jayson`/`stream-json` have fixes available; no lockfile
  update was made. Prisma/mysql2 findings are present in the audited tree. A
  networked audit-fix dry run was rejected by the approval gate, so no package
  changes were attempted. The existing CI workflow has an ephemeral PostgreSQL
  database and wallet and does not publish from `Aarush-system`; GitHub Actions
  itself remains unverified.
- Devnet: the approved Anchor v1 deployment is finalized at slot `511237360`;
  its transaction signature, ProgramData address, on-chain binary hash, and
  verified config initialization are recorded above and in
  `blockchain/deployments/devnet-anchor.json`. The fee payer had **2.50930748
  SOL** after deployment; runtime authority now has **9.99745 SOL** after
  config initialization and the verified smoke anchor. The config PDA and
  smoke AnchorRecord are finalized and initialized. The smoke transaction fee
  was 5,000 lamports and anchor rent was 1,498,600 lamports.
- The backend's ignored local `.env` contains active Devnet RPC, program,
  cluster, and runtime keypair settings. The worker is not currently running;
  Docker does not mount this host keypair.
- Local Postgres, Redis and Elasticsearch are self-hostable from Compose.
  Production payment, email, and cloud object storage use external providers:
  live Razorpay payments can incur transaction fees; Resend and Backblaze B2
  can incur charges beyond applicable free usage. Local/test flows can avoid
  live payments and provider sends; MinIO is supported by the storage code but
  is not included in Compose.

## Current Devnet demo status — 2026-10-15

- The smoke AnchorRecord is finalized and independently verified as described
  above. No program upgrade, config write, or second anchor transaction was
  made. The first guarded invocation hit a sandbox `fetch failed`; a read-only
  PDA check found no account before the single confirmed guarded attempt.
- The backend `.env.example` records the deployed Devnet RPC, program ID, and
  runtime keypair path as commented worker settings. The ignored `.env` and
  `.env.test` already had the four Devnet variables active; the read-only probe
  loaded `.env` and derived the expected runtime authority.
- The backend was restarted on local port 3101 with the supplied database URL
  in its environment, while anchor and email processors were explicitly
  disabled. `/health` returned 200; the process was then stopped. No database
  connection was opened. One read-only backend `AnchorService.verifyAnchorRecord`
  probe returned `CONFIRMED` for the smoke PDA and matching fixture fields.
  Focused database-free backend anchor tests passed: 4 suites / 45 tests.
- No disposable PostgreSQL server was available. Docker had no running
  containers or cached PostgreSQL image; pulling `postgres:15` failed because
  the Docker daemon had no registry network. No database connection,
  migration, seed, or write was made. The durable persistence integration and
  database-backed lifecycle test remain unverified.
- The runtime worker remains disabled. A true worker submission would create
  another on-chain anchor transaction, which was outside the one-transaction
  approval. The minimum remaining work is to provision a loopback-only,
  disposable `traceit_anchor_test_*` database, apply/check the existing
  migration through the guarded workflow, run the persistence suite without
  starting a publisher that can submit to Devnet, and obtain separate approval
  before any additional on-chain write.

## Backend readiness and personal-email testing — 2026-10-15

- Seeded NGO and primary donor logins now read `TRACEIT_TEST_NGO_EMAIL` and
  `TRACEIT_TEST_DONOR_EMAIL`, defaulting to the existing fake development
  addresses. Their fixed profile IDs are upserted so changing an override
  updates the seeded account and preserves foreign-key relationships. Email is
  a unique login key. Seed/test helpers no longer print account email addresses
  or passwords. The demo donation allocation now checks for its existing pair
  before insertion.
- Resend credentials are present locally and a read-only authenticated domain
  list returned HTTP 200. The configured sender domain is `gmail.com`, is not
  present in this account, and the account has zero verified sending domains.
  Prior 422 logs state that this account currently accepts only its permitted
  testing recipient; the exact permitted recipient is not exposed by the domain
  list. No email was sent. Configure an owned, verified sending domain in
  Resend and confirm the account's recipient restrictions in its dashboard
  before configuring personal inboxes. The 422 provider path is now
  non-retryable, redacts recipient addresses, and marks an outbox job failed
  immediately. Email processing requires explicit opt-in and a 1–10 job cap
  per backend run.
- The legacy OTP function is still a stub and does not deliver email; it no
  longer logs OTP values or recipient addresses. Donation/allocation email
  notifications use the durable outbox. No real inboxes are configured in the
  local environment.
- Anchor worker startup now requires `TRACEIT_ANCHOR_WORKER_ENABLED=true` in
  addition to its existing four configuration values. It remains disabled.
  The anchor scheduler/worker can create and submit batches from queued events,
  and is not yet bounded to one operator-approved transaction. The legacy
  `BlockchainRetryProcessor` is not started by `src/index.ts`. No other
  scheduled processor is started there.
- Windows PostgreSQL was verified from WSL at `172.17.160.1:5432` (PostgreSQL
  17.6); role `postgres` has `CREATE DATABASE`. The populated `TraceIt`
  database was never connected to. Migrations, seed checks and the API E2E
  suite used disposable databases only. `traceit_anchor_test_seedverify_20261015`
  is the verified manual-test database: all 18 migrations applied; two seed
  runs and a seed-email override check preserved four fixed-ID profiles, one
  campaign, one donation and one allocation; the final seed restored the
  default fake emails. The seed helper and donor login helper passed. The
  separate `traceit_anchor_test_e2e_20261015` database passed all 26 API E2E
  tests with the payment provider mocked and workers disabled.
- `traceit_anchor_test_seed_20261015` is an earlier exploratory database from
  before the allocation idempotency fix; repeated runs left duplicate demo
  allocation rows. It was not cleaned or reused. `traceit_anchor_test_integration_20261015`
  was created but left empty. The Anchor persistence integration suite was not
  run: its guard requires a loopback PostgreSQL hostname, while the verified
  Windows server is reachable only through the WSL gateway and `localhost`
  does not listen. The guard was not relaxed or bypassed.
- Backend typecheck, build and Prisma validation passed. Focused email and
  anchor suites passed 5 suites / 63 tests, including 422 handling and bounded
  email processing. Backend health returned HTTP 200 with both workers
  disabled and the disposable seed database configured. No real email, payment,
  or additional Solana transaction was submitted.
- For local manual testing, set `TRACEIT_TEST_DATABASE_URL` in the shell to the
  existing Windows PostgreSQL credentials with database
  `traceit_anchor_test_seedverify_20261015`, then run the backend with both
  worker flags set to `false`. Do not use `TraceIt`. Use `npm run dev` in
  `backend/` and `npm run dev -- --host 127.0.0.1` in `frontend/`. Personal
  inbox testing remains blocked on two local seed-email values, a verified
  Resend sender domain, and confirmation of account recipient permissions.
