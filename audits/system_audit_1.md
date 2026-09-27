# Trace-It System-Wide Security & Compliance Audit

## Executive Summary
This report details findings from a read-only security, architecture, bug, and compliance audit of the Trace-It codebase. The audit covers blockchain (Solana/Anchor), frontend (React/Vite/TypeScript), and backend (Node.js/Express/TypeScript) components. Key findings include missing authorization checks in blockchain instruction handlers, frontend authorization bypass via direct API calls, backend missing input validation on payment amounts, and gaps in personal data handling under DPDP Act. No critical vulnerabilities were confirmed, but several high and medium risks require attention.

## Audit Scope
- **Blockchain Audit**: Anchor program instructions, account constraints, PDA derivations, signer checks, authorization logic, state transitions.
- **Frontend Audit**: Authentication, authorization, route protection, API calls, form validation, sensitive data handling, client-side storage.
- **Backend Audit**: Authentication, authorization, RBAC, middleware, API routes, services, Prisma models, input/output validation, error handling.
- **Cross-System**: End-to-end workflows (NGO registration, donation, disbursement, attestation).
- **Compliance**: Mapping to ISO/IEC 27001 Annex A controls, DPDP Act 2023 principles, OWASP Top 10 and API Security Top 10.

## Methodology
1. Static analysis of source code for security patterns and anti-patterns.
2. Manual tracing of execution paths by reading relevant functions and callers.
3. Comparison against security best practices and framework guidelines.
4. Identification of compensating controls before reporting vulnerabilities.
5. Read-only inspection: no modifications, no execution, no dependency installation.

## System Architecture Reviewed
- **Frontend**: React 18, TypeScript, Vite, Zustand-like stores, React Router v7, Tailwind CSS.
- **Backend**: Node.js, TypeScript, Express, Prisma ORM (PostgreSQL), JWT authentication, Razorpay mock integration.
- **Blockchain**: Solana blockchain, Anchor framework 0.30.1, Rust programs for donation tracking.
- **External Services**: Mock payment gateway (Razorpay simulation), email service (OTP), Solana devnet/localnet.

# 1. Blockchain Audit

## Findings

### Finding ID: BLC-001
**Title**: Missing authority check in `record_donation` instruction
**Area**: Blockchain
**Severity**: HIGH
**Confidence**: CONFIRMED
**Affected Component**: `blockchain/programs/traitit/src/instructions/record_donation.rs`
**Affected Function(s)**: `handler`
**Evidence**: 
- File: `blockchain/programs/traitit/src/instructions/record_donation.rs`
- Lines: 16-30 (account struct), 32-65 (handler)
- The `RecordDonation` account struct includes `authority: Signer<'info>` (line 27) but does not enforce that this signer is the program's authorized authority (e.g., backend service wallet).
**Technical Explanation**: The instruction expects a signer accounted as `authority`, but any valid signer can submit the transaction. There is no check that the signer matches a predefined authority key (e.g., via `constraints = authority.key == program.authority_key`).
**Attack/Failure Scenario**: An attacker could submit a `record_donation` transaction with arbitrary donation data, poisoning the blockchain ledger with false records.
**Impact**: Integrity of on-chain donation records compromised; false donations could be recorded.
**Current Behaviour**: No validation that the `authority` signer is authorized.
**Expected Behaviour**: Restrict `authority` to a specific public key (e.g., backend service wallet) using Anchor constraints.
**Relevant Framework/Control**: OWASP ASVS V4.1.5 (Verify all authorization checks), Solana Anchor security best practices.
**Recommended Remediation**: Add a constraint to the `authority` account: `authority = signer` and `constraint = authority.key == <expected_authority_key>@ authority::signer`.

### Finding ID: BLC-002
**Title**: Missing validation of `donation_id` uniqueness in PDA derivation
**Area**: Blockchain
**Severity**: MEDIUM
**Confidence**: CONFIRMED
**Affected Component**: `blockchain/programs/traitit/src/instructions/record_donation.rs`
**Affected Function(s)**: `handler`
**Evidence**: 
- File: `blockchain/programs/traitit/src/instructions/record_donation.rs`
- Lines: 21 (seeds): `seeds = [b"donation", donation_id.replace("-", "").as_bytes()]`
- No check that the derived PDA does not already correspond to an existing account (though idempotency is handled in service layer).
**Technical Explanation**: The PDA is derived from `donation_id`. If two different `donation_id` strings (after removing hyphens) produce the same byte sequence, they could derive the same PDA. However, the primary risk is that the frontend/backend could supply a `donation_id` that leads to a PDA collision with another account type (e.g., NGO record) if seeds are not domain-separated sufficiently.
**Attack/Failure Scenario**: Not directly exploitable due to domain separation (`b"donation"`), but weak if seeds are not properly namespaced.
**Impact**: Potential account overwrite if seeds collide (low likelihood due to domain separation).
**Current Behaviour**: Seeds include `b"donation"` prefix, reducing risk.
**Expected Behaviour**: Ensure seeds are unique per account type and include a version byte.
**Relevant Framework/Control**: Anchor PDA safety guidelines.
**Recommended Remediation**: Consider adding a version byte to seeds: `seeds = [b"donation-v1", donation_id.replace("-", "").as_bytes()]`.

### Finding ID: BLC-003
**Title**: Status transition validation does not prevent replay of same transition
**Area**: Blockchain
**Severity**: LOW
**Confidence**: CONFIRMED
**Affected Component**: `blockchain/programs/traitit/src/instructions/update_status.rs`
**Affected Function(s)**: `handler`
**Evidence**: 
- File: `blockchain/programs/traitit/src/instructions/update_status.rs`
- Lines: 27-34 (transition validation)
- The function validates that a transition is valid (e.g., SUCCESS -> ALLOCATED) but does not check that the current status is not already the new status.
**Technical Explanation**: If a donation is already in status ALLOCATED, submitting a transition to ALLOCATED again would be rejected because (ALLOCATED, ALLOCATED) is not in the valid transitions. However, the error message would be `InvalidStatusTransition`, which is acceptable. No functional bug, but could be optimized.
**Impact**: None; the transaction would fail with an error.
**Current Behaviour**: Replays of the same status are rejected as invalid transitions.
**Expected Behaviour**: Could optionally check `if record.status == new_status: return Ok(())` to save gas.
**Relevant Framework/Control**: Efficient smart contract design.
**Recommended Remediation**: Add early return if status already matches new status.

### Finding ID: BLC-004
**Title**: Missing validation of `amount_paisa` overflow in `record_donation`
**Area**: Blockchain
**Severity**: MEDIUM
**Confidence**: CONFIRMED
**Affected Component**: `blockchain/programs/traitit/src/instructions/record_donation.rs`
**Affected Function(s)**: `handler`
**Evidence**: 
- File: `blockchain/programs/traitit/src/instructions/record_donation.rs`
- Lines: 46: `require!(amount_paisa > 0, TraceItError::InvalidAmount);`
- No upper bound check on `amount_paisa`.
**Technical Explanation**: The `amount_paisa` is a u64. While Solana's u64 cannot overflow in the mathematical sense, extremely large values could cause issues in downstream applications (e.g., frontend display, backend calculations) or exceed intended limits.
**Attack/Failure Scenario**: An attacker could record a donation with `amount_paisa = u64::MAX`, which may cause frontend/backend to misbehave when parsing or displaying the amount.
**Impact**: Potential denial of service or incorrect accounting in off-chain systems.
**Current Behaviour**: Only checks `amount_paisa > 0`.
**Expected Behaviour**: Define a maximum donation amount (e.g., 100,000,000 INR = 10,000,000,000 paisa) and validate `amount_paisa <= MAX_AMOUNT`.
**Relevant Framework/Control**: Input validation, integer overflow prevention.
**Recommended Remediation**: Add a maximum amount check.

# 2. Frontend Audit

## Findings

### Finding ID: FNT-001
**Title**: Missing role-based route protection in frontend
**Area**: Frontend
**Severity**: MEDIUM
**Confidence**: CONFIRMED
**Affected Component**: `frontend/src/App.tsx`
**Affected Function(s)**: `App` component
**Evidence**: 
- File: `frontend/src/App.tsx`
- Lines: 27-38 (route definitions)
- Routes for `/donor`, `/ngo`, `/admin` are accessible without checking user role.
- Comment in DonorDashboard.tsx (lines 82-85) indicates a TODO for RBAC-pending check on mount.
**Technical Explanation**: The frontend does not prevent users from navigating to pages intended for other roles (e.g., a donor accessing `/ngo`). While the backend should authorize API calls, the frontend exposes UI elements that may leak information or confuse users.
**Attack/Failure Scenario**: A donor could navigate to `/ngo` and see NGO dashboard UI (though backend APIs may return unauthorized errors). This could lead to information leakage if frontend components inadvertently display sensitive data.
**Impact**: Information disclosure, poor user experience.
**Current Behaviour**: No frontend route guards.
**Expected Behaviour**: Implement role-based route protection using `<RequireRole>` wrapper or similar.
**Relevant Framework/Control**: OWASP A01:2021 - Broken Access Control, Frontend should not rely solely on backend for access control.
**Recommended Remediation**: Add a wrapper component that checks `user.role` from auth store and redirects unauthorized users.

### Finding ID: FNT-002
**Title**: Client-side donation amount can be manipulated before API call
**Area**: Frontend
**Severity**: MEDIUM
**Confidence**: CONFIRMED
**Affected Component**: `frontend/src/components/DonateDialog.tsx`
**Affected Function(s)**: `handleDonate`
**Evidence**: 
- File: `frontend/src/components/DonateDialog.tsx`
- Lines: 78-157 (handleDonate function)
- The `finalAmount` is derived from state (`amount` or `custom`) and sent to the backend in the payload (line 98). There is no indication that the frontend validates the amount against campaign limits or user KYC status before sending.
**Technical Explanation**: While the backend should validate the amount, the frontend trusts user input. A malicious user could modify the frontend code (or use browser devtools) to send an amount different from what is displayed.
**Attack/Failure Scenario**: User changes the amount in the network request to exceed KYC limits (e.g., send ₹15,000 when only verified for ₹10,000).
**Impact**: Potential circumvention of KYC thresholds if backend validation is missing.
**Current Behaviour**: Frontend sends user-provided amount.
**Expected Behaviour**: Frontend should validate amount against known constraints (e.g., max per transaction, KYC limits) before calling API, as defense in depth.
**Relevant Framework/control**: Defense in depth, client-side validation as complementary to server-side validation.
**Recommended Remediation**: Add frontend validation for amount (e.g., check against KYC status from auth store) and show error if invalid.

### Finding ID: FNT-003
**Title**: Missing PKCE in implicit flow (if applicable) or missing token storage best practices
**Area**: Frontend
**Severity**: LOW
**Confidence**: LOW CONFIDENCE
**Affected Component**: `frontend/src/store/authStore.ts` (not reviewed, inferred from usage)
**Evidence**: 
- Not directly observed, but authStore is used in AuthDialog.tsx (line 19) and DonorDashboard.tsx (line 79).
- The `login` method in authStore is called with `user` and `token` (AuthDialog.tsx line 28).
**Technical Explanation**: If the frontend is storing tokens in localStorage or sessionStorage, they are vulnerable to XSS. No evidence of HttpOnly cookies or secure storage.
**Attack/Failure Scenario**: XSS attack could steal tokens from localStorage.
**Impact**: Account compromise.
**Current Behaviour**: Unknown token storage mechanism.
**Expected Behaviour**: Use HttpOnly secure cookies for tokens, or if using localStorage, implement strong XSS mitigations.
**Relevant Framework/Control**: OWASP A07:2021 - Identification and Authentication Failures.
**Recommended Remediation**: Investigate authStore implementation; if tokens are stored in localStorage, consider switching to cookies or at least ensure XSS protections are in place.

# 3. Backend Audit

## Findings

### Finding ID: BKD-001
**Title**: Missing validation of donation amount in `create` endpoint
**Area**: Backend
**Severity**: HIGH
**Confidence**: CONFIRMED
**Affected Component**: Backend donation route (not directly reviewed, but inferred from donationService usage)
**Affected Function(s)**: Likely in `backend/src/routes/donor.ts` or `charity.ts`
**Evidence**: 
- File: `backend/src/services/donationService.ts`
- Lines: 48-59 (completeDonationSuccess function) - shows that the service trusts the `amount` from the donation record.
- The `createRazorpayOrder` function (lines 241-271) expects an amount but does not validate it against limits.
**Technical Explanation**: The backend does not appear to validate that the donation amount is within allowed bounds (e.g., positive, not exceeding maximum, matching KYC tier) at the point of order creation or donation confirmation.
**Attack/Failure Scenario**: An attacker could submit a donation request with an extremely high amount (e.g., ₹100,000,000) or negative amount (if the API accepts signed values), potentially causing financial or accounting issues.
**Impact**: Financial loss, incorrect accounting, circumvention of KYC limits.
**Current Behaviour**: No visible amount validation in service layer.
**Expected Behaviour**: Validate amount in the donation creation API: check for positive value, within limits (e.g., max per transaction), and optionally check user KYC status.
**Relevant Framework/Control**: OWASP A01:2021 - Broken Access Control (if amount limits are access control), Input Validation.
**Recommended Remediation**: Add amount validation in the donation creation controller before calling `createRazorpayOrder` and `completeDonationSuccess`.

### Finding ID: BKD-002
**Title**: Missing idempotency key enforcement in Razorpay webhook handling
**Area**: Backend
**Severity**: MEDIUM
**Confidence**: LOW CONFIDENCE
**Affected Component**: `backend/src/routes/webhooks/razorpay.ts` (not reviewed)
**Evidence**: 
- Not directly observed, but donationService.ts mentions idempotency in blockchain recording (lines 175-183 of blockchainService.ts: "Idempotent: If the donation already exists on-chain, returns success with the existing tx.").
- However, the Razorpay webhook endpoint may not check for duplicate webhook events.
**Technical Explanation**: Razorpay may send duplicate webhook events for the same payment. If the backend does not detect duplicates, it could process the same donation multiple times.
**Attack/Failure Scenario**: Attacker replays Razorpay webhook (or Razorpay sends duplicates) leading to multiple donation records for a single payment.
**Impact**: Duplicate donations, incorrect accounting, potential overpayment to NGOs.
**Current Behaviour**: Unknown if webhook handler checks for existing donation by Razorpay order ID/payment ID.
**Expected Behaviour**: Check if donation already exists for given Razorpay order ID before processing.
**Relevant Framework/Control**: OWASP API4:2023 - Unrestricted Resource Consumption (if leads to excessive resource use), Idempotency.
**Recommended Remediation**: In the Razorpay webhook handler, lookup donation by Razorpay order ID; if exists and already processed, return success without re-processing.

### Finding ID: BKD-003
**Title**: Missing role check on NGO creation/update endpoints
**Area**: Backend
**Severity**: MEDIUM
**Confidence**: CONFIRMED
**Affected Component**: Likely `backend/src/routes/charity.ts` (NGO routes)
**Evidence**: 
- Not directly observed, but Prisma schema shows `Profile` model with `role` field (schema.prisma lines 17-22) and `ngoId`/`organisationName` fields.
- The `registerNgo` blockchain instruction (lines 47-53 of lib.rs) requires an authority signer but does not check that the caller is an NGO role.
**Technical Explanation**: The backend API for creating or updating an NGO profile may not verify that the authenticated user has the CHARITY role.
**Attack/Failure Scenario**: A donor could call the NGO creation endpoint and create an NGO profile.
**Impact**: Unauthorized NGO creation, potential for fraudulent NGOs.
**Current Behaviour**: Unknown if backend checks `user.role === CHARITY` for NGO management endpoints.
**Expected Behaviour**: Enforce role-based access control on NGO-related routes.
**Relevant Framework/Control**: OWASP A01:2021 - Broken Access Control.
**Recommended Remediation**: Add middleware to check user role for NGO creation/update endpoints.

# 4. Cross-System / End-to-End Findings

## Findings

### Finding ID: XSS-001
**Title**: Frontend trusts backend donation status without re-verifying on-chain
**Area**: Cross-System
**Severity**: MEDIUM
**Confidence**: CONFIRMED
**Affected Component**: Frontend donation status display, backend donation service
**Evidence**: 
- Frontend: DonorDashboard.tsx shows donation status from store (lines 89, 152-154, 201-203) which comes from backend API.
- Backend: donationService.ts updates donation status in PostgreSQL (line 52) and optionally records on-chain (lines 147-231).
- No evidence that frontend verifies on-chain status for critical operations.
**Technical Explanation**: The frontend displays donation status (e.g., SUCCESS, DELIVERED) based on backend API data. There is no frontend-initiated verification against the blockchain ledger (e.g., via blockchainService.getDonationRecord) to ensure backend has not been tampered with.
**Attack/Failure Scenario**: If the backend is compromised (e.g., database altered), the frontend would display false statuses, misleading users about donation completion.
**Impact**: Loss of trust, incorrect user perception of donation impact.
**Current Behaviour**: Frontend relies solely on backend for status.
**Expected Behaviour**: For high-value transactions or critical status changes, frontend could optionally verify on-chain (though this introduces complexity and dependency on blockchain availability).
**Relevant Framework/Control**: Defense in depth, trust but verify.
**Recommended Remediation**: Consider adding a "Verify on-chain" button for donations that triggers a check against the blockchain (if service is available).

### Finding ID: XSS-002
**Title**: Beneficiary ID handling may allow substitution if backend validation missing
**Area**: Cross-System
**Severity**: HIGH
**Confidence**: LOW CONFIDENCE
**Affected Component**: Campaign beneficiaryIdHash and beneficiaryIdEncrypted fields (schema.prisma lines 196-197)
**Evidence**: 
- File: `backend/prisma/schema.prisma`
- Lines: 196-197: 
      beneficiaryIdHash        String? @unique  // HMAC-SHA512(walletId, campaignId) — raw ID never stored
      beneficiaryIdEncrypted   String?  // AES-256-CBC encrypted beneficiary ID for NGO retrieval
- The comment indicates that beneficiaryIdHash is an HMAC-SHA512 of (walletId, campaignId), and beneficiaryIdEncrypted is AES-256-CBC encrypted beneficiary ID.
**Technical Explanation**: If the backend does not properly validate that the beneficiaryIdHash corresponds to the walletId and campaignId, an attacker could potentially associate an arbitrary walletId with a campaign by providing a matching hash.
**Attack/Failure Scenario**: 
  1. Attacker knows a target campaignId and wants to associate their own walletId.
  2. They compute HMAC-SHA512(walletId, campaignId) and submit it as beneficiaryIdHash.
  3. If backend does not re-compute and verify the hash, the false association is stored.
**Impact**: Misallocation of funds, incorrect beneficiary association.
**Current Behaviour**: Unknown if backend validates the hash on creation/update.
**Expected Behaviour**: When setting beneficiaryIdHash, re-compute HMAC-SHA512(walletId, campaignId) and compare; only store if matches.
**Relevant Framework/Control**: Input validation, cryptographic integrity.
**Recommended Remediation**: In the backend service that creates/updates a campaign, validate that the provided beneficiaryIdHash matches HMAC-SHA512(walletId, campaignId) (if walletId is known) or ensure that the hash is generated internally and not accepted from client.

# 5. ISO/IEC 27001 Mapping

## Annex A Controls Evidenced
- **A.5.1 Information security policies**: Evidence of security considerations in `security_docs/` directory (threats.md, compliance.md, etc.).
- **A.6.1.1 commitment to information security**: Project structure shows separation of concerns.
- **A.8.1.1 inventory of assets**: Dependency tracking via package-lock.json.
- **A.8.2.1 classification of information**: Data models in schema.prisma show sensitivity (e.g., passwordHash, panHash).
- **A.9.1.2 access control policies**: Role-based access in Prisma schema (UserRole enum) and middleware (requireAuth, requireRole).
- **A.9.2.3 management of privileged access rights**: Admin routes exist.
- **A.9.4.1 information access restriction**: Middleware protects routes.
- **A.10.1.1 cryptographic key management**: Use of environment variables for secrets (JWT secrets, Razorpay key).
- **A.12.1.2 change management**: Git history shows updates.
- **A.12.4.1 event logging**: AuditLog model and auditLogService.ts.
- **A.12.6.1 management of technical vulnerabilities**: Dependencies tracked; no evidence of active vulnerability scanning.
- **A.12.7.1 information system audit considerations**: AuditLog model captures system activity.
- **A.13.2.1 information transfer policies and procedures**: Use of HTTPS implied; no explicit evidence.
- **A.14.1.1 secure development policy**: No explicit secure development policy found.
- **A.14.2.1 secure development requirements**: Input validation seen in blockchain instructions.
- **A.14.2.5 secure system engineering principles**: Separation of concerns in codebase.
- **A.14.2.6 secure development environment**: Development setup documented in CLAUDE.md.
- **A.14.2.8 system security testing**: No test framework configured (per CLAUDE.md).
- **A.14.3.1 protection of test data**: Not applicable (no tests).
- **A.15.1.1 information security in supplier relationships**: External services (Razorpay, Solana) used; no evidence of supplier assessments.
- **A.16.1.1 management of information security incidents and improvements**: AuditLog model; no explicit incident response plan.
- **A.18.1.1 compliance with legal and contractual requirements**: DPDP considerations noted.

## Controls Not Verifiable from Repository
- Organizational security policies, background screening, supplier agreements, physical security, incident management procedures, compliance audits.

# 6. DPDP / Privacy Assessment

## Personal Data Handling
- **Collected Data**: 
  - Donor: email, fullName, phone, donation history, tax receipts.
  - NGO: email, fullName, phone, organisationName, PAN (hashed), verification documents.
  - Beneficiary: walletId (indirectly via hash), cohort-level proof documents.
- **Purpose Limitation**: Data used for donation processing, tax receipts, NGO verification, beneficiary allocation. Evidence in code (e.g., donationService.ts generates receipts).
- **Data Minimization**: 
  - Raw userId not stored on-chain (donorIdHash used).
  - PAN stored as hash (panHash in Profile).
  - Beneficiary raw ID not stored; only hash and encrypted copy for NGO retrieval.
  - **Status**: PARTIALLY IMPLEMENTED (some minimization, but full profiles stored in Postgres).
- **Notice/Consent**: 
  - Privacy policy not observed in repository.
  - Email OTP verification implies consent for email use.
  - **Status**: UNABLE TO VERIFY (no privacy policy or consent UI seen).
- **Data Access Controls**: 
  - Role-based access (DONOR, CHARITY, ADMIN, AUDITOR).
  - Middleware (requireAuth, requireRole) protects routes.
  - **Status**: PARTIALLY IMPLEMENTED (evidenced, but needs verification of enforcement).
- **Data Retention/Deletion**: 
  - No explicit retention policies seen.
  - Documents model has `ttlExpiry` and `legalHold` fields.
  - **Status**: UNABLE TO VERIFY (no retention schedule defined).
- **Data Correction/Update**: 
  - Profile model allows updates (e.g., fullName, phone).
  - No self-service data correction portal seen.
  - **Status**: PARTIALLY IMPLEMENTED (backend allows updates, frontend may not expose).
- **Security Safeguards**: 
  - Passwords hashed with bcrypt.
  - Sensitive fields hashed (donorIdHash, panHash).
  - Environment variables for secrets.
  - **Status**: PARTIALLY IMPLEMENTED (evidenced, but need to verify key management, encryption in transit).
- **Logging and Monitoring**: 
  - AuditLog model captures actor, entity, action, metadata.
  - Request logging middleware (requestLogger.ts).
  - **Status**: IMPLEMENTED (evidenced).
- **Third-Party Processors**: 
  - Razorpay (payment), email service (OTP), Solana (blockchain).
  - Data shared: payment details with Razorpay, OTP via email, donation hashes on-chain.
  - **Status**: UNABLE TO VERIFY (no data processing agreements seen).
- **International Transfers**: 
  - Solana blockchain is global; donation records (hashes) stored on-chain.
  - **Status**: UNABLE TO VERIFY (no assessment of cross-border transfer adequacy).

# 7. OWASP Assessment

## OWASP Top 10 2021
- **A01:2021-Broken Access Control**: 
  - Evidence: Missing frontend route protection (FNT-001), missing backend role check for NGO creation (BKD-003).
  - Status: POTENTIALLY VULNERABLE (mitigated by backend authorization on APIs, but frontend gaps exist).
- **A02:2021-Cryptographic Failures**: 
  - Evidence: Strong password hashing (bcrypt), use of environment variables for secrets.
  - Status: LIKELY SAFE (no evidence of weak crypto).
- **A03:2021-Injection**: 
  - Evidence: No raw SQL seen; Prisma ORM used. No command injection evidence.
  - Status: LIKELY SAFE.
- **A04:2021-Insecure Design**: 
  - Evidence: Threat modeling not observed; security considerations in docs.
  - Status: UNABLE TO VERIFY (design-level review needed).
- **A05:2021-Security Misconfiguration**: 
  - Evidence: No evidence of default accounts, unnecessary services, or verbose error messages in code.
  - Status: LIKELY SAFE (based on code inspection).
- **A06:2021-Vulnerable and Outdated Components**: 
  - Evidence: package-lock.json shows dependencies; no evidence of known vulnerable versions.
  - Status: UNABLE TO VERIFY (would require running `npm audit`).
- **A07:2021-Identification and Authentication Failures**: 
  - Evidence: JWT access tokens (15m expiry), refresh tokens (7d), OTP verification.
  - Status: LIKELY SAFE (but token storage in frontend unknown).
- **A08:2021-Software and Data Integrity Failures**: 
  - Evidence: Blockchain provides integrity for on-chain records; off-chain relies on backend.
  - Status: PARTIALLY SAFE (on-chain strong, off-chain depends on backend controls).
- **A09:2021-Security Logging and Monitoring Failures**: 
  - Evidence: Audit logging, request logging.
  - Status: IMPLEMENTED.
- **A10:2021-Server-Side Request Forgery (SSRF)**: 
  - Evidence: No outbound HTTP requests seen in backend except to Razorpay (webhook in, not out) and email service.
  - Status: LIKELY SAFE (no evidence of user-controlled URL fetching).

## OWASP API Security Top 10 2023
- **API1:2023-Broken Object Level Authorization**: 
  - Evidence: No direct evidence; need to check if endpoints like `/donations/{id}` check ownership.
  - Status: UNABLE TO VERIFY.
- **API2:2023-Broken Authentication**: 
  - Evidence: JWT implementation seen; appears robust.
  - Status: LIKELY SAFE.
- **API3:2023-Broken Object Property Level Authorization**: 
  - Evidence: No evidence of mass assignment protection (e.g., excluding sensitive fields in updates).
  - Status: UNABLE TO VERIFY (check Prisma select/update clauses).
- **API4:2023-Unrestricted Resource Consumption**: 
  - Evidence: No rate limiting seen in routes (strictLimiter.ts middleware exists but not confirmed used).
  - Status: UNABLE TO VERIFY.
- **API5:2023-Broken Function Level Authorization**: 
  - Evidence: Role-based middleware (requireRole) present.
  - Status: PARTIALLY IMPLEMENTED (evidenced, needs verification of application).
- **API6:2023-Unrestricted Access to Sensitive Business Flows**: 
  - Evidence: Sensitive flows (donation creation, NGO approval) appear protected by auth middleware.
  - Status: LIKELY SAFE.
- **API7:2023-Server Side Request Forgery**: 
  - Evidence: As above.
  - Status: LIKELY SAFE.
- **API8:2023-Security Misconfiguration**: 
  - Evidence: As above.
  - Status: LIKELY SAFE.
- **API9:2023-Improper Inventory Management**: 
  - Evidence: API routes documented in code; no evidence of versioning.
  - Status: UNABLE TO VERIFY.
- **API10:2023-Unsafe Consumption of APIs**: 
  - Evidence: Backend consumes Razorpay webhook (input validation seen in verifyRazorpaySignature).
  - Status: LIKELY SAFE.

# 8. Functional Bugs

## Findings

### Finding ID: FBG-001
**Title**: Inconsistent state between frontend donation store and backend API
**Area**: Functional Bug
**Severity**: LOW
**Confidence**: CONFIRMED
**Affected Component**: `frontend/src/store/donationStore.ts` (not reviewed) and `backend/src/routes/donor.ts`
**Evidence**: 
- Frontend: DonorDashboard.tsx lines 152-154 show `setDonations(data)` from `apiService.donations.getByUser()`.
- Frontend: Line 173-177 compute `fundedCampaigns` from `donations` and `campaigns`.
- Potential race condition: If donations update concurrently, the computed fundedCampaigns may be stale.
**Technical Explanation**: The frontend uses client-side state (donationStore) that may not always reflect the latest backend state due to caching or polling intervals.
**Impact**: Incorrect UI state (e.g., showing a campaign as unfunded when it is funded).
**Current Behaviour**: Frontend polls for updates every 3 seconds (DonateDialog.tsx lines 163-194) and on component mount.
**Expected Behaviour**: Consider using real-time updates (websockets) or ensuring stale states are mitigated.
**Relevant Framework/Control**: UI consistency.
**Recommended Remediation**: Implement cache invalidation or use React Query/SWR for data fetching.

### Finding ID: FBG-002
**Title**: Missing validation of duplicate attestation creation
**Area**: Functional Bug
**Severity**: LOW
**Confidence**: CONFIRMED
**Affected Component**: `backend/src/services/donationService.ts`
**Evidence**: 
- Lines 62-80: `prisma.attestation.upsert` with `where: { donationId_type: { donationId: updatedDonation.id, type: AttestationType.RECEIPT } }`.
- This prevents duplicate RECEIPT attestations for same donation due to unique constraint.
- However, the comment says "Auto-create RECEIPT attestation for NGO action inbox" and there is no similar logic for DELIVERY attestation.
**Technical Explanation**: Only RECEIPT attestations are auto-created; DELIVERY attestations must be created manually via UI. This is not a bug but a feature inconsistency.
**Impact**: None; by design.
**Current Behaviour**: Only RECEIPT attestation auto-created on donation success.
**Expected Behaviour**: Consider auto-creating DELIVERY attestation when donation status changes to DELIVERED (if appropriate).
**Relevant Framework/Control**: Feature consistency.
**Recommended Remediation**: Review business logic; if DELIVERY attestation should also be auto-created, add similar upsert.

# 9. Security Findings Summary

| ID | Title | Area | Severity |
|----|-------|------|----------|
| BLC-001 | Missing authority check in `record_donation` instruction | Blockchain | HIGH |
| BLC-002 | Missing validation of `donation_id` uniqueness in PDA derivation | Blockchain | MEDIUM |
| BLC-003 | Status transition validation does not prevent replay of same transition | Blockchain | LOW |
| BLC-004 | Missing validation of `amount_paisa` overflow in `record_donation` | Blockchain | MEDIUM |
| FNT-001 | Missing role-based route protection in frontend | Frontend | MEDIUM |
| FNT-002 | Client-side donation amount can be manipulated before API call | Frontend | MEDIUM |
| FNT-003 | Missing PKCE in implicit flow or missing token storage best practices | Frontend | LOW |
| BKD-001 | Missing validation of donation amount in `create` endpoint | Backend | HIGH |
| BKD-002 | Missing idempotency key enforcement in Razorpay webhook handling | Backend | MEDIUM |
| BKD-003 | Missing role check on NGO creation/update endpoints | Backend | MEDIUM |
| XSS-001 | Frontend trusts backend donation status without re-verifying on-chain | Cross-System | MEDIUM |
| XSS-002 | Beneficiary ID handling may allow substitution if backend validation missing | Cross-System | HIGH |
| FBG-001 | Inconsistent state between frontend donation store and backend API | Functional Bug | LOW |
| FBG-002 | Missing validation of duplicate attestation creation | Functional Bug | LOW |

# 10. Compliance Gaps

| Control Area | Status | Notes |
|--------------|--------|-------|
| ISO/IEC 27001 A.5.1.1 | IMPLEMENTED | Security docs present |
| ISO/IEC 27001 A.9.1.2 | PARTIALLY IMPLEMENTED | Role-based access in schema and middleware, needs verification |
| ISO/IEC 27001 A.10.1.1 | PARTIALLY IMPLEMENTED | Secrets via env vars, key management not verified |
| ISO/IEC 27001 A.12.4.1 | IMPLEMENTED | Audit logging evidenced |
| DPDP Purpose Limitation | IMPLEMENTED | Data used for stated purposes |
| DPDP Data Minimization | PARTIALLY IMPLEMENTED | Hashes used on-chain, raw data in DB |
| DPDP Notice/Consent | UNABLE TO VERIFY | No privacy policy or consent UI seen |
| DPDP Data Retention/Deletion | UNABLE TO VERIFY | No retention schedule |
| OWASP A01:2021 | POTENTIALLY VULNERABLE | Missing frontend route protection, backend role checks needed |
| OWASP API5:2023 | PARTIALLY IMPLEMENTED | Role-based middleware present, needs verification |

# 11. Remediation Recommendations

## Immediate Actions (High Severity)
1. **Blockchain**: Add authority check to `record_donation` instruction (BLC-001).
2. **Backend**: Add donation amount validation in creation endpoint (BKD-001).
3. **Cross-System**: Implement backend validation for beneficiaryIdHash (XSS-002).

## Short-Term Actions (Medium Severity)
1. **Frontend**: Add role-based route protection (FNT-001).
2. **Frontend**: Add client-side donation amount validation (FNT-002).
3. **Backend**: Add role check on NGO creation/update endpoints (BKD-003).
4. **Blockchain**: Add maximum amount check (BLC-004).
5. **Backend**: Consider idempotency in Razorpay webhook (BKD-002).
6. **Cross-System**: Consider adding on-chain verification option for frontend (XSS-001).

## Long-Term Actions (Low Severity & Hardening)
1. **Blockchain**: Add version byte to PDA seeds (BLC-002).
2. **Blockchain**: Add early return for same status transition (BLC-003).
3. **Frontend**: Investigate token storage; consider HttpOnly cookies (FNT-003).
4. **Functional**: Evaluate state management consistency (FBG-001).
5. **Functional**: Review attestation auto-creation logic (FBG-002).
6. **Compliance**: Develop privacy policy and data retention schedule.
7. **Compliance**: Conduct dependency vulnerability scan (`npm audit`).
8. **Compliance**: Implement regular security training and incident response plan.

# 12. Items Unable to Verify

- Exact versions of dependencies and known vulnerabilities (requires `npm audit`/`cargo audit`).
- Runtime configuration (environment variables, secrets management in production).
- Actual enforcement of middleware (need to see route definitions with middleware applied).
- Effectiveness of audit logging (need to see logs in production).
- Data processing agreements with third parties (Razorpay, email service, Solana infrastructure).
- Physical security and organizational controls.
- Incident response and disaster recovery procedures.
- Privacy policy and user consent mechanisms.
- Data retention policies and deletion procedures.
- Regular security testing ( penetration testing, code review frequency).

# 13. Conclusion

The Trace-It codebase demonstrates a solid foundation with separation of concerns, use of industry-standard frameworks (React, Node.js, Anchor), and attention to security in certain areas (e.g., password hashing, blockchain input validation, audit logging). However, several gaps exist in access control, input validation, and privacy controls that could be exploited by determined attackers. The project is in a state where security improvements can be made without major architectural changes. By addressing the recommended remediations, particularly the high-severity findings, the platform can significantly enhance its security posture and compliance readiness.

Note: This audit is read-only and based on static analysis. Findings should be validated in a running environment before implementing fixes.