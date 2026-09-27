# Audit Context for Trace-It System (Post-Disbursement Module)

## System Overview
Trace-It is a donation/platform management system designed to provide transparency in charitable donations from donors to NGOs to beneficiaries. The system uses blockchain (Solana) as an audit layer to record donation transactions and status updates, while relying on traditional payment gateways (Razorpay) for fiat money movement. The platform supports three primary user roles: Donors (who contribute funds), NGOs (who run campaigns and receive funds), and Administrators (who oversee the platform). Key workflows include NGO registration, campaign creation, donation processing, fund disbursement, and attestation/verification of donation delivery.

This audit context reflects the state of the system after the implementation of the multi-disbursement tracking feature, which allows donations to be split across multiple disbursements (milestones) and introduces on-chain recording of disbursements.

## Technology Stack
- **Frontend**: React 18, TypeScript, Vite (build tool), React Router v7, Tailwind CSS, Zustand-like state management (authStore, donationStore, ngoStore, adminStore, uiStore), Lucide React for icons, Framer Motion for animations.
- **Backend**: Node.js, TypeScript, Express.js framework, Prisma ORM (PostgreSQL), JWT authentication (access tokens: 15m, refresh tokens: 7d), bcrypt for password hashing, mock Razorpay integration for payment simulation.
- **Blockchain**: Solana blockchain, Anchor framework 0.30.1, Rust programs, PDA (Program Derived Address) accounts for donation records, NGO records, cohort records, and disbursement records.
- **Database**: PostgreSQL (via Prisma), with tables for Profiles, Donations, Campaigns, Beneficiary Cohorts, Disbursements, Documents, DonationAllocations (new for multi-disbursement tracking), Impact Tokens, Government Requests, Audit Logs, Blockchain Retry Queue, Attestations, and Email Verifications.
- **External Services**: 
  - Payment: Razorpay (mocked in development)
  - Email: Custom OTP service (would be replaced with SendGrid/etc. in production)
  - Blockchain: Solana devnet/localnet for transaction recording
  - Storage: Local filesystem (would be cloud storage like AWS S3 in production)
- **DevOps**: Dockerfile present, Jenkinsfile for CI/CD, no explicit Kubernetes configuration observed.

## Repository Structure
```
trace-it/
├── frontend/                     # React/Vite/TypeScript SPA
│   ├── src/
│   │   ├── components/           # Reusable UI components (dialogs, badges, cards, etc.)
│   │   │   ├── DisbursementRequestDialog.tsx    # NEW: Request disbursements
│   │   │   ├── ProofUploadDialog.tsx            # UPDATED: For disbursement proof uploads
│   │   │   └── ... (existing components)
│   │   ├── pages/                # Route components (Home, DonorDashboard, NGODashboard, etc.)
│   │   │   ├── DonorDashboard.tsx       # UPDATED: Shows disbursement tracking
│   │   │   ├── NGODashboard.tsx         # UPDATED: Shows disbursement management
│   │   │   └── AdminPanel.tsx           # UPDATED: Admin disbursement oversight
│   │   ├── store/                # Zustand-like stores (auth, donation, ngo, admin, ui)
│   │   │   └── adminStore.ts        # UPDATED: For disbursement tracking
│   │   ├── services/             # API service wrappers (authService, mockPayments)
│   │   │   └── apiClient.ts         # UPDATED: Added charity.createDisbursement method
│   │   ├── hooks/                # Custom React hooks (use-toast, useAttestationStatus, etc.)
│   │   ├── types/                # TypeScript definitions
│   │   │   └── index.ts            # UPDATED: Added DisbursementResponse, DisbursementStatus types
│   │   ├── lib/                  # Utility functions
│   │   └── utils/                # Additional utilities
│   ├── index.css                 # Tailwind base styles
│   └── main.tsx                  # Entry point
│
├── backend/                      # Node.js/Express/TypeScript API
│   ├── src/
│   │   ├── middleware/           # Express middleware (auth, logging, error handling, etc.)
│   │   ├── routes/               # API controllers (auth, donor, charity, admin, webhooks)
│   │   │   ├── charity.ts        # UPDATED: Added disbursement endpoints
│   │   │   └── ... (existing routes)
│   │   ├── services/             # Business logic (auth, donation, blockchain, receipt, audit)
│   │   │   ├── blockchainService.ts    # UPDATED: Added recordDisbursement method
│   │   │   ├── donationService.ts      # UPDATED: Allocation logic for multi-disbursement
│   │   │   ├── statusService.ts        # UPDATED: Multi-disbursement allocation
│   │   │   └── blockchainRetryQueue.ts # UPDATED: Disbursement-specific retry handling
│   │   ├── utils/                # Utility functions (env validation, etc.)
│   │   └── db/                   # Database connection (Prisma client)
│   ├── prisma/                   # Prisma ORM configuration
│   │   ├── schema.prisma         # Data models and relationships
│   │   │   ├── Disbursement model        # NEW: For tracking disbursements
│   │   │   ├── Updated Attestation model # UPDATED: With disbursementId and allocatedAmount
│   │   │   └── DonationAllocation model  # NEW: Many-to-many donation-disbursement tracking
│   │   └── migrations/           # Database migration history
│   │       └── 20260924154653_add_donation_allocations_and_multi_cycle_attestations/migration.sql
│   ├── tests/                    # Test directory (empty - no test framework configured)
│   ├── .env.example              # Example environment variables
│   ├── Dockerfile                # Containerization
│   └── package.json              # Dependencies and scripts
│
├── blockchain/                   # Solana/Anchor program
│   ├── programs/
│   │   └── traceit/              # Main Anchor program
│   │       ├── src/
│   │       │   ├── lib.rs        # Program entry point and instruction declarations
│   │       │   ├── instructions/ # Instruction handlers (record_donation, update_status, etc.)
│   │       │   │   └── record_disbursement.rs   # NEW: Instruction for recording disbursements
│   │       │   ├── state/        # Account state definitions (DonationRecord, NgoRecord, etc.)
│   │       │   │   └── disbursement_record.rs   # NEW: State definition for disbursement records
│   │       │   └── errors.rs     # Error codes
│   │       └── Cargo.toml        # Program dependencies
│   ├── Anchor.toml               # Anchor configuration (localnet/devnet)
│   ├── Cargo.toml                # Rust workspace configuration
│   ├── package.json              # Node.js dependencies (for ts-node scripts)
│   └── scripts/                  # Deployment and utility scripts
│
├── security_docs/                # Security and compliance documentation
│   ├── SECURITY.md
│   ├── threats.md
│   ├── compliance.md
│   └── remediations.md
│
├── scratch/                      # Temporary workspace
├── templates/                    # Template files
├── traceit-siem/                 # SIEM-related files
├── CLAUDE.md                     # Project instructions for Claude Code
├── README.md                     # Project overview (not reviewed in detail)
├── package-lock.json             # Frontend dependencies lock
├── system_audit_1.md             # PREVIOUS: Initial security audit
├── system_audit_2.md             # CURRENT: Disbursement module audit
└── various markdown docs         # Design, planning, implementation records
```

## Important Components

### Authentication
- **Frontend**: AuthDialog.tsx (email/password login), authStore (Zustand-like store managing user state and tokens)
- **Backend**: authService.ts (JWT token generation/validation, OTP email verification, password hashing), requireAuth middleware, login/refresh/logout endpoints
- **Flow**: User enters credentials → backend validates → returns JWT access/refresh tokens → frontend stores tokens → tokens sent in Authorization header for protected routes
- **Notes**: Refresh tokens hashed with bcrypt before storage in database; access tokens short-lived (15m)

### Authorization
- **Frontend**: Role-based UI hints (e.g., comments in DonorDashboard.tsx about RBAC-pending checks), but no enforced route guards
- **Backend**: requireRole middleware checking UserRole enum (DONOR, CHARITY=CHARITY in schema, ADMIN, AUDITOR), applied to routes
- **Database**: Prisma schema defines UserRole enum and role-based relationships (e.g., donationsMade, donationsReceived)
- **Notes**: Backend appears to enforce role-based access via middleware; frontend lacks equivalent protection

### Donation Workflow (Background)
1. **Frontend**: User selects campaign → enters amount → DonateDialog mocks UPI payment → creates donation record with status INITIATED
2. **Backend**: 
   - Donation record created in PostgreSQL
   - Razorpay order created (mocked)
   - Upon webhook simulation (or real webhook): completeDonationSuccess called
   - Donation status updated to SUCCESS
   - RECEIPT attestation auto-created (status PENDING)
   - If amount > 100,000 INR: AML flag raised
   - Audit log created for payment success
   - 80G receipt generation queued
   - Solana blockchain recording attempted (donationRecord account created/updated)
3. **Blockchain**: 
   - record_donation instruction creates PDA-derived donation record account
   - Stores: donationId, donorIdHash (HMAC-SHA512), ngoId, campaignId, amountPaisa, currency, timestamp, status, recordHash
   - Status values: 0=Initiated, 1=Success, 2=Allocated, 3=Disbursed, 4=Delivered
4. **Frontend Polling**: DonateDialog polls backend every 3s for status update → displays SUCCESS when status changes
5. **Attestation**: 
   - Donor can request RECEIPT or DELIVERY attestation via UI
   - NGO signs attestation (off-chain signature implied)
   - Admin approves attestation
   - Status tracked in Attestation model (PENDING → NGO_SIGNED → APPROVED/REJECTED)

### Multi-Disbursement Workflow (NEW)
1. **Frontend**: NGO views campaign → requests disbursement via DisbursementRequestDialog → enters amount, selects cohort/type → submits
2. **Backend**: 
   - createDisbursement endpoint validates: NGO active, campaign active & owned by NGO, amount positive & ≤ raisedAmount
   - Creates disbursement record in PostgreSQL with PENDING status
   - Creates audit log entry
   - **Currently Missing**: On-chain recording via blockchainService.recordDisbursement()
3. **Database Changes**:
   - Disbursement table stores: id, campaignId, ngoId, cohortId, amountInr, fieldReportUrl, status, disbursementType, timestamps
   - DonationAllocation table (new): Tracks many-to-many relationship between donations and disbursements with allocated amounts
   - Attestation model updated: Includes disbursementId and allocatedAmount fields for precise tracking
4. **Frontend Updates**:
   - DonorDashboard: Shows disbursement tracking per campaign
   - NGODashboard: Shows disbursement management interface
   - AdminPanel: Shows disbursement oversight controls
5. **Attestation Flow**: 
   - Upon disbursement approval, creates RECEIPT attestations for each allocated donation
   - Donor can request DELIVERY attestation to confirm receipt of funds
   - NGO uploads field report proof via ProofUploadDialog
   - Admin approves/rejects attestations

### NGO Workflow (Background)
1. **Registration**: 
   - Frontend: Profile completion (organisationName, etc.)
   - Backend: Profile created with role=CHARITY, ngoStatus=PENDING
   - Admin approval: ngoStatus set to ACTIVE
   - Optional: Blockchain registration via registerNgo instruction (stores ngoId, metadata_hash, status, registered_at)
2. **Campaign Creation**: 
   - Frontend: CreateCampaignDialog
   - Backend: Campaign record created (linked to ngoId)
   - Fields: title, description, targetAmount, raisedAmount, currencyCode, status, beneficiaryIdHash (HMAC-SHA512(walletId, campaignId)), beneficiaryIdEncrypted (AES-256-CBC)
3. **Campaign Management**: 
   - Updates to targetAmount, status, etc.
   - Milestone tracking (via disbursements array - not in schema but referenced in frontend)

### Beneficiary Workflow (Background)
- **Indirect Representation**: Beneficiaries are not direct users; represented through BeneficiaryCohort model
- **Cohort Creation**: 
  - NGO creates cohort linked to campaign
  - Fields: name, beneficiaryCount, description, sha512DocHash (document hash), merkleRoot
  - On-chain: register_cohort instruction creates cohortRecord account
- **Disbursement**: 
  - Backend: Disbursement record created (campaignId, ngoId, cohortId, amountInr, amountSol, status)
  - On-chain: record_disbursement instruction creates disbursementRecord account
  - Stores: disbursementId, ngoId, cohortId, amountPaisa, currency, timestamp, transactionHash, status
- **Attestation**: 
  - Upon disbursement, NGO can upload field report (Document model)
  - Donor can request DELIVERY attestation to confirm beneficiary received funds

### Payment Workflow (Background)
- **Frontend**: DonateDialog calls initiateUpiPayment (mocked 900ms delay, returns fake orderId/paymentId)
- **Backend**: 
  - createRazorpayOrder (mocked) returns order object
  - Razorpay webhook handler (expected) verifies signature → calls completeDonationSuccess
  - completeDonationSuccess: updates donation status, creates attestation, AML check, audit log, receipt queued, blockchain recording
- **Note**: Actual Razorpay integration would replace mockPayments.ts with SDK calls

### NEFT/Disbursement Workflow (Background)
1. **Backend**: 
   - Admin or system approves disbursement (Disbursement status: PENDING → APPROVED)
   - Funds transferred via NEFT (off-chain process)
   - Disbursement status updated to SENT → SETTLED upon confirmation
   - on-chain: record_disbursement called with NEFT transaction hash
2. **Blockchain**: 
   - disbursementRecord account stores disbursement details including transactionHash of off-chain transfer
3. **Attestation**: 
   - NGO uploads field report proof (Document model)
   - Donor can verify via DELIVERY attestation workflow

### Blockchain Workflow (Background)
- **Program ID**: Declared in Anchor.toml and lib.rs
- **Key Instructions**:
  1. record_donation: Creates donationRecord PDA from [b"donation", donation_id]
  2. update_donation_status: Updates status (valid transitions: 1→2→3→4)
  3. register_ngo: Creates ngoRecord PDA from [b"ngo", ngo_id]
  4. register_cohort: Creates cohortRecord PDA from [b"cohort", cohort_id] with ngoRecord constraint
  5. record_disbursement: Creates disbursementRecord PDA from [b"disbursement", disbursement_id] with ngoRecord constraint
- **State Accounts**:
  - DonationRecord: donation_id, donorIdHash, ngoId, campaignId, amount_paisa, currency, timestamp, status, record_hash, bump
  - NgoRecord: ngo_id, status (0=Pending,1=Active,2=Rejected,3=Suspended), metadata_hash, registered_at, bump
  - CohortRecord: cohort_id, ngo_id, sha512DocHash, beneficiaryCount, merkleRoot, createdAt, bump
  - DisbursementRecord (NEW): disbursement_id, ngo_id, cohort_id, amount_paisa, currency, timestamp, transactionHash, status, bump
- **Security**: 
  - All instruction handlers require authority signer (backend wallet)
  - PDA seeds domain-separated (b"donation", b"ngo", etc.)
  - Status transitions validated in update_donation_status
  - Input validation (length checks, amount > 0)
  - **Note on disbursement instruction**: Currently hardcodes status to 2 (Sent) upon creation

### SIEM (Security Information and Event Management) (Background)
- **AuditLog Model**: 
  - id (BigInt autoincrement), actorType (USER/SYSTEM/WEBHOOK/ADMIN), actorId, entityType, entityId, action, metadata (JSON), ipAddress, requestId, govRequestId, createdAt
- **Audit Log Services**: 
  - writeAuditLog function in auditLogService.ts
  - Called from donationService.ts (payment success, AML flag, receipt generation, blockchain recording success/failure)
  - Called from authService.ts (login, logout, etc. - inferred)
  - Called from charity.ts (disbursement creation, proof upload - NEW)
  - Called from admin.ts (NGO/campaign approval, disbursement approval/rejection - NEW)
- **Middleware**: requestLogger.ts logs incoming requests
- **Notes**: Comprehensive audit trail for security monitoring

### Receipt Generation (Background)
- **Backend**: 
  - generateAndStoreReceipt function in receiptService.ts (called from donationService.ts)
  - Creates tax receipt (80G) for successful donations
  - Stores receipt URL in Donation.taxReceiptUrl
  - Sets taxReceiptEmailed flag after sending
  - Audit logs for receipt generation start/failure
- **Frontend**: 
  - DonationHistoryTable shows receipt download option when status=SUCCESS
  - DonateDialog shows download receipt button after payment confirmation

### NGO Credential Validation (Background)
- **Backend**: 
  - NGO registration stores organisationName, registrationNo, PAN hash (panHash in Profile)
  - Verification process implied but not detailed in code (admin approval sets ngoStatus to ACTIVE)
  - Blockchain registration stores metadata_hash (supposed to be hash of verification documents)
- **Frontend**: 
  - Profile completion for NGOs
  - No explicit document upload workflow seen in reviewed components

## Trust Boundaries
```
Browser
  ↓ (HTTPS, JWT in localStorage/sessionStorage - inferred)
Backend (Node.js/Express)
  ↓ (JWT validation, role checks, input validation)
Database (PostgreSQL via Prisma)
  ↓ (SQL queries via ORM)
  ↓ 
Payment Provider (Razorpay)
  ↓ (Webhook signature verification)
  ↓
Blockchain (Solana)
  ↓ (Program authority signer, PDA constraints, input validation)
```
Separate Trust Boundaries:
Frontend ↔ Wallet (Phantom, etc.) for potential future direct blockchain interactions (not currently implemented)
Frontend ↔ Backend (API calls over HTTPS)
Backend ↔ Solana RPC (for blockchain transactions)

## Important Identifiers
- **NGO Id**: Profile.id (UUID) for NGO profiles; used as ngoId foreign key in Campaign, Donation, Disbursement, etc.
- **Campaign Id**: Campaign.id (UUID); references NGO via ngoId; used in Donation.campaignId, Disbursement.campaignId, BeneficiaryCohort.campaignId
- **Donation Id**: Donation.id (UUID); references Donor via donorId, NGO via ngoId; publicId (cuid()) for user-facing reference
- **Disbursement Id (NEW)**: Disbursement.id (UUID); references Campaign via campaignId, NGO via ngoId, BeneficiaryCohort via cohortId
- **Beneficiary Id**: Not stored directly; represented via BeneficiaryCohort.id (UUID); linkage via Campaign.beneficiaryIdHash (HMAC-SHA512(walletId, campaignId)) and beneficiaryIdEncrypted (AES-256-CBC)
- **Payment Id**: 
  - Razorpay: orderId, paymentId (from mock/gateway)
  - Internal: Donation.razorpayOrderId, Donation.razorpayPaymentId
- **Blockchain Transaction Signature**: 
  - Donation.solanaTxHash (string)
  - Disbursement.solanaTxHash (string)
  - Derived from PDA seeds for account lookup
- **Receipt Id**: Implied in Donation.taxReceiptUrl or separate receipt model (not seen)
- **Attestation Id**: Attestation.id (UUID); unique constraint on [donationId, type] prevents duplicate RECEIPT/DELIVERY per donation; now also includes disbursementId
- **Correlation Ids**: 
  - AuditLog.requestId (could correlate frontend/backend actions)
  - GovernmentRequest.requestRef (unique identifier for gov requests)
  - ImpactToken.mintAddress (on-chain token address if minted)

## Security Controls Currently Present
1. **Authentication**: 
   - JWT-based (access token 15m expiry, refresh token 7d expiry)
   - Passwords hashed with bcrypt ( salt=12 )
   - Refresh tokens hashed with bcrypt before DB storage
   - OTP-based email verification during signup
   - Token validation middleware (requireAuth)
2. **Authorization**: 
   - Role-based access control (DONOR, CHARITY, ADMIN, AUDITOR) via requireRole middleware
   - Prisma schema defines role enum and relationships
   - Admin-specific routes (/admin)
   - NGO-specific implied routes (NGO dashboard, campaign management)
3. **Input Validation**: 
   - Blockchain instruction handlers: length checks on strings, amount > 0
   - Backend: Razorpay signature verification (verifyRazorpaySignature)
   - Frontend: Form validation in AuthDialog (required fields), DonateDialog (amount > 0), DisbursementRequestDialog (amount > 0 and ≤ raisedAmount)
   - Prisma schema: field types, lengths, uniqueness (e.g., slug @unique, publicId @unique)
4. **Cryptography**: 
   - HMAC-SHA512 for donor ID hashing on-chain (donorIdHash)
   - HMAC-SHA512 for record hash (record_hash = sha512(donationId|amountPaisa|timestamp|ngoId|donorIdHash))
   - AES-256-CBC for beneficiary ID encryption (beneficiaryIdEncrypted)
   - SHA-512 for document hashing (Document.sha512Hash)
   - Environment variables for secrets (JWT secrets, Razorpay key, blockchain HMAC secret)
5. **Audit Logging**: 
   - Comprehensive AuditLog model capturing actor, entity, action, metadata
   - Automatic logging for key events (payment success, AML flag, receipt generation, blockchain ops, disbursement creation/proof upload)
   - Request logging middleware
6. **Idempotency Protection**: 
   - Blockchain service checks if donationRecord account already exists before creating
   - Attestation model has unique constraint on [donationId, type]
   - **Note**: No explicit idempotency protection for disbursement creation or proof upload
7. **Transport Security**: 
   - HTTPS implied (standard for web applications)
   - WSS not observed (no websockets in reviewed code)
8. **Session Management**: 
   - Short-lived access tokens (15m)
   - Refresh token rotation on use
   - Logout invalidates refresh token hash
9. **Dependency Management**: 
   - package-lock.json and Cargo.lock for version pinning
   - No evidence of automatic vulnerability scanning
10. **Error Handling**: 
    - Centralized error handling middleware (errorHandler.ts)
    - Try/catch blocks in service layer
    - Blockchain service distinguishes "already in use" as idempotent success
11. **Secure Defaults**: 
    - Status fields default to initial states (DRAFT, PENDING, INITIATED, etc.)
    - Boolean fields default to secure values (isVerified: false, legalHold: false)
    - Enum values prevent invalid states

## Known Findings

### From Audit 1 (system_audit_1.md) - Status Updated Based on Audit 2 Findings
| Finding ID | Title | Area | Severity | Original Status | Current Status | Notes |
|------------|-------|------|----------|-----------------|----------------|-------|
| BLC-001 | Missing authority check in `record_donation` instruction | Blockchain | HIGH | OPEN | OPEN | No changes to donation instruction |
| BLC-002 | Missing validation of `donation_id` uniqueness in PDA derivation | Blockchain | MEDIUM | OPEN | OPEN | No changes to donation instruction |
| BLC-003 | Status transition validation does not prevent replay of same transition | Blockchain | LOW | OPEN | OPEN | No changes to status update instruction |
| BLC-004 | Missing validation of `amount_paisa` overflow in `record_donation` | Blockchain | MEDIUM | OPEN | OPEN | No changes to donation instruction |
| FNT-001 | Missing role-based route protection in frontend | Frontend | MEDIUM | OPEN | OPEN | No route guards added |
| FNT-002 | Client-side donation amount can be manipulated before API call | Frontend | MEDIUM | OPEN | OPEN | Frontend still trusts user input |
| FNT-003 | Missing PKCE in implicit flow or missing token storage best practices | Frontend | LOW | OPEN | OPEN CONFIDENCE LOW | No changes to auth storage |
| BKD-001 | Missing validation of donation amount in `create` endpoint | Backend | HIGH | OPEN | FIXED (for disbursements) | Disbursement endpoint has proper validation |
| BKD-002 | Missing idempotency key enforcement in Razorpay webhook handling | Backend | MEDIUM | OPEN | OPEN (webhooks), NEW (disbursements) | Webhooks unchanged, disbursements missing |
| BKD-003 | Missing role check on NGO creation/update endpoints | Backend | MEDIUM | OPEN | OPEN | NGO endpoints unchanged |
| XSS-001 | Frontend trusts backend donation status without re-verifying on-chain | Cross-System | MEDIUM | OPEN | OPEN | No on-chain verification added |
| XSS-002 | Beneficiary ID handling may allow substitution if backend validation missing | Cross-System | HIGH | OPEN | POTENTIALLY IMPROVED | Disbursement flow uses cohortId with stronger validation |
| FBG-001 | Inconsistent state between frontend donation store and backend API | Functional Bug | LOW | OPEN | OPEN | State inconsistency possible |
| FBG-002 | Missing validation of duplicate attestation creation | Functional Bug | LOW | OPEN | OPEN | Unique constraint exists but may have gaps |

### New Findings from Audit 2 (system_audit_2.md)
| Finding ID | Title | Area | Severity | Status | Confidence |
|------------|-------|------|----------|--------|------------|
| DSB-001 | Missing blockchain integration in disbursement creation | Backend/Blockchain | HIGH | NEW | CONFIRMED |
| DSB-002 | Missing blockchain integration in proof upload | Backend/Blockchain | MEDIUM | NEW | CONFIRMED |
| DSB-003 | Missing idempotency protection in disbursement endpoints | Backend | MEDIUM | NEW | CONFIRMED |
| DSB-004 | Race condition between DB and blockchain operations | Backend/Blockchain | MEDIUM | NEW | CONFIRMED |
| DSB-005 | Missing on-chain status transition support | Blockchain | LOW | NEW | CONFIRMED |
| DSB-006 | Incomplete NGO status validation in service | Backend | MEDIUM | NEW | CONFIRMED |
| DSB-007 | Missing timestamp validation for replay attack protection | Backend/Blockchain | LOW | NEW | CONFIRMED |
| DSB-008 | Missing compensation logic for blockchain failures | Backend/Blockchain | MEDIUM | NEW | CONFIRMED |

## Compliance Baseline

### ISO/IEC 27001 
- **Implemented**: A.5.1.1 (security policies evidenced), A.12.4.1 (event logging), A.9.4.1 (access restriction via middleware)
- **Partially Implemented**: A.9.1.2 (access control policy), A.10.1.1 (cryptography - key management not verified), A.8.2.1 (classification - some sensitivity marking)
- **Not Verifiable**: Organizational controls, supplier relationships, physical security, compliance audits

### DPDP Act 2023
- **Implemented**: Purpose limitation (data used for stated donation workflow)
- **Partially Implemented**: Data minimization (hashes used on-chain, but raw PII stored in DB), Security safeguards (hashing, env secrets - verification needed)
- **Unable to Verify**: Notice/consent mechanisms, data retention/deletion, third-party processor agreements, international transfer adequacy

### OWASP Top 10
- **Potentially Vulnerable**: A01:2021 (Broken Access Control - missing frontend route protection, backend role checks needed), A06:2021 (Vulnerable Components - dependency risks)
- **Implemented**: A09:2021 (Security Logging and Monitoring)
- **Likely Safe**: A02, A03, A05, A07, A10 (based on code inspection)
- **Unable to Verify**: A04 (Insecure Design), API-specific findings requiring deeper inspection

### OWASP API Security Top 10
- **Partially Implemented**: API5:2023 (Broken Function Level Authorization - middleware present, needs verification of application)
- **Unable to Verify**: Most API-specific findings requiring route and controller inspection

## Previously Investigated Areas
- **Blockchain Program Structure**: Instruction handlers, account constraints, PDA derivations, signer requirements, state transitions, error handling
- **Frontend Routing and Components**: App.tsx, page components, key dialogs (AuthDialog, DonateDialog, attestation dialogs), stores, hooks
- **Backend Services and Routes**: Auth service, donation service, blockchain service, middleware structure, Prisma schema models
- **Cross-Component Workflows**: Donation flow (frontend → backend → blockchain), NGO workflow, attestation system
- **Configuration Files**: Anchor.toml, .env.example, package.json, Cargo.toml
- **Documentation**: CLAUDE.md, security_docs/, various implementation markdown files

## Audit Limitations
1. **Environment Dependencies**: 
   - Unable to verify actual environment variables (JWT secrets, Razorpay keys, blockchain RPC URLs, HMAC secrets)
   - No access to running instance to confirm middleware application or runtime behavior
2. **Dependency Vulnerability Scanning**: 
   - Could not run `npm audit` or `cargo audit` to check for known vulnerable dependencies
   - Relied on manual inspection of package-lock.json and Cargo.lock for version awareness only
3. **Middleware Application**: 
   - Saw middleware definitions (requireAuth, requireRole etc.) but could not verify which routes they are applied to
4. **Third-Party Integrations**: 
   - Razorpay integration is mocked; could not verify actual webhook endpoint implementation
   - Email service is mock; actual OTP delivery mechanism not verified
   - Blockchain connection to devnet/localnet assumed but not verified
5. **Data Flows at Scale**: 
   - Could not test concurrent access, race conditions under load, or performance characteristics
   - Relied on code inspection for potential concurrency issues
6. **Error Path Exhaustiveness**: 
   - Could not trigger all error conditions to verify handling and logging
   - Relied on static analysis of try/catch blocks and error propagation
7. **Frontend-Backend Contract**: 
   - Inferred API endpoints from service usage but could not verify exact request/responses schemas
   - TypeScript interfaces provide guidance but may not match runtime reality
8. **Blockchain Deployment**: 
   - Could not verify actual program deployment on devnet/mainnet or account initialization parameters
   - Relies on Anchor.toml for configuration but cannot confirm active program state
9. **Logging Effectiveness**: 
   - Could not review actual audit logs to verify completeness and usefulness for security monitoring
   - Relied on inspection of auditLogService.ts and AuditLog model
10. **Privacy Mechanism Verification**: 
    - Could not verify actual implementation of data subject rights requests, consent withdrawal, or data deletion procedures
    - Relied on code inspection for data minimization techniques (hashing, encryption)
11. **Test Coverage**: 
    - No test framework configured (per CLAUDE.md); could not verify automated test coverage or CI/CD pipelines