# TRACE-IT BACKEND - CURRENT CONTEXT

## 1. Project State

Trace-It is a Node.js/TypeScript/Express backend. Prisma and PostgreSQL provide persistence. Blockchain functionality uses Solana/Anchor. Jest is used for tests. The backend is being debugged incrementally by multiple developers and AI agents.

## 2. Canonical Documentation

In this checkout, the canonical documents currently live at the repository root:

- Primary debugging/source-of-truth: `so-the-backend-is-rippling-cray.md`
- Detailed implementation/session notes: `backend_debugging.md`

The requested `backend/so-the-backend-is-rippling-cray.md` and `backend/backend_debugging.md` paths do not currently exist. This file is only a snapshot and does not replace either document.

Before future changes:

- Read the canonical debugging document first.
- Preserve existing BUG IDs.
- Record completed work in the canonical document.

## 3. Completed Work

### BUG-P2-04 - Startup Environment Validation

Production startup validates these required secrets:

- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`
- `RAZORPAY_WEBHOOK_SECRET`

Missing production variables are reported together. `envValidator.ts` and focused tests are present. Focused validator tests pass.

### BUG-P2-03 - Remove Secondary Weak Secrets

Weak fallback secrets were removed from KYC, blockchain HMAC, and Razorpay signature verification. `requireEnvironmentVariable()` is used where appropriate, including KYC, blockchain HMAC, and Razorpay payment-signature configuration. Focused configuration tests pass, and no weak fallback patterns were found under `backend/src`.

### BUG-P2-02 - Blockchain Retry Processor Backoff

Retry eligibility uses exponential thresholds:

- retry 0 -> 30 seconds
- retry 1 -> 60 seconds
- retry 2 -> 120 seconds
- retry 3 -> 240 seconds
- retry 4 -> 480 seconds
- retry count 5 remains excluded

Focused retry processor tests pass.

### BUG-P2-01 - Government Request Status Enum

`GovernmentRequestStatus` contains `OPEN`, `PROCESSING`, `COMPLETED`, and `EXPIRED`. Migration `20260821180000_add_government_request_enum` was created and applied to local PostgreSQL. The generated Prisma enum is synchronized, and relevant routes use `GovernmentRequestStatus.OPEN` rather than raw status literals. Focused regression tests pass.

## 4. Local Database State

- PostgreSQL 18 is running locally.
- Database: `traceit`.
- Endpoint: `localhost:5432`.
- Prisma connectivity has been verified.
- `npx prisma migrate status` reports the schema is up to date.
- The required migrations, including the government request enum migration, are applied.
- API/e2e suites that previously timed out on the incorrect test `DATABASE_URL` were run individually after the connection was corrected. The former timeout condition was resolved.
- Do not claim that every Jest test passes. Current API/e2e reruns reach Prisma but report known-request errors that still need investigation.

## 5. Test Environment

`.env.test` contains test-only JWT and Razorpay values. The previous missing `JWT_REFRESH_SECRET` and `RAZORPAY_WEBHOOK_SECRET` errors are resolved. Do not expose or copy secret values. The current test database URL points to local PostgreSQL. The Solana wallet setting still references a developer-specific path and is not portable.

## 6. Known Remaining Problems

### P1 Razorpay TypeScript Baseline

`npm run typecheck` currently reports exactly two known errors:

- `backend/src/routes/webhooks/razorpay.ts:52`
- `backend/src/routes/webhooks/razorpay.ts:372`

Both pass `RAZORPAY_WEBHOOK_SECRET`, typed as `string | undefined`, to `crypto.createHmac()`. These remain unresolved baseline errors and must not be reclassified as new P2 bugs.

### Blockchain Integration

`blockchainIntegration.test.ts` fails while loading:

`/home/aarus/.config/solana/devnet-traceit.json`

This is a missing developer-specific Solana wallet path, not a PostgreSQL problem. Solana/blockchain configuration is not complete on the current machine. Do not create or copy another developer's private key. Blockchain setup is the next active work area.

## 7. Current Test Status

| Area | Status | Notes |
|---|---|---|
| `envValidator.test.ts` | PASS | 5/5 focused tests |
| `donationServiceSecrets.test.ts` | PASS | 2/2 focused tests |
| `blockchainRetryProcessor.test.ts` | PASS | 2/2 focused tests |
| `governmentRequestStatus.test.ts` | PASS | 5/5 focused tests |
| `admin.test.ts` | FAIL / partially validated | Former timeout removed; current run reports Prisma known-request errors |
| `charity.test.ts` | FAIL / partially validated | Former timeout removed; current run reports Prisma known-request errors |
| `disbursement.test.ts` | FAIL / partially validated | Former timeout removed; current run reports Prisma known-request errors |
| `e2e.test.ts` | FAIL / partially validated | Former timeout removed; current run reports Prisma known-request errors |
| `blockchainIntegration.test.ts` | BLOCKED | Missing developer-specific Solana wallet file |
| Typecheck/build | BASELINE ERROR | Typecheck has the two known Razorpay errors; build is not declared green |

## 8. Current Objective

1. Configure the local Solana/Anchor environment.
2. Determine whether Trace-It expects an existing deployed program or local/devnet deployment.
3. Configure local blockchain wallet, RPC, and program settings correctly.
4. Run blockchain integration tests.
5. Get the backend running locally.
6. Verify application/network traffic.
7. Use that traffic for SIEM monitoring and analysis.
8. Continue remaining P2/P3 debugging afterward.

## 9. Rules for the Next AI

- Do not reset or rewrite working PostgreSQL configuration.
- Do not recreate applied migrations or modify the initial Prisma migration.
- Do not copy another developer's Solana private key.
- Do not fix blockchain integration by hardcoding another developer's wallet path.
- Do not treat the known Razorpay errors as newly discovered bugs.
- Do not modify unrelated code while setting up blockchain.
- Preserve existing BUG IDs.
- Read `so-the-backend-is-rippling-cray.md` before implementing a new bug.
- Update the canonical documentation after implementation.
- Prefer small, independently validated changes.
- Run focused tests before full-suite tests.
- Never commit secrets, wallet files, credential-bearing `.env` files, or private keys.

### NEXT ACTION

Set up Solana/blockchain locally.

First investigation:

1. Check Solana CLI availability.
2. Check current Solana configuration.
3. Inspect Trace-It blockchain environment variables and configuration.
4. Inspect `backend/src/services/blockchainService.ts`.
5. Locate the Anchor program and deployment configuration.
6. Determine whether the expected program is already deployed.
7. Create/configure a local developer wallet only if required.
8. Never use another developer's private key.
9. Modify application configuration/code only after understanding the expected blockchain architecture.

## 10. Handoff Philosophy

The backend is NOT starting from scratch. P2-01 through P2-04 have been implemented and locally validated. PostgreSQL/Prisma and the main API/e2e test environment are working. The next isolated task is blockchain setup.
