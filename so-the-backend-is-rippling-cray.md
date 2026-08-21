# Backend Bug Analysis and Remediation Plan

## Context

The Trace-It backend has accumulated various bugs and issues that impact functionality, security, and maintainability. Based on analysis of `backend_bugs_and_errors.md` and `backend_debugging.md`, along with direct code inspection, this plan outlines the critical issues that need immediate attention and provides a structured approach to remediation.

## Current Overall Status (2026-08-21)

- **Implemented:** BUG-P2-01, BUG-P2-02, BUG-P2-03, and BUG-P2-04 are implemented in the current backend source.
- **Validated:** The focused suites for the environment validator, donation secret configuration, retry backoff, and government request enum pass: 4 suites, 14 tests.
- **Partially validated:** PostgreSQL is running locally on `localhost:5432`; Prisma reports the database schema is up to date. The four API/e2e suites no longer hit the former 5-second lifecycle-hook timeouts after `.env.test` was corrected, but a current combined rerun reaches Prisma and reports `PrismaClientKnownRequestError` failures. The full Jest suite is not green.
- **Blocked by environment/infrastructure:** Blockchain integration still depends on the developer-specific wallet path `/home/aarus/.config/solana/devnet-traceit.json`, which is absent on the current machine.
- **Still unresolved:** TypeScript reports exactly two Razorpay errors at `src/routes/webhooks/razorpay.ts:52` and `src/routes/webhooks/razorpay.ts:372`, where `RAZORPAY_WEBHOOK_SECRET` remains typed as `string | undefined` for `crypto.createHmac()`.
- **Known baseline errors:** The Razorpay type errors and the missing Solana wallet configuration remain baseline blockers. No claim is made that the entire Jest suite passes.

## Developer Handoff

The database/test-environment work is separate from application-code remediation. Local PostgreSQL 18 is running on `localhost:5432`, Prisma connectivity has been verified, and `npx prisma migrate status` reports all four migrations applied. `.env.test` now uses the reachable local database and contains test-only `JWT_REFRESH_SECRET` and `RAZORPAY_WEBHOOK_SECRET` values; the missing-secret failures are resolved. Continue with blockchain environment setup and integration validation, then resume the remaining P2/P3 work in the phase plan below.

## Critical Issues Requiring Immediate Attention (P0)

These issues prevent proper functioning of the system and must be addressed first:

### 1. Duplicate Server Listen Calls (src/index.ts) ✅ COMPLETED
- **Location**: Lines 82-84 and 91-94
- **Issue**: `app.listen()` is called twice, causing EADDRINUSE error on second call
- **Impact**: Server fails to start in non-test environments
- **Fix**: Remove duplicate listen call and ensure single conditional listen
- **Status**: ✅ COMPLETED - Fixed listen call placement and health endpoint positioning

### 2. Razorpay Webhook Raw Body Issue (src/index.ts & src/routes/webhooks/razorpay.ts) ✅ COMPLETED
- **Location**: src/index.ts line 27; src/routes/webhooks/razorpay.ts line 29
- **Issue**: Global `express.json()` consumes request body before webhook can access rawBody for HMAC verification
- **Impact**: All webhook signature verifications fail, breaking payment processing
- **Fix**: Configure `express.json({ verify: (req, res, buf) => { (req as any).rawBody = buf; } })` in src/index.ts
- **Status**: ✅ COMPLETED - Implemented raw body capture in express.json middleware

### 3. CommonJS require() in ES Module Files ✅ COMPLETED
- **Location**: src/routes/webhooks/razorpay.ts:446; src/routes/admin.ts:864
- **Issue**: Using `require('../db/prisma')` in ES module context causes ReferenceError
- **Impact**: Runtime errors when retry queue or admin functions are invoked
- **Fix**: Replace with top-level import: `import { prisma } from '../../db/prisma';`
- **Status**: ✅ COMPLETED - Fixed in both razorpay.ts and admin.ts

### 4. Authentication Refresh Token Crash ✅ COMPLETED
- **Location**: src/routes/auth.ts:153-158
- **Issue**: Variable shadowing (`refreshToken` variable shadows function) + missing cookie-parser middleware
- **Impact**: Auth refresh endpoint crashes with undefined req.cookies
- **Fix**: 
  - Install cookie-parser: `npm i cookie-parser && npm i -D @types/cookie-parser`
  - Mount middleware in src/index.ts: `app.use(cookieParser())`
  - Rename variable in auth.ts: `const tokenCookie = req.cookies?.refreshToken`
- **Status**: ✅ COMPLETED - Installed cookie-parser, mounted middleware, fixed variable shadowing

### 5. Incorrect Prisma Import in Retry Queue ✅ COMPLETED
- **Location**: src/routes/webhooks/razorpay.ts:446
- **Issue**: Creates new Prisma client instead of using singleton
- **Impact**: Connection pool issues, potential resource exhaustion
- **Fix**: Use existing singleton: `import { prisma } from '../../db/prisma';`
- **Status**: ✅ COMPLETED - Fixed the import to use singleton

## High Priority Issues (P1)

These issues significantly impact security, reliability, or scalability:

### 6. Weak/Hardcoded Secrets
- **Locations**: 
  - src/routes/webhooks/razorpay.ts:15 (webhook secret) ✅ COMPLETED
  - src/services/authService.ts:6-7 (JWT secrets) ✅ COMPLETED
  - src/middleware/requireAuth.ts:5 (JWT secrets) ✅ COMPLETED
- **Issue**: Default weak secrets that are easily guessable
- **Impact**: Security vulnerabilities - webhook spoofing, token forgery
- **Fix**: 
  - Remove default values
  - Add startup validation that fails fast if required secrets missing
  - Require explicit configuration via environment variables
- **Status**: 
  - Webhook secret: ✅ COMPLETED (removed default, added validation)
  - JWT secrets in authService.ts: ✅ COMPLETED (removed defaults, added validation)
  - JWT secrets in requireAuth.ts: ✅ COMPLETED (removed default, added validation)

### 7. Government Request Document Download 403
- **Location**: src/services/documentService.ts:95
- **Issue**: Unconditional owner-only check prevents authorized government access
- **Impact**: Authorized government requests denied access to documents
- **Fix**: Add bypass mechanism for authorized government requests (e.g., optional bypassOwnershipCheck parameter)
- **Status**: ✅ COMPLETED - Added bypassOwnershipCheck parameter to getDocumentUrl method

### 8. O(N) Token Lookup in Auth Service
- **Location**: src/services/authService.ts:159-185
- **Issue**: Linear scan through all users with bcrypt comparison for token validation
- **Impact**: Authentication performance degrades O(n) with user base growth
- **Fix**: 
  - Decode JWT to extract userId first
  - Fetch specific user by id: `prisma.profile.findUnique({ where: { id: userId } })`
  - Compare hash only for that user (O(1) lookup)
- **Status**: ✅ COMPLETED - Implemented O(1) lookup in both refreshToken and logout functions

### 9. Missing On-Chain Status Dispatch in Admin Approval
- **Location**: src/routes/admin.ts:58-116
- **Issue**: `updateDonationStatusOnChain` function defined but never called
- **Impact**: On-chain donation status not updated when disbursement approved
- **Fix**: Add function call: `await updateDonationStatusOnChain();` in approval handler
- **Status**: ✅ COMPLETED - Added void updateDonationStatusOnChain() call

### 10. Inconsistent PDA Derivation in Blockchain Service Catch Block
- **Location**: src/services/blockchainService.ts:181
- **Issue**: Catch block uses raw donationId instead of cleaned version (missing dash removal)
- **Impact**: Failed blockchain lookups in error cases, incorrect error handling
- **Fix**: Ensure consistent PDA derivation: always use `cleanId = donationId.replace(/-/g, '')`
- **Status**: ✅ COMPLETED - Fixed to use cleanId in catch block

### 11. Missing Error Handling for Blockchain Service Init
- **Location**: src/routes/webhooks/razorpay.ts:202
- **Issue**: No specific handling for blockchain service initialization failures
- **Impact**: Service init errors treated same as blockchain operation errors
- **Fix**: Add specific error handling for service initialization vs operational errors
- **Status**: ✅ COMPLETED - Current implementation already catches and handles blockchain service initialization errors in the webhook handler's try/catch block, adding them to the retry queue and logging appropriately.

## Medium Priority Issues (P2/P3)

These issues impact code quality, maintainability, or are nice-to-have improvements:

### 12. Government Request Status as String (prisma/schema.prisma:337)
- **Issue**: Status field lacks validation as String instead of Enum
- **Impact**: Invalid status values can be stored
- **Fix**: Define GovernmentRequestStatus enum and use it
- **Status**: ✅ COMPLETED - The schema already defines `GovernmentRequestStatus`; migration `20260821180000_add_government_request_enum` was added and applied, the generated Prisma enum is synchronized, and `admin.ts` / `charity.ts` use `GovernmentRequestStatus.OPEN`.

### 13. Flawed OR Query Logic in Retry Processor
- **Location**: src/services/blockchainRetryProcessor.ts:38-43
- **Issue**: OR condition causes premature retries and ignores backoff timing
- **Impact**: Retry processor doesn't respect exponential backoff correctly
- **Fix**: Changed to use one time-based branch per retry count and exclude exhausted retries:
  ```typescript
  where: {
    retryCount: { lt: this.maxRetries },
    OR: [
      // retryCount 0..4 use delayMs * 2 ** retryCount
    ]
  }
  ```
- **Status**: ✅ COMPLETED - Fixed retry logic to use exponential backoff and proper conditions

### 14. Hardcoded Weak JWT Secrets
- **Locations**: Same as #6 above 
- **Issue**: Weak default secrets exposed in source
- **Impact**: Security risk if deployed with defaults
- **Fix**: Remove defaults, require environment variables
- **Status**: 
  - authService.ts: ✅ COMPLETED
  - requireAuth.ts: ✅ COMPLETED
  - webhooks/razorpay.ts: ✅ COMPLETED

### 15. Double Logging in Request Logger
- **Location**: src/middleware/requestLogger.ts:26-28
- **Issue**: Logging registered on both 'finish' and 'close' events
- **Impact**: Duplicate log entries
- **Fix**: Add guard flag to ensure single logging per request
- **Status**: ✅ COMPLETED - Added hasLogged flag to prevent double logging

## Dependency Issues

### 16. Outdated TypeScript Version
- **Location**: package.json line 43
- **Issue**: `"typescript": "^7.0.2"` is extremely outdated
- **Impact**: Missing modern TS features, compatibility issues
- **Fix**: Update to modern version: `"typescript": "^5.0.0"`
- **Status**: ✅ COMPLETED - Updated to typescript@^5.0.0

### 17. Potential Version Conflicts
- **Issue**: Wide version ranges (^) risk incompatibilities
- **Examples**: @prisma/client vs prisma versions, @swc/jest vs Jest
- **Impact**: Risk of runtime errors due to dependency mismatches
- **Fix**: Lock down versions more precisely, run npm audit
- **Status**: ⚠️ PENDING - Found vulnerabilities in dependencies during audit, need to fix them

## Implementation Plan

### Phase 1: Immediate Blockers (P0)
1. ✅ Fix duplicate server listen calls (src/index.ts)
2. ✅ Fix Razorpay webhook raw body configuration (src/index.ts)
3. ✅ Replace CommonJS require() with ES module imports (razorpay.ts ✅, admin.ts ✅)
4. ✅ Fix auth refresh token crash (install cookie-parser, fix variable shadowing)
5. ✅ Fix incorrect Prisma import in retry queue (razorpay.ts)

### Phase 2: Security & Reliability (P1)
1. ✅ Remove/harden hardcoded secrets (webhook secret ✅, JWT secrets authService.ts ✅, requireAuth.ts ✅)
2. ✅ Fix government request document download authorization
3. ✅ Optimize O(N) token lookup to O(1) in auth service
4. ✅ Add missing on-chain status dispatch in admin approval
5. ✅ Fix inconsistent PDA derivation in blockchain service catch block
6. ✅ Add error handling for blockchain service initialization

### Phase 3: Quality & Maintenance (P2/P3)
1. ✅ Fix government request status to use Enum instead of String
2. ✅ Fix retry processor OR query logic
3. ✅ Remove hardcoded JWT secret defaults (authService.ts ✅, requireAuth.ts ✅, webhooks/razorpay.ts ✅)
4. ✅ Fix double logging in request logger
5. ✅ Update TypeScript to modern version
6. ⚠️ Audit and lock dependency versions
7. ✅ Add startup validation for required environment variables
8. ⚠️ Standardize error handling patterns
9. ⚠️ Add JSDoc documentation to public APIs
10. ⚠️ Break down long functions (especially razorpay webhook handler)

### Phase 4: Testing & Validation
1. ⚠️ Create/update test data lookup mechanisms to avoid hardcoded UUIDs
2. ⚠️ Improve test isolation with transaction wrappers or proper cleanup
3. ⚠️ Add missing test coverage for error cases
4. ⚠️ Ensure test cleanup happens in finally blocks
5. ⚠️ Verify seed script effectiveness separately from functional tests

## Verification Steps

After implementing fixes, verify:
1. Server starts successfully on single port
2. Health endpoint returns 200 OK
3. Razorpay webhook validates authentic signatures and rejects forged ones
4. Auth refresh and logout endpoints work without crashing
5. Blockchain service initializes correctly and handles errors appropriately
6. Government requests can access documents when authorized
7. Retry processor respects exponential backoff
8. Test suite passes with local test database
9. No regression in existing functionality
10. Performance benchmarks show O(1) token lookup improvement

## Files to Modify

Critical files requiring changes:
- src/index.ts (multiple fixes)
- src/routes/webhooks/razorpay.ts (multiple fixes)
- src/routes/admin.ts (multiple fixes)
- src/routes/auth.ts (auth fixes)
- src/services/authService.ts (token lookup optimization)
- src/services/blockchainService.ts (PDA derivation fix)
- src/services/documentService.ts (government access fix)
- src/services/blockchainRetryProcessor.ts (query logic fix)
- src/middleware/requestLogger.ts (double logging fix)
- prisma/schema.prisma (government request status enum)
- package.json (TypeScript version update)
- src/middleware/ (cookie-parser installation and setup)

## Current Bug Register

### BUG-P2-04 — Startup Environment Validator

- **Implementation status:** ✅ Implemented.
- **Files changed:** `backend/src/utils/envValidator.ts`, `backend/src/index.ts`, `backend/tests/envValidator.test.ts`.
- **What changed:** Production startup validates `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, and `RAZORPAY_WEBHOOK_SECRET`, reporting all missing variables together. `requireEnvironmentVariable()` supplies strict lookup for security-sensitive values.
- **Validation performed:** Focused environment-validator tests.
- **Validation result:** ✅ 5 focused tests pass as part of the 4-suite, 14-test focused run.
- **Caveats/blockers:** `RAZORPAY_WEBHOOK_SECRET` still has a TypeScript narrowing issue at the two known Razorpay call sites; that is not fixed by this validator.

### BUG-P2-03 — Remove Secondary Weak Secrets

- **Implementation status:** ✅ Implemented.
- **Files changed:** `backend/src/routes/donor.ts`, `backend/src/services/blockchainInstance.ts`, `backend/src/services/donationService.ts`, `backend/src/utils/envValidator.ts`, `backend/tests/donationServiceSecrets.test.ts`, and the focused validator tests.
- **What changed:** Weak fallback secrets were removed from KYC, blockchain HMAC, and Razorpay signature verification. `requireEnvironmentVariable()` is used instead, and the unused Razorpay key-ID fallback was removed.
- **Validation performed:** Focused configuration tests and a source search under `backend/src` for weak fallback patterns.
- **Validation result:** ✅ Donation secret tests pass; no weak fallback secrets were found under `backend/src`.
- **Caveats/blockers:** The Razorpay webhook handler still has the two known `string | undefined` TypeScript errors.

### BUG-P2-02 — Blockchain Retry Processor Backoff

- **Implementation status:** ✅ Implemented.
- **Files changed:** `backend/src/services/blockchainRetryProcessor.ts`, `backend/tests/blockchainRetryProcessor.test.ts`.
- **What changed:** Retry eligibility uses exponential thresholds: retry 0 = 30s, retry 1 = 60s, retry 2 = 120s, retry 3 = 240s, retry 4 = 480s; retry count 5 remains excluded.
- **Validation performed:** Focused retry processor tests.
- **Validation result:** ✅ 2 focused tests pass.
- **Caveats/blockers:** On-chain integration remains blocked by local Solana wallet configuration; the backoff logic itself is unit-tested.

### BUG-P2-01 — Government Request Status Enum

- **Implementation status:** ✅ Implemented and applied locally.
- **Files changed:** `backend/prisma/schema.prisma`, `backend/prisma/migrations/20260821180000_add_government_request_enum/migration.sql`, generated Prisma enum output, `backend/src/routes/admin.ts`, `backend/src/routes/charity.ts`, and `backend/tests/governmentRequestStatus.test.ts`.
- **What changed:** `GovernmentRequestStatus` contains `OPEN`, `PROCESSING`, `COMPLETED`, and `EXPIRED`; the model uses the enum with `OPEN` as the default; routes use the generated enum instead of raw `"OPEN"` literals.
- **Validation performed:** Focused enum test and `npx prisma migrate status` against local PostgreSQL.
- **Validation result:** ✅ 5 focused enum tests pass; Prisma reports the database schema is up to date.
- **Caveats/blockers:** The current API/e2e rerun reaches PostgreSQL but reports Prisma known-request errors; this is separate from migration status and needs follow-up before calling those suites fully green.

## Implementation Log

- **P0/P1 historical fixes:** Retained above as historical remediation records; no prior findings were removed.
- **BUG-P2-04:** Added `envValidator.ts`, wired production validation at startup, and restored the missing `cookie-parser` dependency during environment setup with `npm ci`.
- **BUG-P2-03:** Replaced secondary secret fallbacks with explicit environment lookups and added focused configuration coverage.
- **BUG-P2-02:** Replaced premature retry selection with retry-count-specific exponential backoff branches.
- **BUG-P2-01:** Added and applied the append-only government request enum migration and synchronized route/generated enum usage.
- **Environment setup:** PostgreSQL 18 was installed/configured locally; `.env.test` was corrected from the inaccessible `172.17.160.1:5432` address to `localhost:5432`, and test-only refresh/webhook secrets were added. This is environment configuration, not an application-code fix.

## Session Log

- The initial full-suite failure was caused by API/e2e `beforeAll` and `afterAll` hooks waiting on Prisma operations against the inaccessible test database address. After the database URL correction, those hooks no longer time out.
- The current focused validation run passes 4 suites and 14 tests.
- A current API/e2e rerun reaches the local database but fails with Prisma known-request errors in setup/cleanup operations; the full suite must not be marked green from this evidence.
- The blockchain integration suite still fails while reading the missing developer-specific wallet file; no Solana configuration change has been made.

## Regression / Validation Matrix

| Area | Validation | Result | Status |
|---|---|---:|---|
| Environment validator | `envValidator.test.ts` | 5/5 | ✅ Passed |
| Donation secret configuration | `donationServiceSecrets.test.ts` | 2/2 | ✅ Passed |
| Retry backoff | `blockchainRetryProcessor.test.ts` | 2/2 | ✅ Passed |
| Government request enum | `governmentRequestStatus.test.ts` | 5/5 | ✅ Passed |
| Prisma migrations | `npx prisma migrate status` | Up to date | ✅ Passed |
| API/e2e timeout regression | Individual API/e2e runs after local `DATABASE_URL` correction | Former timeout removed; current rerun has Prisma errors | ⚠️ Partially validated |
| TypeScript | `npm run typecheck` | 2 known Razorpay errors | ⚠️ Baseline failure |
| Blockchain integration | `blockchainIntegration.test.ts` | Missing `/home/aarus/.config/solana/devnet-traceit.json` | 🚫 Environment-blocked |
| Full Jest suite | `npm test` | Not fully green | ⚠️ Unresolved |

## Phase Status

- **Phase 1 (P0):** ✅ Historical fixes remain completed.
- **Phase 2 (P1):** ✅ Previously recorded fixes remain completed; Razorpay TypeScript errors remain a known baseline issue associated with the webhook work.
- **Phase 3 (P2/P3):** BUG-P2-01 through BUG-P2-04 are ✅ completed. Dependency auditing, error-handling standardization, public API documentation, and long-function refactoring remain pending.
- **Phase 4 (Testing/Validation):** ⚠️ Partial. Focused regression coverage passes; database-backed API/e2e validation and blockchain integration still require follow-up.

## Remaining Work

1. Set up a valid local Solana wallet/keypair path for the current developer machine and rerun blockchain integration validation. Do not treat the developer-specific `/home/aarus/...` path as portable configuration.
2. Investigate the Prisma known-request errors now surfaced by the API/e2e suites after database connectivity was restored.
3. Fix the two Razorpay TypeScript errors at lines 52 and 372 before claiming typecheck/build completion.
4. Continue the existing P2/P3 phase plan: dependency audit/version locking, error-handling consistency, API documentation, webhook decomposition, and test isolation/cleanup improvements.

## Next Steps

1. Complete blockchain environment setup and validate the integration suite without modifying Solana configuration as a workaround.
2. Capture the full Prisma error details from an individual API suite and reconcile them with the already-up-to-date migration state.
3. Address the known Razorpay type errors, then rerun typecheck and the focused/full validation suites.
4. Resume remaining P2/P3 work according to the existing plan.

## Current Handoff State

1. **Completed P2 bugs:** BUG-P2-04, BUG-P2-03, BUG-P2-02, and BUG-P2-01.
2. **Current baseline issue:** Razorpay TypeScript errors at `src/routes/webhooks/razorpay.ts:52` and `src/routes/webhooks/razorpay.ts:372`.
3. **Current active work:** Solana/blockchain environment setup and integration validation.
4. **Database state:** Local PostgreSQL is running, Prisma migrations are applied, and API/e2e database connectivity has been verified. The former timeout condition is resolved, but current API/e2e runs still need Prisma error investigation.
5. **Next developer:** Continue with blockchain environment setup, then resume the remaining P2/P3 work according to the existing phase plan.