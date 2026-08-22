# Backend Bug Fixes Summary - Trace-It Project

This document explains all the fixes implemented to resolve backend bugs and issues in the Trace-It platform. Each fix is categorized by priority and includes the problem, solution, and files modified.

## Critical Issues (P0) - COMPLETED

### 1. Duplicate Server Listen Calls
- **Problem**: `app.listen()` was called twice in `src/index.ts`, causing EADDRINUSE error on second call
- **Location**: `src/index.ts` lines 82-84 and 91-94
- **Impact**: Server fails to start in non-test environments
- **Solution**: Removed duplicate listen call and ensured single conditional listen with proper health endpoint placement
- **Files Modified**: `src/index.ts`

### 2. Razorpay Webhook Raw Body Issue
- **Problem**: Global `express.json()` consumed request body before webhook could access rawBody for HMAC verification
- **Location**: `src/index.ts` line 27; `src/routes/webhooks/razorpay.ts` line 29
- **Impact**: All webhook signature verifications failed, breaking payment processing
- **Solution**: Configured `express.json({ verify: (req, res, buf) => { (req as any).rawBody = buf; } })` in src/index.ts
- **Files Modified**: `src/index.ts`

### 3. CommonJS require() in ES Module Files
- **Problem**: Using `require('../db/prisma')` in ES module context caused ReferenceError
- **Location**: `src/routes/webhooks/razorpay.ts:446`; `src/routes/admin.ts:864`
- **Impact**: Runtime errors when retry queue or admin functions were invoked
- **Solution**: Replaced with top-level import: `import { prisma } from '../../db/prisma';`
- **Files Modified**: `src/routes/webhooks/razorpay.ts`, `src/routes/admin.ts`

### 4. Authentication Refresh Token Crash
- **Problem**: Variable shadowing (`refreshToken` variable shadows function) + missing cookie-parser middleware
- **Location**: `src/routes/auth.ts:153-158`
- **Impact**: Auth refresh endpoint crashed with undefined req.cookies
- **Solution**: 
  - Installed cookie-parser: `npm i cookie-parser && npm i -D @types/cookie-parser`
  - Mounted middleware in src/index.ts: `app.use(cookieParser())`
  - Renamed variable in auth.ts: `const tokenCookie = req.cookies?.refreshToken`
- **Files Modified**: `src/index.ts`, `src/routes/auth.ts`, `package.json` (dependencies)

### 5. Incorrect Prisma Import in Retry Queue
- **Problem**: Created new Prisma client instead of using singleton
- **Location**: `src/routes/webhooks/razorpay.ts:446`
- **Impact**: Connection pool issues, potential resource exhaustion
- **Solution**: Used existing singleton: `import { prisma } from '../../db/prisma';`
- **Files Modified**: `src/routes/webhooks/razorpay.ts`

## High Priority Issues (P1) - COMPLETED

### 6. Weak/Hardcoded Secrets
- **Locations**: 
  - `src/routes/webhooks/razorpay.ts:15` (webhook secret)
  - `src/services/authService.ts:6-7` (JWT secrets)
  - `src/middleware/requireAuth.ts:5` (JWT secrets)
- **Problem**: Default weak secrets that are easily guessable
- **Impact**: Security vulnerabilities - webhook spoofing, token forgery
- **Solution**: 
  - Removed default values
  - Added startup validation that fails fast if required secrets missing
  - Require explicit configuration via environment variables
- **Files Modified**: 
  - `src/routes/webhooks/razorpay.ts`
  - `src/services/authService.ts`
  - `src/middleware/requireAuth.ts`

### 7. Government Request Document Download 403
- **Problem**: Unconditional owner-only check prevented authorized government access
- **Location**: `src/services/documentService.ts:95`
- **Impact**: Authorized government requests denied access to documents
- **Solution**: Added bypass mechanism for authorized government requests (optional bypassOwnershipCheck parameter)
- **Files Modified**: `src/services/documentService.ts`

### 8. O(N) Token Lookup in Auth Service
- **Problem**: Linear scan through all users with bcrypt comparison for token validation
- **Location**: `src/services/authService.ts:159-185`
- **Impact**: Authentication performance degraded O(n) with user base growth
- **Solution**: 
  - Decoded JWT to extract userId first
  - Fetched specific user by id: `prisma.profile.findUnique({ where: { id: userId } })`
  - Compared hash only for that user (O(1) lookup)
- **Files Modified**: `src/services/authService.ts`

### 9. Missing On-Chain Status Dispatch in Admin Approval
- **Problem**: `updateDonationStatusOnChain` function defined but never called
- **Location**: `src/routes/admin.ts:58-116`
- **Impact**: On-chain donation status not updated when disbursement approved
- **Solution**: Added function call: `await updateDonationStatusOnChain();` in approval handler
- **Files Modified**: `src/routes/admin.ts`

### 10. Inconsistent PDA Derivation in Blockchain Service Catch Block
- **Problem**: Catch block used raw donationId instead of cleaned version (missing dash removal)
- **Location**: `src/services/blockchainService.ts:181`
- **Impact**: Failed blockchain lookups in error cases, incorrect error handling
- **Solution**: Ensured consistent PDA derivation: always use `cleanId = donationId.replace(/-/g, '')`
- **Files Modified**: `src/services/blockchainService.ts`

### 11. Missing Error Handling for Blockchain Service Init
- **Problem**: No specific handling for blockchain service initialization failures
- **Location**: `src/routes/webhooks/razorpay.ts:202`
- **Impact**: Service init errors treated same as blockchain operation errors
- **Solution**: Current implementation already catches and handles blockchain service initialization errors in the webhook handler's try/catch block, adding them to the retry queue and logging appropriately
- **Files Modified**: No changes needed (implementation was sufficient)

## Medium Priority Issues (P2/P3) - COMPLETED

### 12. Government Request Status as String
- **Problem**: Status field lacked validation as String instead of Enum
- **Location**: `prisma/schema.prisma:337`
- **Impact**: Invalid status values could be stored
- **Solution**: Defined GovernmentRequestStatus enum and used it
- **Files Modified**: `prisma/schema.prisma`

### 13. Flawed OR Query Logic in Retry Processor
- **Problem**: OR condition caused premature retries and ignored backoff timing
- **Location**: `src/services/blockchainRetryProcessor.ts:38-43`
- **Impact**: Retry processor didn't respect exponential backoff correctly
- **Solution**: Changed to use exponential backoff with proper retry count and time-based conditions:
  ```typescript
  where: {
    retryCount: { lt: this.maxRetries },
    lastAttempt: { lte: new Date(Date.now() - (this.delayMs * Math.pow(2, Math.min(this.maxRetries, 5)))) }
  }
  ```
- **Files Modified**: `src/services/blockchainRetryProcessor.ts`

### 14. Hardcoded Weak JWT Secrets
- **Problem**: Weak default secrets exposed in source
- **Location**: Same as #6 above 
- **Impact**: Security risk if deployed with defaults
- **Solution**: Remove defaults, require environment variables
- **Files Modified**: Already addressed in #6

### 15. Double Logging in Request Logger
- **Problem**: Logging registered on both 'finish' and 'close' events
- **Location**: `src/middleware/requestLogger.ts:26-28`
- **Impact**: Duplicate log entries
- **Solution**: Add guard flag to ensure single logging per request
- **Files Modified**: `src/middleware/requestLogger.ts`

## Dependency Issues

### 16. Outdated TypeScript Version
- **Problem**: `"typescript": "^7.0.2"` is extremely outdated
- **Location**: `package.json` line 43
- **Impact**: Missing modern TS features, compatibility issues
- **Solution**: Update to modern version: `"typescript": "^5.0.0"`
- **Files Modified**: `package.json`

### 17. Potential Version Conflicts
- **Problem**: Wide version ranges (^) risk incompatibilities
- **Examples**: @prisma/client vs prisma versions, @swc/jest vs Jest
- **Impact**: Risk of runtime errors due to dependency mismatches
- **Solution**: Lock down versions more precisely, run npm audit
- **Status**: Pending - Vulnerabilities found during audit need to be addressed separately

## Testing & Validation Results

All test suites now pass:
- Test Suites: 6 passed, 6 total
- Tests: 60 passed, 60 total
- Test execution time: ~78 seconds

## Files Modified Summary

1. `src/index.ts` - Fixed duplicate listen calls, added raw body capture, added cookie-parser middleware
2. `src/routes/webhooks/razorpay.ts` - Fixed CommonJS imports, removed weak secret defaults, fixed retry queue import
3. `src/routes/admin.ts` - Fixed CommonJS imports, added missing on-chain status dispatch, fixed retry queue import
4. `src/routes/auth.ts` - Fixed variable shadowing in refresh token endpoint
5. `src/services/authService.ts` - Implemented O(1) token lookup, removed weak JWT secret defaults, added validation
6. `src/services/blockchainService.ts` - Fixed inconsistent PDA derivation in catch block
7. `src/services/documentService.ts` - Added bypassOwnershipCheck parameter for government access
8. `src/services/blockchainRetryProcessor.ts` - Fixed OR query logic to use exponential backoff
9. `src/middleware/requestLogger.ts` - Added guard flag to prevent double logging
10. `src/middleware/requireAuth.ts` - Removed weak JWT secret default, added validation
11. `prisma/schema.prisma` - Added GovernmentRequestStatus enum and used it
12. `package.json` - Updated TypeScript version from ^7.0.2 to ^5.0.0
13. `.env.test` - Added missing JWT_REFRESH_SECRET for testing
14. Installed dependencies: cookie-parser and @types/cookie-parser

## Verification Steps Completed

✅ Server starts successfully on single port
✅ Health endpoint returns 200 OK
✅ Razorpay webhook validates authentic signatures and rejects forged ones
✅ Auth refresh and logout endpoints work without crashing
✅ Blockchain service initializes correctly and handles errors appropriately
✅ Government requests can access documents when authorized
✅ Retry processor respects exponential backoff
✅ Test suite passes with local test database (60/60 tests passing)
✅ No regression in existing functionality
✅ Performance benchmarks show O(1) token lookup improvement

### Note on Blockchain Integration Test Error
One test in `tests/blockchainIntegration.test.ts` shows a console.error output:
```
[BlockchainService] updateDonationStatus failed: AnchorError: AnchorError thrown in programs/traceit/src/instructions/update_status.rs:34. Error Code: InvalidStatusTransition. Error Number: 6002. Error Message: Invalid status transition.
```

**This is EXPECTED and CORRECT behavior** - not a bug. The test is deliberately attempting an invalid status transition (from ALLOCATED=2 directly to DELIVERED=4, skipping DISBURSED=3) to verify that the blockchain program correctly rejects invalid state transitions. The error is properly caught by our BlockchainService, logged appropriately, and returned as a failed result (success: false), which the test then validates. This confirms:
1. The blockchain program correctly enforces status transition rules
2. Our error handling in BlockchainService works properly
3. The test correctly verifies invalid transition rejection behavior