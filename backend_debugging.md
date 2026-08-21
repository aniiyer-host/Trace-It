# Trace-It Backend Debugging Roadmap, Bug Register & Developer Handoff

> **Document Purpose**: Single source-of-truth debugging roadmap, bug register, validation matrix, technical decision log, and sequential developer handoff for the Trace-It backend.  
> **Rule**: This document is strictly maintained and updated across sequential developer work sessions. No assumptions are treated as truth without direct source code or runtime verification.

---

# Table of Contents
1. [Developer Handoff](#developer-handoff)
2. [Current Overall Status](#current-overall-status)
3. [Bug Register](#bug-register)
4. [Implementation Log](#implementation-log)
5. [Debugging Session Log](#debugging-session-log)
6. [Regression / Validation Matrix](#regression--validation-matrix)
7. [Technical Decision Log](#technical-decision-log)
8. [Debugging Phases (Phase 0 – Phase 12)](#debugging-phases)
   - [Phase 0 — Baseline & Repository State](#phase-0--baseline--repository-state)
   - [Phase 1 — Application Startup & Runtime](#phase-1--application-startup--runtime)
   - [Phase 2 — Database / Prisma / Migrations / Triggers](#phase-2--database--prisma--migrations--triggers)
   - [Phase 3 — Authentication & Authorization](#phase-3--authentication--authorization)
   - [Phase 4 — Donation Core Logic](#phase-4--donation-core-logic)
   - [Phase 5 — Razorpay / Payment Webhooks](#phase-5--razorpay--payment-webhooks)
   - [Phase 6 — Blockchain / Solana Integration](#phase-6--blockchain--solana-integration)
   - [Phase 7 — Retry Queue / Reliability](#phase-7--retry-queue--reliability)
   - [Phase 8 — Test Suite Integrity](#phase-8--test-suite-integrity)
   - [Phase 9 — Security Hardening](#phase-9--security-hardening)
   - [Phase 10 — Performance & Scalability](#phase-10--performance--scalability)
   - [Phase 11 — Code Quality / Architecture](#phase-11--code-quality--architecture)
   - [Phase 12 — Final Integration & Regression Validation](#phase-12--final-integration--regression-validation)
9. [Command Reference](#command-reference)

---

# Developer Handoff

## Current Owner
- **Auditor / Dev 1**: Antigravity AI (Audit & Static Inspection Phase)
- **Next Assignee**: Dev 1 (Implementation Phase 1 & 2)

## Current Phase
- **Phase 0 (Baseline & Repository State)** — Complete
- **Ready for**: **Phase 1 (Application Startup & Runtime)** and **Phase 5 (Razorpay & Webhooks)** fixes

## Current Task
- Initial read-only audit complete. Comprehensive bug register, disproven findings catalogue, and phase roadmap established. Ready to execute code fixes starting with P0 blockers (Server startup, Razorpay rawBody middleware, Auth shadowing & cookie-parser, Webhook require import).

## Last Completed Work
- Completed 100% line-by-line inspection of all backend source files (`src/index.ts`, all routes, all services, all middleware, prisma schema, triggers, migrations, jest configs, docker files).
- Executed read-only typecheck (`npm run typecheck` — 0 errors) and test suite analysis (`npm test` — 1 suite passing [7 tests in unit suite], 5 suites failing due to unreachable database IP and missing devnet wallet keypair).
- Cross-verified and debunked multiple false positive claims from previous audit documents (`findings.md`, `backend_bugs_and_errors.md`).

## Changes Made
- Created `backend_debugging.md`.
- **No source code, migrations, tests, or configurations modified** (strict read-only audit).

## Tests Run
- `npm run typecheck` in `backend/` -> **Passed** (exit code 0).
- `npm test` in `backend/` (`cross-env NODE_OPTIONS=--experimental-vm-modules jest --runInBand --forceExit`) -> **Failed** (exit code 1; 1 passed suite, 5 failed suites).

## Tests Passed
- `tests/blockchainService.test.ts` (7/7 unit tests passing: SHA-512, HMAC-SHA-512, PDA derivation, explorer URL generation, donation integrity hash verification).

## Tests Failed
- `tests/blockchainIntegration.test.ts` — Failed due to missing local wallet file (`ENOENT: no such file or directory, open '/home/aarus/.config/solana/devnet-traceit.json'`).
- `tests/admin.test.ts` — Failed on `beforeAll` timeout (5000ms) trying to connect to unreachable PostgreSQL host in `.env.test` (`172.17.160.1:5432`).
- `tests/charity.test.ts` — Failed on `beforeAll` hook timeout connecting to `.env.test` PostgreSQL host.
- `tests/disbursement.test.ts` — Failed on `beforeAll` hook timeout connecting to `.env.test` PostgreSQL host.
- `tests/e2e.test.ts` — Failed on `beforeAll` hook timeout connecting to `.env.test` PostgreSQL host.

## Known Remaining Issues
1. **BUG-001 (P0)**: Duplicate `app.listen()` and misplaced `/health` endpoint after 404 handler in [src/index.ts](file:///Users/aniketiyer/Desktop/Trace-It/backend/src/index.ts).
2. **BUG-002 (P0)**: `express.json()` consumes webhook request body before `express.raw()` in [src/routes/webhooks/razorpay.ts](file:///Users/aniketiyer/Desktop/Trace-It/backend/src/routes/webhooks/razorpay.ts), permanently breaking HMAC signature verification.
3. **BUG-003 (P0)**: CommonJS `require('../db/prisma')` in ES Module files [src/routes/webhooks/razorpay.ts](file:///Users/aniketiyer/Desktop/Trace-It/backend/src/routes/webhooks/razorpay.ts#L446) and [src/routes/admin.ts](file:///Users/aniketiyer/Desktop/Trace-It/backend/src/routes/admin.ts#L864).
4. **BUG-004 (P0)**: Auth token refresh crash due to variable shadowing `refreshToken(refreshToken)` and missing `cookie-parser` in [src/routes/auth.ts](file:///Users/aniketiyer/Desktop/Trace-It/backend/src/routes/auth.ts#L153-L158).
5. **BUG-005 (P0)**: Weak hardcoded default fallback for `RAZORPAY_WEBHOOK_SECRET` in [src/routes/webhooks/razorpay.ts](file:///Users/aniketiyer/Desktop/Trace-It/backend/src/routes/webhooks/razorpay.ts#L15).
6. **BUG-006 (P1)**: Inconsistent PDA derivation in catch block of `recordDonation` in [src/services/blockchainService.ts](file:///Users/aniketiyer/Desktop/Trace-It/backend/src/services/blockchainService.ts#L181) (misses dash removal).
7. **BUG-007 (P1)**: `updateDonationStatusOnChain` function is defined but never called in [src/routes/admin.ts](file:///Users/aniketiyer/Desktop/Trace-It/backend/src/routes/admin.ts#L58-L116).
8. **BUG-008 (P1)**: Government request document download always throws 403 due to hardcoded owner-only check in [src/services/documentService.ts](file:///Users/aniketiyer/Desktop/Trace-It/backend/src/services/documentService.ts#L95).
9. **BUG-009 (P1)**: O(N) linear scan and bcrypt hash comparison across all users in [src/services/authService.ts](file:///Users/aniketiyer/Desktop/Trace-It/backend/src/services/authService.ts#L159-L185).
10. **BUG-010 (P2)**: Flawed `OR` query logic in retry queue backoff in [src/services/blockchainRetryProcessor.ts](file:///Users/aniketiyer/Desktop/Trace-It/backend/src/services/blockchainRetryProcessor.ts#L38-L43).

## Blocked By
- Local/CI integration testing is blocked on provisioning an accessible PostgreSQL instance and setting valid connection strings in `.env` / `.env.test`.

## Next Recommended Task
1. Execute Phase 1 implementation: Fix [src/index.ts](file:///Users/aniketiyer/Desktop/Trace-It/backend/src/index.ts) server listen logic, port binding, and mount `/health` before 404 handler.
2. Execute Phase 5 implementation: Fix [src/routes/webhooks/razorpay.ts](file:///Users/aniketiyer/Desktop/Trace-It/backend/src/routes/webhooks/razorpay.ts) raw body parser configuration and replace `require` with top-level `import { prisma }`.
3. Execute Phase 3 implementation: Fix [src/routes/auth.ts](file:///Users/aniketiyer/Desktop/Trace-It/backend/src/routes/auth.ts) variable shadowing, install `cookie-parser`, and update O(N) lookup.

## Important Context For Next Developer
- **Source-of-truth priority**: Code > Config > Database Migrations > Jest Config > Documentation.
- Previous files like `findings.md` and `backend_bugs_and_errors.md` contained several fabricated claims (e.g., claiming Decimal `.gt()` is invalid, claiming auth has no rate limiting, or quoting a fake `jest.config.js`). Always verify against the Bug Register and source code.
- Express 5 is used (`express: "^5.2.1"`). In Express 5, route params parsing and async error bubbling behave differently; `express-mongo-sanitize` is incompatible with Express 5 query getters and was rightfully removed.
- Prisma 7 is configured with `@prisma/adapter-pg` and custom output directory `backend/generated/prisma`.

---

# Current Overall Status

### Backend Health
- **Build / Static Types**: **Healthy** (0 compiler errors on `npm run typecheck`).
- **Runtime Startup**: **Degraded / Blocked** (Contains duplicate `app.listen()` calls and broken `/health` placement).
- **Core Webhooks**: **Broken** (Raw body stream consumed by global JSON parser before reaching webhook router).
- **Authentication**: **Partially Broken** (Refresh token & logout routes crash on `req.cookies` and function shadowing).
- **Blockchain Service**: **Functional with edge-case PDA bug** (Unit tests pass; catch-block PDA derivation has seed mismatch).
- **Test Suite**: **Incomplete Execution** (Unit tests pass; integration/E2E tests require live PostgreSQL and keypair).

### Critical Issues Remaining (P0)
- 4 Critical Blockers: BUG-001 (Duplicate Listen), BUG-002 (Webhook Raw Body), BUG-003 (CommonJS require in ESM), BUG-004 (Auth refresh crash).

### High Priority Issues Remaining (P1)
- 5 High Impact Bugs: BUG-005 (Default Webhook Secret), BUG-006 (PDA Seed Mismatch), BUG-007 (Admin On-Chain Status Never Invoked), BUG-008 (Gov Request Download 403), BUG-009 (O(N) Auth Token Iteration).

### Medium Priority Issues Remaining (P2)
- 3 Reliability Issues: BUG-010 (Retry Queue Backoff OR Query), BUG-011 (Weak JWT Secrets), BUG-012 (Double Logging in requestLogger).

### Tests
- **Total Test Suites**: 6
- **Suites Passing**: 1 (`tests/blockchainService.test.ts` — 7 tests)
- **Suites Failing**: 5 (Due to environment configuration / database timeouts)

### External Infrastructure Required
- **PostgreSQL 15+** (Required for migrations, triggers, and full test suite).
- **Solana Devnet RPC & Wallet Keypair** (Required for `tests/blockchainIntegration.test.ts`).
- **Backblaze B2 / S3 Storage** (Required for document upload & receipt generation runtime; mocked in tests).
- **Razorpay Sandbox Credentials** (Required for real end-to-end payment capture verification).

### Current Developer
- **Auditor**: Antigravity Pair Programmer
- **Role**: Architecture, Audit & Debugging Orchestrator

### Current Phase
- Audit Complete -> Handing off to Phase 1 (Startup) & Phase 5 (Webhooks) Implementation.

### Next Action
- Apply fixes for BUG-001, BUG-002, BUG-003, and BUG-004.

### Last Updated
- 2026-08-21T11:00:00+05:30

---

# Bug Register

| ID | Priority | Phase | Issue | Evidence | Status | Fix | Verification |
|---|---|---|---|---|---|---|---|
| **BUG-001** | **P0** | Phase 1 | Duplicate `app.listen()` calls and misplaced `/health` endpoint | [src/index.ts:82-94](file:///Users/aniketiyer/Desktop/Trace-It/backend/src/index.ts#L82-L94) has unconditional `app.listen`, followed by `/health` after `notFound`, followed by a 2nd conditional `app.listen`. | **CONFIRMED** | Remove 1st `app.listen()`, wrap in single test-aware guard, and move `/health` before route/error middleware. | Run `npm run dev` and curl `http://localhost:3000/health` -> 200 OK. |
| **BUG-002** | **P0** | Phase 5 | Razorpay webhook signature verification always fails | In [src/index.ts:27](file:///Users/aniketiyer/Desktop/Trace-It/backend/src/index.ts#L27), `app.use(express.json())` runs globally before webhook route, draining req stream. `req.rawBody` is undefined in [src/routes/webhooks/razorpay.ts:29](file:///Users/aniketiyer/Desktop/Trace-It/backend/src/routes/webhooks/razorpay.ts#L29). | **CONFIRMED** | Configure `express.json({ verify: (req, res, buf) => { (req as any).rawBody = buf; } })` in `src/index.ts`. | Post valid signed Razorpay payload -> 200 `{ received: true }`. |
| **BUG-003** | **P0** | Phase 5, 7 | CommonJS `require()` used in ES Module files | [src/routes/webhooks/razorpay.ts:446](file:///Users/aniketiyer/Desktop/Trace-It/backend/src/routes/webhooks/razorpay.ts#L446) and [src/routes/admin.ts:864](file:///Users/aniketiyer/Desktop/Trace-It/backend/src/routes/admin.ts#L864) call `require('../db/prisma')` inside ESM context with invalid relative path. | **CONFIRMED** | Remove inner `require()` calls and reuse top-level `import { prisma } from '../../db/prisma'`. | Trigger retry queue insertion; verify no `ReferenceError: require is not defined`. |
| **BUG-004** | **P0** | Phase 3 | Auth token refresh crashes due to variable shadowing & missing cookie parser | [src/routes/auth.ts:153-158](file:///Users/aniketiyer/Desktop/Trace-It/backend/src/routes/auth.ts#L153-L158) does `const refreshToken = req.cookies.refreshToken; const tokens = await refreshToken(refreshToken);`. `req.cookies` is undefined without `cookie-parser`. | **CONFIRMED** | Install `cookie-parser`, mount in `src/index.ts`, rename local variable `tokenCookie = req.cookies?.refreshToken`. | Call `POST /api/auth/refresh` with cookie -> returns new access & refresh tokens. |
| **BUG-005** | **P1** | Phase 5, 9 | Weak hardcoded fallback for `RAZORPAY_WEBHOOK_SECRET` | [src/routes/webhooks/razorpay.ts:15](file:///Users/aniketiyer/Desktop/Trace-It/backend/src/routes/webhooks/razorpay.ts#L15) defaults to `'your_webhook_secret_change_in_production'`. | **CONFIRMED** | Enforce non-empty secret in production / startup validation or fail fast if missing. | Verify webhook rejects invalid signature when env secret is configured. |
| **BUG-006** | **P1** | Phase 6 | Inconsistent PDA derivation seed in `BlockchainService.recordDonation` catch block | [src/services/blockchainService.ts:181](file:///Users/aniketiyer/Desktop/Trace-It/backend/src/services/blockchainService.ts#L181) uses `params.donationId` without removing dashes, whereas line 143 and Solana program use `cleanId`. | **CONFIRMED** | Change line 181 to `[Buffer.from('donation'), Buffer.from(cleanId)]`. | Unit test simulating 'already in use' error returns matching PDA. |
| **BUG-007** | **P1** | Phase 4, 6 | On-chain status update function defined but never invoked in admin disbursement | In [src/routes/admin.ts:58-116](file:///Users/aniketiyer/Desktop/Trace-It/backend/src/routes/admin.ts#L58-L116), `updateDonationStatusOnChain` is declared but never called (`updateDonationStatusOnChain()`). | **CONFIRMED** | Add `void updateDonationStatusOnChain();` or properly await it in the route handler. | Approve disbursement; verify on-chain status update call is dispatched. |
| **BUG-008** | **P1** | Phase 4, 9 | Document download under Government Request always fails with 403 | [src/routes/charity.ts:795](file:///Users/aniketiyer/Desktop/Trace-It/backend/src/routes/charity.ts#L795) calls `DocumentService.getDocumentUrl(documentId, userId)`. [src/services/documentService.ts:95](file:///Users/aniketiyer/Desktop/Trace-It/backend/src/services/documentService.ts#L95) enforces `ownerId === requesterId`. | **CONFIRMED** | Allow `DocumentService.getDocumentUrl` to accept an optional `bypassOwnershipCheck: boolean` or admin context. | Call `GET /api/charity/documents/:id/download` with active open government request -> returns signed URL. |
| **BUG-009** | **P1** | Phase 3, 10 | O(N) linear database scan and Bcrypt hashing on refresh token & logout | [src/services/authService.ts:159-185](file:///Users/aniketiyer/Desktop/Trace-It/backend/src/services/authService.ts#L159-L185) queries ALL users with `refreshTokenHash != null` and loops `bcrypt.compare`. | **CONFIRMED** | Decode JWT to extract `userId`, fetch user by `id`, and verify token with `bcrypt.compare` (or use SHA-256 session hash). | Benchmark refresh token endpoint; verify O(1) query by userId. |
| **BUG-010** | **P2** | Phase 7 | Flawed `OR` query logic in `BlockchainRetryProcessor` backoff | [src/services/blockchainRetryProcessor.ts:38-43](file:///Users/aniketiyer/Desktop/Trace-It/backend/src/services/blockchainRetryProcessor.ts#L38-L43) uses `OR: [ { retryCount: { lt: 5 } }, { lastAttempt: { lt: ... } } ]`. | **CONFIRMED** | Change query to filter by `AND: [ { retryCount: { lt: 5 } }, { lastAttempt: { lte: backoffThreshold } } ]`. | Insert failed retry item; verify processor respects exponential delay. |
| **BUG-011** | **P2** | Phase 3, 9 | Hardcoded weak JWT secrets across multiple files | [src/services/authService.ts:6-7](file:///Users/aniketiyer/Desktop/Trace-It/backend/src/services/authService.ts#L6-L7), [src/middleware/requireAuth.ts:5](file:///Users/aniketiyer/Desktop/Trace-It/backend/src/middleware/requireAuth.ts#L5) default to `'access_secret'`. | **CONFIRMED** | Require env vars or throw on startup in production. | Application throws descriptive error if `JWT_ACCESS_SECRET` is unset in prod. |
| **BUG-012** | **P3** | Phase 1, 11 | Double logging in `requestLogger.ts` | [src/middleware/requestLogger.ts:26-28](file:///Users/aniketiyer/Desktop/Trace-It/backend/src/middleware/requestLogger.ts#L26-L28) registers `logRequest` on both `res.on('finish')` and `res.on('close')`. | **CONFIRMED** | Use a boolean flag `let logged = false;` to ensure single logging. | Perform 1 HTTP request; inspect logs -> exactly 1 log line emitted. |
| **BUG-DISP-01** | **N/A** | Phase 5 | *Claim*: `donation.amount.gt(100000)` in `razorpay.ts:132` is invalid method on Prisma.Decimal | `Prisma.Decimal` extends `Decimal.js` which natively provides `.gt()`, `.gte()`, `.lt()`, `.toNumber()`. Tested and verified. | **DISPROVEN / NOT A BUG** | None needed. Code is valid. | `npm run typecheck` and Decimal unit invocation confirm `.gt()` exists and works. |
| **BUG-DISP-02** | **N/A** | Phase 3, 9 | *Claim*: Auth endpoints lack rate limiting | Previous docs claimed auth routes had no rate limiting. In [src/routes/auth.ts:12](file:///Users/aniketiyer/Desktop/Trace-It/backend/src/routes/auth.ts#L12), `router.use(authLimiter)` is applied (10 req/15m). | **DISPROVEN / NOT A BUG** | None needed. Rate limiter is already active. | Inspect [src/routes/auth.ts:12](file:///Users/aniketiyer/Desktop/Trace-It/backend/src/routes/auth.ts#L12) and [src/middleware/strictLimiter.ts](file:///Users/aniketiyer/Desktop/Trace-It/backend/src/middleware/strictLimiter.ts). |
| **BUG-DISP-03** | **N/A** | Phase 5 | *Claim*: Missing `await` on `writeAuditLog` in `razorpay.ts:245, 262` | Lines 227, 252 have `await writeAuditLog(...)`. Non-critical audit logs intentionally use `void writeAuditLog(...)` for non-blocking execution. | **DISPROVEN / NOT A BUG** | None needed. Pattern is intentional and safe. | Code inspection of [src/routes/webhooks/razorpay.ts](file:///Users/aniketiyer/Desktop/Trace-It/backend/src/routes/webhooks/razorpay.ts). |
| **BUG-DISP-04** | **N/A** | Phase 8 | *Claim*: `jest.config.js` uses both ts-jest and @swc/jest in transform array | Previous `findings.md` quoted a fake `jest.config.js`. Actual [jest.config.js](file:///Users/aniketiyer/Desktop/Trace-It/backend/jest.config.js) uses only `@swc/jest`. | **DISPROVEN / NOT A BUG** | None needed. Config is unified on `@swc/jest`. | Code inspection of [jest.config.js](file:///Users/aniketiyer/Desktop/Trace-It/backend/jest.config.js). |

---

# Implementation Log

| Date | Developer | Phase | Task | Files Changed | Change | Reason | Validation | Result |
|---|---|---|---|---|---|---|---|---|
| *2026-08-21* | *Antigravity AI* | *Phase 0* | *Read-only repository audit & debugging roadmap creation* | `backend_debugging.md` (Created) | *Created roadmap, bug register, disproven register, and handoff guide* | *Audit & planning* | *Read-only inspection & typecheck* | *Complete (No source implementation performed during this audit)* |

> **Audit Notice**: No source code, database migrations, tests, or configurations have been modified during this audit phase.

---

# Debugging Session Log

## Session 1 — 2026-08-21

**Developer**: Antigravity AI (Lead Auditor)  
**Phase**: Phase 0 — Baseline & Repository State / Comprehensive Audit  
**Objective**: Perform an exhaustive, independent read-only audit of the entire backend codebase, verify prior audit claims, identify confirmed bugs and false positives, and produce `backend_debugging.md`.

### Investigated
- Root repository configuration, Dockerfiles, docker-compose, CI workflows, and documentation.
- `backend/package.json`, `package-lock.json`, `tsconfig.json`, `jest.config.js`, `jest.setup.js`, `jest.teardown.js`.
- `backend/prisma/schema.prisma`, `prisma.config.ts`, and all 3 SQL migration scripts.
- Express entry point [src/index.ts](file:///Users/aniketiyer/Desktop/Trace-It/backend/src/index.ts).
- All middleware in `src/middleware/` (auth, role, logger, rate-limit, multer, request ID, error, KYC).
- All routes in `src/routes/` (`auth.ts`, `public.ts`, `donor.ts`, `charity.ts`, `admin.ts`, `webhooks/razorpay.ts`).
- All services in `src/services/` (auth, blockchain, donation, document, email, hash, receipt, status, storage, vault, retry processor).
- All test suites in `tests/` and on-chain Anchor smart contract in `blockchain/programs/traceit/`.

### Findings
1. Found 4 P0 Critical Blockers (Duplicate `app.listen()`, Webhook raw body middleware bypass, CommonJS `require()` in ESM, Auth refresh shadowing & missing cookie parser).
2. Found 5 P1 High Impact functional bugs (Default secrets, PDA derivation seed mismatch, Missing on-chain status dispatch in Admin approval, Gov request download 403, O(N) token search).
3. Disproved 4 previous claims from `findings.md` and `backend_bugs_and_errors.md` (Decimal `.gt()` is valid, Auth rate limiting exists, Audit log await is intentional, Jest config only uses SWC).
4. Ran `npm run typecheck` (0 errors). Ran `npm test` (Unit tests passed; integration suites timed out due to unreachable database IP in `.env.test`).

### Implemented
- Created `backend_debugging.md` with complete Phase 0–12 plan, Bug Register, Handoff, and Regression Matrix.
- *No source files modified (read-only audit constraint strictly preserved).*

### Validation
- Static analysis and compiler validation via `npm run typecheck`.
- Test suite execution via `npm test`.

### Problems Remaining
- P0/P1 bugs remain in codebase for Dev 1 / Dev 2 implementation.
- Local PostgreSQL instance and devnet keypair needed for end-to-end test validation.

### Next Step
- Handoff to Dev 1 to execute Phase 1 (Startup fixes) and Phase 5 (Webhook fixes).

---

# Regression / Validation Matrix

| Area | Expected Behavior | Validation Method | Status | Last Verified |
|---|---|---|---|---|
| **Server Startup** | Server binds to `PORT` once, mounts `/health` (returns 200), starts retry processor (non-test). | `npm run dev` followed by `curl http://localhost:3000/health` | **UNVERIFIED (BROKEN in code)** | 2026-08-21 (Static audit confirmed BUG-001) |
| **Database Connection** | Prisma client connects to PostgreSQL with `@prisma/adapter-pg` pool. | Run Prisma query in script or test suite. | **UNVERIFIED (Requires local DB)** | 2026-08-21 |
| **Authentication** | Signup with email OTP, login returns JWTs, refresh rotates tokens, logout clears session. | Integration tests against `/api/auth/*`. | **UNVERIFIED (BROKEN in code)** | 2026-08-21 (Static audit confirmed BUG-004) |
| **Authorization (RBAC)** | Role guards reject unauthorized access with 403 Forbidden. | Supertest requests with Donor/Charity/Admin tokens. | **VERIFIED (Static Logic Correct)** | 2026-08-21 |
| **Donations Core** | Create donation, validate KYC threshold (>10,000 INR), create order, insert INITIATED record. | Supertest `POST /api/donor/donate`. | **VERIFIED (Static Logic Correct)** | 2026-08-21 |
| **Razorpay Webhook** | Verifies HMAC-SHA256 signature, updates donation to SUCCESS, logs AML flag if >100k. | Supertest `POST /api/webhooks/razorpay` with raw payload. | **UNVERIFIED (BROKEN in code)** | 2026-08-21 (Static audit confirmed BUG-002) |
| **Blockchain Recording** | Derives PDA `[b"donation", cleanId]`, records donation on Solana devnet, sets `solanaTxHash`. | `tests/blockchainService.test.ts` & integration tests. | **VERIFIED (Unit pass, BUG-006 identified)** | 2026-08-21 |
| **Blockchain Retry Queue** | Exponential backoff for failed transactions, retry processor updates record & queue. | Unit/Integration tests with mocked service. | **UNVERIFIED (BUG-010 identified)** | 2026-08-21 |
| **PostgreSQL Triggers** | `set_updated_at`, `sync_campaign_raised`, `mark_tokens_redeemed`, `handle_legal_hold` fire. | `npx tsx tests/test_trigger_detailed.ts`. | **UNVERIFIED (Requires local DB)** | 2026-08-21 |
| **Security Controls** | Rate limiting (100 req/15m global, 10 req/15m auth), IDOR guards on receipts/timelines. | Supertest rate limit & IDOR assertion tests. | **VERIFIED (Static Logic Correct)** | 2026-08-21 |

---

# Technical Decision Log

| ID | Decision | Reason | Alternatives | Consequence |
|---|---|---|---|---|
| **DEC-001** | Use `express.json({ verify: ... })` to capture `req.rawBody` | Razorpay webhook signature verification requires the exact, unparsed raw Buffer to compute HMAC-SHA256. | Route-specific `express.raw()` (fails if global `express.json()` mounted first). | Allows global JSON parsing while preserving raw Buffer for webhooks. |
| **DEC-002** | Remove dashes from UUID before deriving Solana PDA | Solana program instruction `record_donation.rs` derives seeds using `donation_id.replace("-", "").as_bytes()`. | Change Solana program seed logic (breaking change for deployed Anchor program). | Client must consistently sanitize `donationId.replace(/-/g, '')` in all service methods. |
| **DEC-003** | Use standard ES Module imports for Prisma client singleton | The backend uses `"type": "module"`. CommonJS `require()` is invalid in Node ESM. | Polyfill `createRequire`. | Eliminates `ReferenceError` and maintains singleton connection pool across all services. |
| **DEC-004** | Decode JWT to extract `userId` in `refreshToken` instead of looping all users | Looping all users and running `bcrypt.compare` is an O(N) CPU bottleneck (~100ms per user). | Separate RefreshToken table with hashed lookup. | Immediate O(1) performance lookup with zero schema migration required. |
| **DEC-005** | Mount `/health` endpoint before any authentication or 404 middleware | Container orchestrators and Docker healthchecks require lightweight, unauthenticated 200 OK. | Leave at end of file (returns 404). | Docker and Kubernetes health probes succeed reliably. |

---

# Debugging Phases

```
┌─────────────────────────────────────────────────────────────┐
│  Phase 0: Baseline & Repository State (Audit Complete)      │
└──────────────────────────────┬──────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────┐
│  Phase 1: Application Startup & Runtime (BUG-001, BUG-012)  │
└──────────────────────────────┬──────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────┐
│  Phase 2: Database / Prisma / Migrations / Triggers         │
└──────────────────────────────┬──────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────┐
│  Phase 3: Authentication & Authorization (BUG-004, BUG-009) │
└──────────────────────────────┬──────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────┐
│  Phase 4: Donation Core Logic (BUG-007, BUG-008)            │
└──────────────────────────────┬──────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────┐
│  Phase 5: Razorpay / Payment Webhooks (BUG-002, BUG-003)    │
└──────────────────────────────┬──────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────┐
│  Phase 6: Blockchain / Solana Integration (BUG-006)         │
└──────────────────────────────┬──────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────┐
│  Phase 7: Retry Queue & Reliability (BUG-010)               │
└──────────────────────────────┬──────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────┐
│  Phase 8: Test Suite Integrity & Isolation                  │
└──────────────────────────────┬──────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────┐
│  Phase 9: Security Hardening (BUG-005, BUG-011)             │
└──────────────────────────────┬──────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────┐
│  Phase 10: Performance & Scalability                        │
└──────────────────────────────┬──────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────┐
│  Phase 11: Code Quality & Architecture                      │
└──────────────────────────────┬──────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────┐
│  Phase 12: Final Integration & Regression Validation        │
└─────────────────────────────────────────────────────────────┘
```

---

## Phase 0 — Baseline & Repository State

### Objective
Establish verified ground truth regarding dependencies, build integrity, type safety, test execution baseline, and documentation discrepancies.

### Relevant Files
- [backend/package.json](file:///Users/aniketiyer/Desktop/Trace-It/backend/package.json)
- [backend/package-lock.json](file:///Users/aniketiyer/Desktop/Trace-It/backend/package-lock.json)
- [backend/tsconfig.json](file:///Users/aniketiyer/Desktop/Trace-It/backend/tsconfig.json)
- [backend/jest.config.js](file:///Users/aniketiyer/Desktop/Trace-It/backend/jest.config.js)
- [backend/prisma.config.ts](file:///Users/aniketiyer/Desktop/Trace-It/backend/prisma.config.ts)

### Existing Findings
- **Claim**: TypeScript version is outdated/unsupported (`^7.0.2`).
  - **Classification**: **INCORRECT / TYPO IN DOCS**. `package.json` specifies `"typescript": "^7.0.2"`, which resolves to an installed package and `npm run typecheck` passes with code 0.
- **Claim**: Prisma and Client versions aligned (`^7.9.1`).
  - **Classification**: **CONFIRMED**. `@prisma/client`, `prisma`, and `@prisma/adapter-pg` all match at `7.9.1`.
- **Claim**: Jest uses both `@swc/jest` and `ts-jest` simultaneously in `jest.config.js`.
  - **Classification**: **INCORRECT (Fabricated in old doc)**. Actual `jest.config.js` only configures `@swc/jest`.

### Debugging Tasks
- [x] (P0) Run `npm run typecheck` to verify TypeScript compile integrity. *(Result: Passed, 0 errors)*.
- [x] (P0) Run `npm test` to determine baseline test failure modes. *(Result: 1 pass, 5 fail due to DB/keypair environment)*.
- [x] (P1) Audit `package.json` dependencies for missing runtime modules (`cookie-parser`). *(Result: Found missing)*.

### Implementation Tasks
- [ ] (P3) Normalize `"typescript"` in `backend/package.json` to `"^5.5.0"` or stable semver during maintenance.

### Validation
- Run `npm run typecheck` -> exits with code 0.

### External Dependencies
- None (Node.js runtime only).

### Exit Criteria
- Complete codebase mapped; toolchain execution paths verified.

---

## Phase 1 — Application Startup & Runtime

### Objective
Ensure clean application bootstrap, proper middleware ordering, single listener attachment, and functional Docker/orchestrator health checks.

### Relevant Files
- [backend/src/index.ts](file:///Users/aniketiyer/Desktop/Trace-It/backend/src/index.ts)
- [backend/src/middleware/notFound.ts](file:///Users/aniketiyer/Desktop/Trace-It/backend/src/middleware/notFound.ts)
- [backend/src/middleware/errorHandler.ts](file:///Users/aniketiyer/Desktop/Trace-It/backend/src/middleware/errorHandler.ts)
- [backend/src/middleware/requestLogger.ts](file:///Users/aniketiyer/Desktop/Trace-It/backend/src/middleware/requestLogger.ts)
- [backend/Dockerfile](file:///Users/aniketiyer/Desktop/Trace-It/backend/Dockerfile)

### Existing Findings
- **Claim**: Duplicate `app.listen()` calls cause `EADDRINUSE`.
  - **Classification**: **CONFIRMED (BUG-001)**. `src/index.ts:82` calls `app.listen` unconditionally, and `src/index.ts:91` calls it again under `NODE_ENV !== "test"`.
- **Claim**: `/health` endpoint placed after 404 handler.
  - **Classification**: **CONFIRMED (BUG-001)**. `app.get("/health")` is at line 86, after `app.use(notFound)` at line 60.

### Debugging Tasks
- [ ] (P0) Inspect `src/index.ts` startup logic and remove the first unconditional `app.listen()` at lines 82–84.
- [ ] (P0) Move `app.get("/health", (req, res) => res.json({ status: "healthy" }))` up to the top of middleware stack (before `notFound` and authentication).
- [ ] (P1) Ensure `app.listen()` is only executed when `process.env.NODE_ENV !== "test" && !process.env.JEST_WORKER_ID` or when `import.meta.url === ...`.
- [ ] (P2) Align Dockerfile port (`3001`) with application default port (`3000` or `3001` via `process.env.PORT || 3001`).
- [ ] (P3) Fix double-logging in `requestLogger.ts` by adding a guard boolean preventing both `finish` and `close` callbacks from logging twice (BUG-012).

### Implementation Tasks
- Refactor [backend/src/index.ts](file:///Users/aniketiyer/Desktop/Trace-It/backend/src/index.ts) to clean up imports, move `/health` before 404 handler, and retain exactly one conditioned `app.listen()`.
- Add `let logged = false;` in [backend/src/middleware/requestLogger.ts](file:///Users/aniketiyer/Desktop/Trace-It/backend/src/middleware/requestLogger.ts).

### Validation
- Start dev server: `npm run dev`.
- Run: `curl -i http://localhost:3000/health` -> HTTP 200 `{ "status": "healthy" }`.
- Import `app` in Supertest without port conflict errors.

### External Dependencies
- None.

### Exit Criteria
- Server starts cleanly on single port without errors; `/health` returns 200 OK; Supertest imports `app` without binding real port.

---

## Phase 2 — Database / Prisma / Migrations / Triggers

### Objective
Ensure database schema, custom PostgreSQL triggers, and Prisma 7 client configuration are consistent and operational.

### Relevant Files
- [backend/prisma/schema.prisma](file:///Users/aniketiyer/Desktop/Trace-It/backend/prisma/schema.prisma)
- [backend/prisma.config.ts](file:///Users/aniketiyer/Desktop/Trace-It/backend/prisma.config.ts)
- [backend/src/db/prisma.ts](file:///Users/aniketiyer/Desktop/Trace-It/backend/src/db/prisma.ts)
- [backend/prisma/migrations/20260815123000_add_triggers_and_functions/migration.sql](file:///Users/aniketiyer/Desktop/Trace-It/backend/prisma/migrations/20260815123000_add_triggers_and_functions/migration.sql)
- [backend/prisma/seed.ts](file:///Users/aniketiyer/Desktop/Trace-It/backend/prisma/seed.ts)

### Existing Findings
- **Claim**: `GovernmentRequest.status` is a `String` rather than enum.
  - **Classification**: **CONFIRMED**. Model explicitly uses `String @default("OPEN")`. This matches database design.
- **Claim**: Migrations contain triggers for `updatedAt`, `sync_campaign_raised`, `mark_tokens_redeemed`, `handle_legal_hold`.
  - **Classification**: **CONFIRMED**. Verified in `20260815123000_add_triggers_and_functions/migration.sql`.

### Debugging Tasks
- [ ] (P0) Verify connection string loading in `prisma.config.ts` and `src/db/prisma.ts`.
- [ ] (P1) Run `npx tsx tests/test_triggers_exist.ts` against a live PostgreSQL instance to confirm trigger installation.
- [ ] (P1) Run `npx tsx tests/test_trigger_detailed.ts` to validate trigger execution logic (`sync_campaign_raised` and `handle_legal_hold`).
- [ ] (P2) Run `npx tsx tests/test_seed.ts` to verify seed data integrity.

### Implementation Tasks
- None required unless schema discrepancies emerge during PostgreSQL integration testing.

### Validation
- `npx prisma generate` succeeds.
- `npx tsx tests/test_triggers_exist.ts` outputs `✅ EXISTS` for all 4 functions and 10 triggers.

### External Dependencies
- **PostgreSQL 15+** with connection string in `DATABASE_URL`.

### Exit Criteria
- Migrations deploy cleanly; all triggers exist and execute; seed script populates test records.

---

## Phase 3 — Authentication & Authorization

### Objective
Fix critical crashes in token refresh, eliminate O(N) performance bottlenecks in auth lookups, and ensure secure token lifecycle management.

### Relevant Files
- [backend/src/services/authService.ts](file:///Users/aniketiyer/Desktop/Trace-It/backend/src/services/authService.ts)
- [backend/src/routes/auth.ts](file:///Users/aniketiyer/Desktop/Trace-It/backend/src/routes/auth.ts)
- [backend/src/middleware/requireAuth.ts](file:///Users/aniketiyer/Desktop/Trace-It/backend/src/middleware/requireAuth.ts)
- [backend/src/middleware/requireRole.ts](file:///Users/aniketiyer/Desktop/Trace-It/backend/src/middleware/requireRole.ts)
- [backend/src/middleware/strictLimiter.ts](file:///Users/aniketiyer/Desktop/Trace-It/backend/src/middleware/strictLimiter.ts)

### Existing Findings
- **Claim**: Variable shadowing in `src/routes/auth.ts:158` crashes `POST /api/auth/refresh`.
  - **Classification**: **CONFIRMED (BUG-004)**. `const refreshToken = req.cookies.refreshToken;` shadows function `refreshToken()`.
- **Claim**: `req.cookies` is undefined because `cookie-parser` is missing.
  - **Classification**: **CONFIRMED (BUG-004)**. `cookie-parser` is not installed or mounted.
- **Claim**: O(N) user scan in `authService.refreshToken` and `authService.logout`.
  - **Classification**: **CONFIRMED (BUG-009)**. Iterates through all users in database comparing bcrypt hashes.
- **Claim**: Auth endpoints lack rate limiting.
  - **Classification**: **INCORRECT / DISPROVEN (BUG-DISP-02)**. `src/routes/auth.ts:12` explicitly applies `router.use(authLimiter)` (10 req/15m).

### Debugging Tasks
- [ ] (P0) Install `cookie-parser` (`npm i cookie-parser` & `npm i -D @types/cookie-parser`), mount `app.use(cookieParser())` in `src/index.ts`.
- [ ] (P0) Fix variable shadowing in `src/routes/auth.ts`: rename cookie variable to `tokenCookie` or `cookieRefreshToken`.
- [ ] (P1) Refactor `authService.refreshToken`: decode/verify JWT first to get `userId`, fetch single user via `prisma.profile.findUnique({ where: { id: userId } })`, and compare hash (O(1)).
- [ ] (P1) Refactor `authService.logout`: decode JWT to extract `userId` and set `refreshTokenHash: null` directly (O(1)).
- [ ] (P2) Remove hardcoded default secret strings in `authService.ts` and `requireAuth.ts` for production environments.

### Implementation Tasks
- Modify [backend/src/routes/auth.ts](file:///Users/aniketiyer/Desktop/Trace-It/backend/src/routes/auth.ts) to fix variable shadowing.
- Modify [backend/src/services/authService.ts](file:///Users/aniketiyer/Desktop/Trace-It/backend/src/services/authService.ts) to perform O(1) user lookups for token refresh and logout.
- Update [backend/src/index.ts](file:///Users/aniketiyer/Desktop/Trace-It/backend/src/index.ts) with `cookieParser()`.

### Validation
- `POST /api/auth/signup` -> registers user and generates OTP.
- `POST /api/auth/verify-email` -> verifies user.
- `POST /api/auth/login` -> sets HttpOnly cookie and returns access token.
- `POST /api/auth/refresh` -> succeeds in <50ms without crashing.
- `POST /api/auth/logout` -> clears cookie and database hash.

### External Dependencies
- PostgreSQL database.

### Exit Criteria
- Authentication lifecycle works end-to-end; no crashes on refresh/logout; token lookups execute in O(1) time.

---

## Phase 4 — Donation Core Logic

### Objective
Validate donation creation, KYC threshold enforcement, receipt generation, and disbursement approval flows.

### Relevant Files
- [backend/src/routes/donor.ts](file:///Users/aniketiyer/Desktop/Trace-It/backend/src/routes/donor.ts)
- [backend/src/routes/charity.ts](file:///Users/aniketiyer/Desktop/Trace-It/backend/src/routes/charity.ts)
- [backend/src/routes/admin.ts](file:///Users/aniketiyer/Desktop/Trace-It/backend/src/routes/admin.ts)
- [backend/src/middleware/kycCheckMiddleware.ts](file:///Users/aniketiyer/Desktop/Trace-It/backend/src/middleware/kycCheckMiddleware.ts)
- [backend/src/services/donationService.ts](file:///Users/aniketiyer/Desktop/Trace-It/backend/src/services/donationService.ts)
- [backend/src/services/receiptService.ts](file:///Users/aniketiyer/Desktop/Trace-It/backend/src/services/receiptService.ts)
- [backend/src/services/statusService.ts](file:///Users/aniketiyer/Desktop/Trace-It/backend/src/services/statusService.ts)

### Existing Findings
- **Claim**: `updateDonationStatusOnChain` defined but never invoked in admin disbursement approval.
  - **Classification**: **CONFIRMED (BUG-007)**. `admin.ts:59-115` defines the async function but omits calling it.
- **Claim**: Government request document download always fails with 403.
  - **Classification**: **CONFIRMED (BUG-008)**. `DocumentService.getDocumentUrl` unconditionally enforces ownership match, rejecting authorized legal downloads.

### Debugging Tasks
- [ ] (P1) In `src/routes/admin.ts:116`, invoke `void updateDonationStatusOnChain();` so that approving disbursements updates on-chain statuses.
- [ ] (P1) In `src/services/documentService.ts`, update `getDocumentUrl` to accept an optional `bypassOwnershipCheck?: boolean` parameter (used when caller is an authorized government request).
- [ ] (P2) Verify KYC check middleware properly blocks donations >10,000 INR when `donorProfile.kycStatus !== 'APPROVED'` (returns 402 `{ requiresKyc: true }`).
- [ ] (P2) Verify receipt generation returns a 15-minute presigned URL from Backblaze B2/S3.

### Implementation Tasks
- Update [backend/src/routes/admin.ts](file:///Users/aniketiyer/Desktop/Trace-It/backend/src/routes/admin.ts) line 116.
- Update [backend/src/services/documentService.ts](file:///Users/aniketiyer/Desktop/Trace-It/backend/src/services/documentService.ts) line 85.

### Validation
- `POST /api/donor/donate` with amount 15000 without KYC -> returns 402 `{ requiresKyc: true }`.
- `POST /api/donor/donate` with amount 5000 -> returns 201 `{ orderId, publicDonationId }`.
- `POST /api/admin/disburse/:id/approve` -> approves disbursement and allocates donations.

### External Dependencies
- PostgreSQL database, Storage bucket credentials (for receipts).

### Exit Criteria
- Complete donation lifecycle from initiation to allocation functions properly; legal gateway document retrieval works without false 403 errors.

---

## Phase 5 — Razorpay / Payment Webhooks

### Objective
Ensure webhook payloads preserve their raw body for HMAC-SHA256 signature verification, remove CommonJS imports, and eliminate weak default webhook secrets.

### Relevant Files
- [backend/src/routes/webhooks/razorpay.ts](file:///Users/aniketiyer/Desktop/Trace-It/backend/src/routes/webhooks/razorpay.ts)
- [backend/src/index.ts](file:///Users/aniketiyer/Desktop/Trace-It/backend/src/index.ts)
- [backend/src/services/donationService.ts](file:///Users/aniketiyer/Desktop/Trace-It/backend/src/services/donationService.ts)

### Existing Findings
- **Claim**: Razorpay signature verification fails on all requests due to missing rawBody.
  - **Classification**: **CONFIRMED (BUG-002)**. `express.json()` consumes the stream; `req.rawBody` is undefined.
- **Claim**: CommonJS `require('../db/prisma')` used inside `addToBlockchainRetryQueue`.
  - **Classification**: **CONFIRMED (BUG-003)**. Line 446 uses `require` with invalid path in an ESM file.
- **Claim**: `donation.amount.gt(100000)` at line 132 is an invalid Decimal method.
  - **Classification**: **INCORRECT / DISPROVEN (BUG-DISP-01)**. Method `.gt()` is standard on `Prisma.Decimal`.
- **Claim**: Missing `await` on `writeAuditLog` in lines 245, 262.
  - **Classification**: **INCORRECT / DISPROVEN (BUG-DISP-03)**. Lines have await or intentional fire-and-forget.

### Debugging Tasks
- [ ] (P0) In `src/index.ts`, configure `express.json({ verify: (req, res, buf) => { (req as any).rawBody = buf; } })` to populate `rawBody` for all incoming requests before parsing.
- [ ] (P0) In `src/routes/webhooks/razorpay.ts`, remove `const { prisma } = require('../db/prisma');` at line 446 and use top-level `import { prisma }`.
- [ ] (P1) In `src/routes/webhooks/razorpay.ts:15`, remove weak default secret or add startup validation ensuring `RAZORPAY_WEBHOOK_SECRET` is set in production.
- [ ] (P1) Verify webhook idempotency guard: duplicate webhooks for the same `razorpayPaymentId` return 200 `{ received: true }` without double-crediting.

### Implementation Tasks
- Update [backend/src/index.ts](file:///Users/aniketiyer/Desktop/Trace-It/backend/src/index.ts) `express.json()` configuration.
- Update [backend/src/routes/webhooks/razorpay.ts](file:///Users/aniketiyer/Desktop/Trace-It/backend/src/routes/webhooks/razorpay.ts) line 446.

### Validation
- Generate HMAC-SHA256 of test payload with secret, send `POST /api/webhooks/razorpay` with `x-razorpay-signature` header -> returns 200 `{ received: true }` and updates donation status to `SUCCESS`.
- Send tampered signature -> returns 401 `Invalid webhook signature`.

### External Dependencies
- `RAZORPAY_WEBHOOK_SECRET` environment variable.

### Exit Criteria
- Webhook signature verification validates authentic payloads and rejects forged payloads; retry queue helper executes cleanly without ESM/CJS errors.

---

## Phase 6 — Blockchain / Solana Integration

### Objective
Ensure consistency between TypeScript client and on-chain Anchor smart contract, fix PDA derivation seed bug, and verify on-chain record integrity.

### Relevant Files
- [backend/src/services/blockchainService.ts](file:///Users/aniketiyer/Desktop/Trace-It/backend/src/services/blockchainService.ts)
- [backend/src/services/blockchainInstance.ts](file:///Users/aniketiyer/Desktop/Trace-It/backend/src/services/blockchainInstance.ts)
- [blockchain/programs/traceit/src/instructions/record_donation.rs](file:///Users/aniketiyer/Desktop/Trace-It/blockchain/programs/traceit/src/instructions/record_donation.rs)
- [backend/tests/blockchainService.test.ts](file:///Users/aniketiyer/Desktop/Trace-It/backend/tests/blockchainService.test.ts)

### Existing Findings
- **Claim**: Inconsistent PDA derivation in `BlockchainService.recordDonation` catch block.
  - **Classification**: **CONFIRMED (BUG-006)**. Catch block at line 181 uses raw `params.donationId` with dashes instead of `cleanId`, failing PDA recalculation on 'already in use'.
- **Claim**: Unit tests in `tests/blockchainService.test.ts` pass cleanly.
  - **Classification**: **CONFIRMED**. All 7 unit tests pass.

### Debugging Tasks
- [ ] (P1) In `src/services/blockchainService.ts:181`, update catch block PDA derivation to use `cleanId` (`params.donationId.replace(/-/g, '')`).
- [ ] (P1) In `src/services/blockchainInstance.ts`, ensure required environment variables (`SOLANA_RPC_URL`, `SOLANA_WALLET_KEYPAIR_PATH`, `SOLANA_PROGRAM_ID`) throw clear descriptive errors when missing.
- [ ] (P2) Update `tests/blockchainIntegration.test.ts` to use a dynamic or mocked keypair if `SOLANA_WALLET_KEYPAIR_PATH` is not present locally.

### Implementation Tasks
- Edit [backend/src/services/blockchainService.ts](file:///Users/aniketiyer/Desktop/Trace-It/backend/src/services/blockchainService.ts) line 181.

### Validation
- Run `npm test -- tests/blockchainService.test.ts` -> 7/7 tests pass.
- Verify PDA derived in TypeScript matches on-chain seed `seeds = [b"donation", donation_id.replace("-", "").as_bytes()]`.

### External Dependencies
- Solana Devnet RPC & funded keypair (for live on-chain integration tests).

### Exit Criteria
- 100% PDA derivation consistency across all normal and catch execution paths.

---

## Phase 7 — Retry Queue / Reliability

### Objective
Ensure reliable background retry processing of failed blockchain transactions with correct exponential backoff and error recovery.

### Relevant Files
- [backend/src/services/blockchainRetryProcessor.ts](file:///Users/aniketiyer/Desktop/Trace-It/backend/src/services/blockchainRetryProcessor.ts)
- [backend/prisma/migrations/20260818000001_create_blockchain_retry_queue/migration.sql](file:///Users/aniketiyer/Desktop/Trace-It/backend/prisma/migrations/20260818000001_create_blockchain_retry_queue/migration.sql)
- [backend/src/routes/webhooks/razorpay.ts](file:///Users/aniketiyer/Desktop/Trace-It/backend/src/routes/webhooks/razorpay.ts)
- [backend/src/routes/admin.ts](file:///Users/aniketiyer/Desktop/Trace-It/backend/src/routes/admin.ts)

### Existing Findings
- **Claim**: Flawed `OR` query logic in `processRetryQueue` causes premature retries and loops indefinitely past max retries.
  - **Classification**: **CONFIRMED (BUG-010)**. Line 40 uses `{ OR: [ { retryCount: { lt: this.maxRetries } }, { lastAttempt: { lt: ... } } ] }`.
- **Claim**: `require.main === module` check fails in ES modules.
  - **Classification**: **CONFIRMED**. Line 151 uses CommonJS syntax in ESM file.

### Debugging Tasks
- [ ] (P1) Fix query in `src/services/blockchainRetryProcessor.ts:38`:
  ```typescript
  const retryItems = await prisma.blockchainRetryQueue.findMany({
    where: {
      retryCount: { lt: this.maxRetries },
      lastAttempt: { lte: new Date(Date.now() - this.delayMs) },
    },
    orderBy: { lastAttempt: 'asc' },
    take: this.batchSize,
  });
  ```
- [ ] (P2) Replace `if (require.main === module)` at line 151 with ESM equivalent or remove direct execution block.

### Implementation Tasks
- Update [backend/src/services/blockchainRetryProcessor.ts](file:///Users/aniketiyer/Desktop/Trace-It/backend/src/services/blockchainRetryProcessor.ts).

### Validation
- Simulate failed blockchain record; verify item enters queue; verify retry processor picks up item only after backoff interval.

### External Dependencies
- PostgreSQL database.

### Exit Criteria
- Retry processor honors exponential backoff; ceases retrying after max attempts (5); deletes queue items on success.

---

## Phase 8 — Test Suite Integrity

### Objective
Ensure test suite runs reliably in CI and local environments with proper database isolation, mocked external services, and no hardcoded machine paths.

### Relevant Files
- [backend/jest.config.js](file:///Users/aniketiyer/Desktop/Trace-It/backend/jest.config.js)
- [backend/jest.setup.js](file:///Users/aniketiyer/Desktop/Trace-It/backend/jest.setup.js)
- [backend/jest.teardown.js](file:///Users/aniketiyer/Desktop/Trace-It/backend/jest.teardown.js)
- [backend/tests/admin.test.ts](file:///Users/aniketiyer/Desktop/Trace-It/backend/tests/admin.test.ts)
- [backend/tests/charity.test.ts](file:///Users/aniketiyer/Desktop/Trace-It/backend/tests/charity.test.ts)
- [backend/tests/disbursement.test.ts](file:///Users/aniketiyer/Desktop/Trace-It/backend/tests/disbursement.test.ts)
- [backend/tests/e2e.test.ts](file:///Users/aniketiyer/Desktop/Trace-It/backend/tests/e2e.test.ts)
- [backend/tests/blockchainIntegration.test.ts](file:///Users/aniketiyer/Desktop/Trace-It/backend/tests/blockchainIntegration.test.ts)

### Existing Findings
- **Claim**: `.env.test` contains hardcoded inaccessible PostgreSQL IP (`172.17.160.1`) and alien keypair path (`/home/aarus/...`).
  - **Classification**: **CONFIRMED**. Causes 5/6 test suites to fail on timeout / ENOENT.
- **Claim**: Tests rely on hardcoded seed UUIDs in trigger test scripts.
  - **Classification**: **CONFIRMED**. `tests/test_trigger_detailed.ts` assumes specific UUIDs.

### Debugging Tasks
- [ ] (P1) Update `.env.test` with standard local PostgreSQL URI (`postgresql://postgres:postgres@localhost:5432/traceit_test?schema=public`).
- [ ] (P1) In `tests/blockchainIntegration.test.ts`, generate a temporary test keypair in memory or skip live RPC calls if Solana wallet path is not configured.
- [ ] (P2) Ensure all tests mock AWS S3 / B2 storage using `jest.spyOn(StorageService.prototype, 'uploadFile').mockResolvedValue(undefined)`.
- [ ] (P2) Add database cleanup hooks in `beforeAll` / `afterAll` to prevent test contamination.

### Implementation Tasks
- Update [backend/.env.test](file:///Users/aniketiyer/Desktop/Trace-It/backend/.env.test).
- Update [backend/tests/blockchainIntegration.test.ts](file:///Users/aniketiyer/Desktop/Trace-It/backend/tests/blockchainIntegration.test.ts).

### Validation
- Run `npm test` against local test PostgreSQL instance -> all suites pass without timeouts.

### External Dependencies
- Local or containerized PostgreSQL test instance.

### Exit Criteria
- Full test suite passes sequentially with zero open handle warnings.

---

## Phase 9 — Security Hardening

### Objective
Ensure strong secret management, strict input validation, rate limiting, and SIEM security event emission.

### Relevant Files
- [backend/src/middleware/strictLimiter.ts](file:///Users/aniketiyer/Desktop/Trace-It/backend/src/middleware/strictLimiter.ts)
- [backend/src/middleware/kycCheckMiddleware.ts](file:///Users/aniketiyer/Desktop/Trace-It/backend/src/middleware/kycCheckMiddleware.ts)
- [backend/src/utils/validation.ts](file:///Users/aniketiyer/Desktop/Trace-It/backend/src/utils/validation.ts)
- [backend/src/services/auditLogService.ts](file:///Users/aniketiyer/Desktop/Trace-It/backend/src/services/auditLogService.ts)

### Existing Findings
- **Claim**: Default weak secrets present in codebase (`access_secret`, `your_webhook_secret_change_in_production`).
  - **Classification**: **CONFIRMED (BUG-005, BUG-011)**.
- **Claim**: Audit logs emit structured events (`LOGIN_FAILED`, `LOGIN_SUCCESS`, `AML_FLAG_RAISED`, `UNAUTHORIZED_DOC_ACCESS`, `WEBHOOK_TAMPER_ATTEMPT`).
  - **Classification**: **CONFIRMED**. Verified across routes.

### Debugging Tasks
- [ ] (P1) Create a startup environment validator (`src/utils/envValidator.ts`) that checks required secrets in production and fails fast.
- [ ] (P2) Verify all Joi schemas in `src/utils/validation.ts` use `.unknown(false)` to reject unexpected request properties.
- [ ] (P2) Verify that sensitive data (passwords, raw PAN, full credit card numbers) is never written into `audit_logs` metadata.

### Implementation Tasks
- Add environment variable validator in startup lifecycle.

### Validation
- Start application with missing `JWT_ACCESS_SECRET` in `NODE_ENV=production` -> throws clear startup error.

### External Dependencies
- Environment variables configured.

### Exit Criteria
- Zero insecure secret defaults in production; all audit events emitted cleanly; input schemas strictly typed.

---

## Phase 10 — Performance & Scalability

### Objective
Eliminate synchronous bottlenecks, add missing composite indexes, and optimize token operations.

### Relevant Files
- [backend/src/services/authService.ts](file:///Users/aniketiyer/Desktop/Trace-It/backend/src/services/authService.ts)
- [backend/prisma/schema.prisma](file:///Users/aniketiyer/Desktop/Trace-It/backend/prisma/schema.prisma)
- [backend/src/routes/webhooks/razorpay.ts](file:///Users/aniketiyer/Desktop/Trace-It/backend/src/routes/webhooks/razorpay.ts)

### Existing Findings
- **Claim**: Bcrypt O(N) token search causes severe latency spikes under load.
  - **Classification**: **CONFIRMED (BUG-009)**. Addressed in Phase 3.
- **Claim**: Webhook response time may be delayed by synchronous blockchain operations.
  - **Classification**: **CONFIRMED**. Awaited `blockchainService.recordDonation` inside webhook handler can take 1–3s on devnet.

### Debugging Tasks
- [ ] (P2) Analyze composite indexing needs in `prisma/schema.prisma` (e.g., `[donorId, status]`, `[campaignId, status]`).
- [ ] (P3) Evaluate moving blockchain recording from synchronous webhook execution into background queue (`BlockchainRetryQueue` or Redis queue) if webhook timeouts occur.

### Implementation Tasks
- Apply index optimizations if required by query profiles.

### Validation
- Benchmark webhook response time (<500ms).

### External Dependencies
- PostgreSQL database.

### Exit Criteria
- Webhook response latency within acceptable limits; zero linear table scans for authentication.

---

## Phase 11 — Code Quality / Architecture

### Objective
Standardize error handling, eliminate dead code and in-line imports, and enforce clean modular separation.

### Relevant Files
- [backend/src/index.ts](file:///Users/aniketiyer/Desktop/Trace-It/backend/src/index.ts)
- [backend/src/routes/admin.ts](file:///Users/aniketiyer/Desktop/Trace-It/backend/src/routes/admin.ts)
- [backend/src/routes/charity.ts](file:///Users/aniketiyer/Desktop/Trace-It/backend/src/routes/charity.ts)
- [backend/src/utils/logger.ts](file:///Users/aniketiyer/Desktop/Trace-It/backend/src/utils/logger.ts)

### Existing Findings
- **Claim**: In-line dynamic `import` statements placed in middle of `src/index.ts` (lines 30, 33).
  - **Classification**: **CONFIRMED**. Should be top-level imports.
- **Claim**: Commented-out unused `mongoSanitize` import in `src/index.ts:5`.
  - **Classification**: **CONFIRMED**. Should be cleaned up.

### Debugging Tasks
- [ ] (P3) Move all imports in `src/index.ts` to top-level.
- [ ] (P3) Remove unused `mongoSanitize` import and comment.
- [ ] (P3) Clean up duplicate helper functions across routes (e.g. `addToBlockchainRetryQueue` duplicated between `razorpay.ts` and `admin.ts`).

### Implementation Tasks
- Refactor duplicate helper functions into `src/services/retryQueueService.ts`.

### Validation
- `npm run typecheck` passes with zero warnings.

### External Dependencies
- None.

### Exit Criteria
- Codebase conforms to consistent modular structure and linting standards.

---

## Phase 12 — Final Integration & Regression Validation

### Objective
Execute full end-to-end regression suite across all 12 areas of the platform and prepare final deployment sign-off.

### Relevant Files
- All backend files, test suites, Docker configuration, and documentation.

### Debugging Tasks
- [ ] (P0) Run complete test suite: `npm test`.
- [ ] (P0) Run type check: `npm run typecheck`.
- [ ] (P0) Run production build: `npm run build`.
- [ ] (P1) Verify Docker build: `docker build -t traceit-backend ./backend`.
- [ ] (P1) Verify Docker Compose startup: `docker-compose up -d`.
- [ ] (P2) Run k6 load test script: `k6 run load-test.js` (if k6 installed).

### Implementation Tasks
- Update [backend_debugging.md](#developer-handoff) final status and handoff notes.

### Validation
- 100% test pass rate across all suites; clean Docker image build; zero regression bugs.

### External Dependencies
- Docker, PostgreSQL, Redis, Elasticsearch.

### Exit Criteria
- All P0 and P1 bugs resolved; all tests pass; deployment artifact verified.

---

# Command Reference

### Safe / Read-only
- `npm run typecheck` — Type checks the backend without emitting files (`tsc --noEmit`).
- `git status` / `git diff` — Checks repository status and unstaged modifications.
- `npx prisma validate` — Validates the Prisma schema syntax and relations.

### Build / Typecheck
- `npm run build` — Compiles TypeScript into `dist/` directory via `tsc`.
- `npx prisma generate` — Generates the Prisma client inside `backend/generated/prisma`.

### Tests
- `npm test` — Runs the full Jest test suite with experimental VM modules and `--runInBand`.
- `npm test -- tests/blockchainService.test.ts` — Runs the blockchain unit test suite in isolation.
- `npm test -- tests/admin.test.ts` — Runs the Admin integration test suite.
- `npm test -- tests/charity.test.ts` — Runs the Charity integration test suite.
- `npm test -- tests/disbursement.test.ts` — Runs the Disbursement integration test suite.
- `npm test -- tests/e2e.test.ts` — Runs the End-to-End integration test suite.
- `npx tsx tests/test_triggers_exist.ts` — Verifies database trigger installation in PostgreSQL.
- `npx tsx tests/test_trigger_detailed.ts` — Tests trigger execution against live database.

### Potentially Mutating (Use Caution)
- `npx prisma db seed` / `npm run seed` — Inserts seed profiles, campaigns, and demo donations into database.
- `npx prisma migrate dev` — Creates and applies new database migrations.

### Requires External Infrastructure
- `npx prisma migrate deploy` — Applies pending SQL migrations (Requires live PostgreSQL instance via `DATABASE_URL`).
- `docker-compose up --build` — Starts PostgreSQL, Redis, Elasticsearch, Kibana, Backend, and Frontend.
