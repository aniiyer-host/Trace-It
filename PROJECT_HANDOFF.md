# Trace-It project handoff

**Verified:** 2026-10-14 (WSL, branch `Aarush-system`). This note records the
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
| Devnet preflight | Passed read-only on 2026-10-14; refresh before any transaction. |
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

The 2026-10-14 Devnet preflight observed fee-payer balance **4.8706912 SOL**,
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

- No database migration, reset, seed, or persistent-database test was run in
  this completion pass. Five migration directories are untracked work and need
  review against the intended database before application.
- Eight focused backend suites passed (50 tests). PostgreSQL integration and
  broader API tests were not run because a disposable test database was not
  confirmed for this run.
- Frontend lint passes with zero errors or warnings; production build passes
  with a 838.81 kB JS chunk warning. No frontend test script is configured.
- Current npm audit reports: backend 18 findings (1 critical, 10 high, 7
  moderate); frontend 9 (8 high, 1 moderate); blockchain 13 (10 high, 3
  moderate). Findings are largely transitive, with several direct packages
  affected. `npm audit fix --dry-run` showed possible compatible updates but no
  dependency fixes were applied. Anchor's vulnerable `toml` dependency has no
  audit fix in the current Anchor range; resolving it needs compatibility
  assessment. Frontend Tailwind's suggested fix is a major-version migration.
- `.github/workflows/ci.yml` is configured to log into Docker Hub and push
  `latest` images on pushes to `Aarush-system`; the nearby comment incorrectly
  says “only on main branch.” Review this publishing policy and CI secrets
  before enabling or relying on that workflow.
- Compose services and full payment, storage, email, donor, charity, and admin
  flows remain to be exercised end to end with isolated local services and
  provider test credentials.

## Repository state

Work remains on `Aarush-system`; no commit or push was made. The worktree
contains substantial earlier user changes across backend, frontend, migrations,
Anchor program and docs. Preserve all existing changes when continuing. The
completion pass added a root README, this handoff, safe environment-example
tracking, localized frontend type fixes, safer deployment checks, and current
identity/status corrections in Anchor operation docs.
