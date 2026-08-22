
# Backend Fixes & Test Environment Documentation

## Overview

This document records the backend changes made during the latest debugging and security implementation work on Trace-It.

The primary goals were:

- Resolve backend runtime and test-environment issues.
- Improve authentication and authorization handling.
- Strengthen security-related middleware and request handling.
- Improve audit logging and security event tracking.
- Improve blockchain integration and retry handling.
- Fix environment validation for sensitive configuration.
- Resolve Prisma/Jest compatibility issues.
- Ensure the complete backend test suite passes successfully.

Final verification:

```text
Test Suites: 10 passed, 10 total
Tests:       74 passed, 74 total
Snapshots:   0 total
````

---

# 1. Jest Configuration

## Problem

The backend test environment had issues resolving TypeScript modules that use `.js` extensions in their import statements.

The project uses TypeScript source files with ESM-style imports such as:

```ts
import { BlockchainService } from '../src/services/blockchainService.js';
```

Jest therefore needed to correctly map the `.js` import to the corresponding TypeScript source during testing.

## Fix

The Jest configuration was updated to use SWC for TypeScript transformation and to map relative `.js` imports:

```js
transform: {
  "^.+\\.(t|j)sx?$": "@swc/jest",
  "^.+\\.mjs$": "@swc/jest",
},

moduleNameMapper: {
  "^(\\.{1,2}/.*)\\.js$": "$1",
},
```

This allows the test environment to correctly resolve the project's TypeScript modules.

---

# 2. Prisma and Jest Teardown

## Problem

Jest initially reported an error during global teardown:

```text
Cannot find module '../../generated/prisma/client.js'
```

The problem occurred because the Jest teardown process imported the application's Prisma module:

```ts
const { prisma } = await import("./src/db/prisma.ts");
```

The Prisma client was generated in the build output, but the Jest runtime was resolving the source module and looking for the generated client at a different location.

## Fix

The unnecessary Jest `globalTeardown` dependency on Prisma was removed.

This prevents the test runner from loading the application's Prisma database layer merely to shut down the test process.

The distinction is important because:

```text
Jest
  ↓
SWC + TypeScript source

Production build
  ↓
TypeScript compilation
  ↓
dist/
```

do not necessarily have identical module paths at runtime.

---

# 3. Environment Validation

## Problem

Sensitive environment variables were not consistently validated according to the application's execution environment.

Production requires secrets and security-sensitive configuration that should not necessarily be required during development or testing.

## Fix

Environment validation was strengthened so that:

* Production fails fast when required secrets are missing.
* Production accepts a complete valid configuration.
* Non-production environments do not unnecessarily require production secrets.
* Security-sensitive environment variables are validated when required.
* Configured security-sensitive values can be retrieved correctly.

## Verification

The environment validator tests verify these behaviours independently.

Result:

```text
validateEnvironment
✓ fails fast in production when required secrets are missing
✓ accepts production configuration with all required secrets
✓ does not require production secrets outside production
✓ rejects a missing security-sensitive environment value
✓ returns a configured security-sensitive environment value
```

---

# 4. Authentication Middleware

## Changes

Authentication-related middleware was updated to improve the consistency of authenticated request handling.

The changes ensure that authenticated user information is correctly propagated through the Express request lifecycle.

This provides downstream routes and services with a reliable representation of the authenticated user.

---

# 5. Role-Based Authorization

## Changes

Role-based authorization handling was updated to make access control more consistent across protected routes.

The backend distinguishes between authentication and authorization:

```text
Authentication
    ↓
Who is the user?

Authorization
    ↓
Is this user allowed to perform this action?
```

The role middleware therefore operates after authentication and prevents users from accessing endpoints outside their permitted role.

---

# 6. KYC Enforcement

## Changes

KYC-related middleware was updated to enforce KYC requirements consistently for operations where verified identity is required.

This prevents protected functionality from being accessed without satisfying the application's KYC requirements.

The middleware is kept separate from authentication so that:

```text
Authenticated user
        ↓
KYC validation
        ↓
Authorized operation
```

can be enforced independently.

---

# 7. Request Logging

## Changes

The request logging middleware was updated to improve backend observability.

The purpose is to provide useful information about incoming requests without unnecessarily exposing sensitive information.

Request logging is particularly important for:

* Debugging
* Security monitoring
* Incident investigation
* Operational troubleshooting

Sensitive authentication information should not be logged.

---

# 8. Audit Logging

## Changes

The audit log service was updated to improve tracking of security-sensitive and important backend operations.

Audit logging provides a persistent record of relevant actions and helps establish:

```text
Who
  ↓
Performed what action
  ↓
At what time
  ↓
Against which resource
```

This is important for both security monitoring and accountability.

---

# 9. Authentication Service

## Changes

The authentication service was updated to improve handling of authentication-related operations and security-sensitive configuration.

The changes also integrate with the strengthened environment validation.

The goal is to ensure that authentication functionality does not silently operate with missing or invalid security configuration.

---

# 10. Blockchain Service

## Changes

The blockchain service was updated to improve its integration with the Solana/Anchor backend layer.

The service handles:

* Donation recording
* Donation PDA derivation
* Donation retrieval
* Integrity verification
* Donation status updates
* Blockchain transaction errors

The service also keeps donor identifiers private by hashing/HMAC-protecting donor information before it is written on-chain.

---

# 11. Blockchain Retry Processing

## Problem

Blockchain transactions can fail temporarily due to network conditions, RPC availability, transaction processing, or other transient problems.

Retry processing therefore needs to distinguish between:

```text
Retryable
```

and:

```text
Exhausted / not eligible for retry
```

conditions.

## Fix

The retry eligibility logic was updated so that a retry requires both:

1. An available retry count.
2. The corresponding backoff interval having elapsed.

The system also avoids creating a retry path when the retry count has already been exhausted.

## Verification

The retry processor tests verify:

```text
✓ requires both an available retry count and that retry count's backoff interval
✓ does not create an eligibility branch for exhausted retry counts
```

---

# 12. Donation Service

## Changes

The donation service was updated to improve integration with:

* Authentication
* Blockchain recording
* Security-sensitive configuration
* Donation lifecycle handling

The service coordinates the off-chain donation record with the corresponding blockchain record.

This helps maintain consistency between the PostgreSQL database and the blockchain layer.

---

# 13. Razorpay Webhook Handling

## Changes

The Razorpay webhook route was updated as part of the backend security and reliability improvements.

Webhook processing is security-sensitive because payment state should not be changed solely based on an untrusted request.

The route therefore works together with the application's verification and donation-processing logic before accepting payment-related state changes.

---

# 14. Receipt and Email Services

## Changes

The receipt and email services were updated to improve their integration with the rest of the backend.

These services are responsible for post-donation communication and receipt generation.

The changes ensure that these operations work correctly with the updated donation and authentication flows.

---

# 15. Status Service

## Changes

The status service was updated to provide more consistent handling of donation lifecycle states.

The backend and blockchain use a defined donation lifecycle, including states such as:

```text
INITIATED
    ↓
SUCCESS
    ↓
ALLOCATED
    ↓
DISBURSED
    ↓
DELIVERED
```

Status handling must remain consistent between the database and blockchain layers.

---

# 16. Admin, Donor, Charity and Public Routes

The following route groups were updated as part of the backend fixes:

```text
/routes/admin
/routes/auth
/routes/charity
/routes/donor
/routes/public
/routes/webhooks/razorpay
```

The changes primarily ensure that the routes correctly use the updated:

* Authentication middleware
* Role authorization
* KYC checks
* Service-layer logic
* Error handling
* Security configuration

This keeps security enforcement centralized in middleware rather than duplicating authorization logic inside individual route handlers.

---

# 17. Express Type Definitions

## Changes

The project's Express request type definitions were updated so that custom request properties used by authentication and authorization middleware are correctly recognized by TypeScript.

This prevents type errors when middleware attaches application-specific information to:

```ts
req.user
```

or other custom request properties.

---

# 18. Prisma Schema

The Prisma schema was updated to support the latest backend functionality.

The corresponding database migration was also added where required.

Schema changes were made alongside the application logic so that the database model remains consistent with the services and routes using it.

---

# 19. Blockchain Reconciliation

The blockchain reconciliation script was updated to improve handling of differences between:

```text
PostgreSQL donation records
        ↓
Blockchain donation records
```

The reconciliation process is intended to identify records where the off-chain and on-chain states require verification or correction.

This is particularly important because blockchain transactions can succeed independently of the application's normal request lifecycle.

---

# 20. Test Improvements

Several tests were updated or added as part of the backend changes.

The test suite covers areas including:

* Admin functionality
* Charity functionality
* Donation processing
* Disbursement
* Authentication
* Environment validation
* Blockchain service
* Blockchain integration
* Blockchain retry processing
* Government request status
* End-to-end backend functionality

The blockchain integration tests additionally perform real interaction with the configured Solana environment.

---

# 21. Final Blockchain Integration Verification

The blockchain integration test successfully verified:

```text
✓ Blockchain service initialization
✓ Recording a donation
✓ Reading the donation from the blockchain
✓ Donation integrity verification
✓ Detection of tampered donation data
✓ Valid donation status transition
✓ Rejection of invalid status transition
```

Result:

```text
Test Suites: 1 passed, 1 total
Tests:       7 passed, 7 total
```

The invalid status transition was correctly rejected by the on-chain program with:

```text
InvalidStatusTransition
```

This confirms that the backend is correctly communicating with the deployed blockchain program.

---

# 22. Final Test Result

The complete backend test suite was executed using:

```bash
npm test
```

Final result:

```text
Test Suites: 10 passed, 10 total
Tests:       74 passed, 74 total
Snapshots:   0 total
Time:        4.265 s
```

Therefore:

```text
10/10 test suites passed
74/74 tests passed
0 test failures
```

---

# 23. Why These Changes Were Important

The changes were not limited to making individual tests pass.

They addressed several layers of backend reliability:

```text
                    Trace-It Backend

                         │
        ┌────────────────┼────────────────┐
        ▼                ▼                ▼
 Authentication      Authorization     KYC
        │                │                │
        └────────────────┼────────────────┘
                         ▼
                    Route Layer
                         │
                         ▼
                   Service Layer
                         │
              ┌──────────┴──────────┐
              ▼                     ▼
         PostgreSQL              Blockchain
              │                     │
              └──────────┬──────────┘
                         ▼
                   Audit / Logging
```

The objective was to make the backend:

* More secure
* More testable
* More observable
* More resilient to blockchain failures
* More consistent between database and blockchain state
* Safer to deploy in production

---

# 24. Final Status

The backend is currently in a known-good state.

### Test status

**10/10 test suites passing**

**74/74 tests passing**

### Blockchain

**Devnet integration verified**

### Security

Authentication, authorization, KYC enforcement, environment validation, request logging and audit logging have been incorporated into the backend flow.

### Reliability

Blockchain retry and reconciliation logic has been incorporated to handle failures between the backend and blockchain layers.

### Git

The working state has been committed so it can be used as a stable checkpoint for future development.

---

## Conclusion

The latest backend work focused on moving Trace-It from a collection of individually functioning services toward a more consistent and testable backend system.

The most important validation is the final full-suite result:

```text
10 test suites
74 tests
74 passed
0 failed
```


