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
| Built locally | Yes. `traceit_anchor.so` is 232,136 bytes; SHA-256 `a4722659f20a5990da82b5f83d40a81e59b2f740d50e10cb7d02e666f7c9a17a`. |
| IDL consistency | Yes. Generated IDL matches `blockchain/idl/traceit_anchor.json`; SHA-256 `4283336d28fa716d37ca5be36991b1d7f031cad990af8fabbf85329eef198bd1`. |
| Local validator suite | Passed: 41 tests in the most recent recorded run. |
| Devnet preflight | Passed read-only on 2026-10-15. Refresh before any transaction. |
| Devnet deployment | Not deployed; program account absent at last preflight. |
| Config initialization | Not performed. |
| Smoke anchor | Not performed. |
| Backend-to-Devnet anchor integration | Not verified; runtime configuration remains intentionally absent. |

Current identities:

- Anchor v1 candidate: `3CLytt82BKNwqMQA7M9fqJrMAhgD5t9dpuDC4TwutVFa`.
- Bootstrap/runtime authority: `5jV2gq2stVAbNnrHW8w55LyDWEhcAQPdZpWFwxpW9q7W`.
- Intended deployment fee payer and upgrade authority:
  `EWT5ZZqNpfwD6yGzhf7SUJCPceq5VxfqMyjWQ6wumnJh`.
- Legacy program (preserved): `5fj53usXqFvfah3x7rYo6BxQnrvBprBZsGU49XhQxzV3`.

The 2026-10-15 Devnet preflight observed fee-payer balance **4.8706912 SOL**,
program account absent, estimated deployment peak **3.5928428 SOL**, and
estimated headroom **1.2778484 SOL**. Rent components were program account
0.00083312 SOL, ProgramData 2.3593806 SOL, temporary buffer 1.18008908 SOL,
config 0.0010414 SOL, first anchor 0.0014986 SOL, plus a 0.05 SOL fee reserve.
These estimates and balance are time-sensitive; there is RPC and fee/rent
uncertainty, so re-run preflight immediately before an approved transaction.
The program identity keypair and runtime authority were not funded by that
preflight. No transaction signature exists.

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
`TRACEIT_ANCHOR_CLUSTER` variables. Keep them unset until deployment and config
initialization are separately approved and complete and the database migration
is approved and applied.

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
- Backend typecheck, build, and Prisma validation passed. The full Jest run
  completed 32 suites: 16 passed, 15 failed, and 1 skipped (132 passed, 117
  failed, 4 skipped tests). Failures include unavailable non-loopback DB access
  and `envValidator.test.ts` expectations missing the now-required
  `RESEND_API_KEY`, `EMAIL_FROM`, and `AES_DOCUMENT_KEY`. Seven independent
  focused suites passed (51 tests); the new webhook-signature suite passed (3
  tests). The anchor persistence integration suite remains unrun without the
  disposable database.
- Frontend lint passed. The production build passed after route-level lazy
  loading; its largest JS chunk is 348.37 kB (previously 838.93 kB), and the
  build no longer reports a chunk over Vite's 500 kB advisory threshold. No
  frontend test script is configured.
- Backend `npm audit` refreshed on 2026-10-15 reports 18 findings: 1 critical,
  10 high, and 7 moderate. Installed versions include `proxy-addr` 2.0.7
  (transitive via Express 5.2.1), Joi 18.2.5, Multer 2.2.0, and `toml` 3.0.0
  (transitive via backend Anchor 0.32.1). `proxy-addr` 2.0.8 fixes the critical
  IPv4-mapped IPv6 trust-subnet spoofing issue; this app currently leaves
  Express `trust proxy` disabled, so forwarded IPs are not trusted. Joi 18.2.5
  is affected by the `isoDate()` ReDoS fixed in 18.2.6. Multer 2.2.0 is
  affected by unauthenticated multipart field-name DoS fixed in 2.3.0. No
  package changes were made because the npm-registry access request was
  rejected and the needed Multer/Joi versions are not in
  the local cache. The `toml` fix is 4.2.0, outside the current Anchor
  dependency's compatible range; do not force a major override without testing
  Anchor compatibility. Frontend and blockchain audits were not refreshed
  after the npm-registry approval request was rejected; the old counts of 9
  frontend and 13 blockchain findings are prior observations only.
- Reviewed official advisories: [proxy-addr CVE-2026-90711](https://github.com/jshttp/proxy-addr/security/advisories/GHSA-jqcg-44mw-7w3h), [Joi CVE-2026-92599](https://joi.dev/resources/changelog), [Multer CVE-2026-77078](https://github.com/advisories/GHSA-wc9g-mqfw-jrwm), and [toml GHSA-82x6-q7mm-w9cf](https://github.com/advisories/ghsa-82x6-q7mm-w9cf).
- `.github/workflows/ci.yml` still runs CI on pushes and pull requests for
  `Aarush-system`; Docker Hub publishing now runs only on `push` to `main`.
  CI now generates an ephemeral test wallet instead of writing a persistent
  GitHub wallet secret to disk. YAML parsing and shell syntax checks passed.
  Actual GitHub Actions behavior and repository secret settings were not
  exercised. The Docker publish remains dependent on configured Docker Hub
  secrets and was not triggered.
- Security review found role-based account lookups in `requireAuth`, 10 MiB
  Multer limits with a MIME allowlist, and raw-body HMAC webhook verification.
  Webhook audit metadata no longer records full request headers or signature
  values, and payment/refund signatures now share length-checked timing-safe
  comparison. A focused regression test covers valid, mismatched, and malformed
  signatures. File MIME values remain client-provided metadata; add content
  sniffing before treating uploaded evidence as a verified file type.
- Local Anchor build and artifact hashes remain unchanged. The local validator
  suite passed all 41 tests after rerunning with local-port permission. Anchor
  CLI remains 0.29.0 and Solana CLI 1.17.25. Current read-only
  Devnet preflight passed on 2026-10-15 with the expected genesis hash,
  candidate program ID and authorities; program account remains absent. The
  computed peak is **3.5928428 SOL**, with **1.2778484 SOL** headroom from the
  observed **4.8706912 SOL** fee-payer balance. The candidate program keypair
  and bootstrap/runtime keypair files exist and derive the reviewed public
  identities. The configured Solana CLI fee-payer keypair file is absent, and
  neither `ANCHOR_WALLET` nor `TRACEIT_DEPLOY_PROGRAM_KEYPAIR` is set in the
  operator shell. Do not request deployment approval until the intended
  fee-payer keypair path is configured and independently checked. No
  deployment, initialization, or smoke transaction occurred.
- Compose services and full payment, object-storage, email-provider, donor,
  charity, admin, and backend-to-chain flows remain unverified with isolated
  services and provider test credentials.

## Repository state

Work remains on `Aarush-system`; no commit or push was made. The checkpoint was
clean before this pass. Current changes are limited to CI release gating and
ephemeral test-wallet handling, webhook signature hardening and tests, frontend
route code splitting, and this evidence update. Preserve these changes when
continuing.
