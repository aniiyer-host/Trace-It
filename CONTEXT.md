# Trace-It --- Project Context and Handoff

*Last updated: 15 October 2026*

This document is a practical handoff for future ChatGPT/coding-agent
sessions. Read it before making changes. It summarizes project goals,
architecture, user preferences, safety constraints, recent fixes, known
limitations, and the current unfinished issue. Treat current repository
code and database state as authoritative when they conflict with this
historical summary.

## 1. Project overview

**Trace-It** is a blockchain-based donation transparency platform for
Indian charities and donors. The goal is to make donation flows
auditable from payment through allocation, proof/attestation, and
beneficiary impact. It also helps donors discover campaigns and provides
a trustworthy place to donate.

Core principles: - Transparency must be evidence-based. Never show a
successful payment, transfer, attestation, or blockchain anchor unless
the relevant state and verification support it. - Distinguish
application-persisted status from independent provider/on-chain
verification. - Keep beneficiary private information private. - Preserve
historical records; do not make old records appear valid by rewriting
evidence. - Avoid broad refactors when a focused fix is sufficient.

## 2. Stack and repository

-   Repository: `~/Trace-It` (Linux/WSL path reported as
    `/home/aarus/Trace-It`)
-   Backend: Node.js, TypeScript, Express, Prisma, PostgreSQL; Jest
    tests.
-   Frontend: React 19, TypeScript, Vite, Tailwind CSS, shadcn/ui,
    Zustand, Axios via `apiClient.ts`.
-   Framer Motion is used on campaign views; GSAP is used on the
    homepage.
-   Backend dev command previously reported: `npm run dev` →
    `tsx watch src/index.ts` (check current package scripts).
-   Backend typecheck previously: `tsc --noEmit`.
-   Prisma seed command previously: `tsx prisma/seed.ts` /
    `npm run db:seed` (DO NOT run against protected DB).
-   CI branch noted in earlier work: `Aarush-system`; verify current
    branch/status before acting.
-   MinIO AIStor was used for private proof storage in local testing;
    bucket should remain private.

Always inspect the actual repository and `git status` before editing.
Paths, line numbers, scripts, and configuration may have changed since
this handoff.

## 3. User workflow and coding preferences

-   Make small, controlled, focused changes; one issue group at a time.
-   Inspect the actual ZIP/repository before proposing exact snippets or
    line locations.
-   Prefer targeted code snippets and precise file/section instructions
    over replacing whole files.
-   Do not give broad refactoring plans when a focused change will solve
    the issue.
-   The user has limited coding-agent credits. When asked for a
    coding-agent prompt, make it direct, efficient, and ask the agent to
    diagnose, implement, and test in one pass.
-   Preserve all existing work and uncommitted diffs. Never reset,
    revert, overwrite, or discard unrelated changes.
-   Do not commit, push, deploy, or change production configuration
    without explicit permission.
-   Be clear about what was tested versus what is merely inferred. Do
    not claim completion from compilation alone.

## 4. Safety and database rules --- critical

-   The protected application database is named `TraceIt`. **Never
    reset, drop, truncate, reseed, or run destructive test setup against
    it.**
-   Never run Prisma reset/seed or migrations against `TraceIt` during
    debugging unless the user explicitly authorizes a specific safe
    migration; default is to avoid it.
-   Before any database write or test setup, identify and verify the
    database target. Use a disposable database for database-writing
    tests.
-   Read-only inspection of real records is permitted when needed for
    diagnosis.
-   Never create fake successful payment, payout, disbursement, proof,
    provenance, or blockchain records to satisfy a test or UI.
-   Razorpay Test Mode only. No live payments or payouts.
-   Solana Devnet only. Verify network/program configuration and current
    state before transactions. Do not create a new on-chain transaction
    without explicit authorization.
-   Never expose `.env` contents, SMTP/app passwords, API keys, or
    wallet keypairs. Do not put secrets in logs or context files.
-   Email tests should use a verified controlled inbox only. Never send
    to placeholders. Avoid blind retries where a previous SMTP
    submission may have succeeded but its acknowledgement timed out.
-   Workers should remain disabled by default and only be enabled in a
    verified nonprotected environment for tests.
-   Preserve existing records and audit trails. If a historical
    blockchain signature is wrong, do not silently overwrite it;
    reconcile explicitly.

## 5. Design system / frontend direction

The design direction is called **LIVING TRUST**: - Calm, credible,
institutional, trusted-financial-product feel. - Warm off-white light
theme; deep navy/charcoal dark theme. - Deep trustworthy blue is
structural, but the user has wanted to remove the existing blue button
colors in favor of chosen palette accents. - Verified green should be
reserved for attested/completed states. - Use design tokens such as
`bg-primary`, `bg-foreground`, `text-muted-foreground`; avoid hardcoded
hex. - No glassmorphism (`backdrop-blur`, translucent glass cards) and
no decorative gradients. - Minimal, distinctive logo/badge style. User
preferred simple wing/feather direction over repeated leaf motifs; avoid
realistic feather/leaf illustrations.

## 6. Beneficiary identity and privacy

Recent intended behavior: - NGO campaign creation collects beneficiary
name, private assistance reason, and PAN. - Backend normalizes/validates
PAN and derives a stable campaign-scoped HMAC-SHA-256 Beneficiary ID. Do
not use a plain unkeyed hash or wallet address as the ID. - PAN must
never be stored, logged, exposed via API, or written on-chain. - New
campaign beneficiary name/reason are encrypted using AES-256-GCM. HMAC
secret and encryption key remain server-side; production configuration
requires stable `BENEFICIARY_HMAC_SECRET` and `AES_BENEFICIARY_KEY`. -
Authorized NGO/admin responses may decrypt beneficiary details. Public
responses must exclude details, hash/ciphertext, and verification
material. - Delivery attestation verifies campaign-specific Beneficiary
ID; NGO submission remains `ACTIVE`. - Migration
`20261015143000_encrypt_campaign_beneficiary_details` adds encrypted
columns but does not backfill legacy plaintext rows. Legacy IDs may fail
new campaign-bound verification. A reviewed key-aware backfill or
re-enrollment may be needed before production. - The active anchor
program/IDL commits provenance roots and does not carry beneficiary
identity. Do not change the program/IDL for Beneficiary ID unless a real
consuming instruction requires it.

## 7. Blockchain anchoring and verification

### Environment and safety

-   Solana **Devnet only**. Configured program ID reported:
    `3CLytt82BKNwqMQA7M9fqJrMAhgD5t9dpuDC4TwutVFa`. Verify in current
    config before relying on it.
-   A wallet keypair path was previously configured under
    `/home/aarus/.config/solana/`; never print, expose, or copy keypair
    contents.
-   Do not submit synthetic fixtures as actual app workflow. Do not
    create new Devnet transactions without checking state/config and
    obtaining authorization.

### Earlier reliability fixes

-   An anchor lease bug came from comparing timezone-naive
    `claimExpiresAt` to timezone-aware PostgreSQL `CURRENT_TIMESTAMP`
    under `Asia/Calcutta`, making fresh leases look expired. UTC
    comparison was fixed.
-   Ambiguous submissions remain in reconciliation; generic submission
    RPC failures and repeated account absence must not be retried
    through a path that could broadcast duplicates.
-   Selected-run persistence errors should be visible with sanitized
    diagnostics, not falsely reported as handled.
-   Solana WebSocket `confirmTransaction` was replaced by bounded HTTP
    status polling in
    `backend/src/services/anchor/solanaAnchorAdapter.ts`.
-   Five Anchor `.rpc()` calls in
    `backend/src/services/blockchainService.ts` were replaced with
    signed transaction + bounded HTTP polling.
-   `backend/src/services/solanaRpc.ts` disables web3.js fixed 429 retry
    loops and uses bounded jittered retries respecting `Retry-After`.
-   No runtime `.rpc()` or `confirmTransaction()` calls remained after
    that pass, according to the agent report. Verify current source
    before relying on this.
-   Public Solana Devnet may rate-limit. Do not attribute all 429s to
    one cause without evidence.

### Transaction verification regression and fix

-   The UI had reported `DONATION_SUCCESS` and `DONATION_ALLOCATED` with
    provenance hashes, batch root, and on-chain anchor record passing,
    but transaction verification failing: "The finalized transaction
    does not contain the expected anchor instruction."
-   Root cause reported by the latest agent: raw bytes in Solana
    compiled instruction data were treated as base58 text.
-   The verifier was updated to handle raw bytes and versioned
    transaction lookup-table addresses, checking signature, program,
    accounts, authority, and exact batch instruction data.
-   The 12 most recent confirmed batches, including `DONATION_SUCCESS`
    and `DONATION_ALLOCATED`, reportedly passed transaction, on-chain
    record, and batch-root checks against finalized Devnet.
-   No new blockchain transaction was submitted during that
    verification; no record in that checked set needed reconciliation.
-   Attestation signature remains **Unavailable** because the
    application has no cryptographic signature field/verifier. Do not
    claim signature verification.
-   Latest relevant file:
    `backend/src/services/integrity/donationAnchorVerification.ts`.
-   Historical note: one earlier synthetic Devnet smoke fixture matched
    finalized transaction/account/root/sequence/count/schema/authority
    but was not proof of an actual app donation anchor. Never claim it
    was.

## 8. Disbursements and repeat requests

### Intended semantics

-   Existing statuses include `APPROVED`, `SENT`, and `SETTLED`.
-   Admin "mark settled" was originally a manual override before payout
    provider integration.
-   The five-second feature now uses manual transfer confirmation:
    1.  Authorized admin verifies an external/manual transfer actually
        occurred.
    2.  Admin confirms it in the application.
    3.  Backend persists status `SENT` and `settlementDueAt` about five
        seconds later.
    4.  An opt-in backend worker conditionally updates due records to
        `SETTLED` and writes one audit event.
    5.  NGO/donor views show awaiting transfer for `SENT`, and "Funds
        Transferred Successfully" for `SETTLED`.
-   `SETTLED` means admin manual confirmation plus the configured delay.
    It is **not** proof of a bank transfer or a Razorpay payout.
-   Frontend must not use a timer to declare success. Backend/database
    is authoritative.
-   Worker env flag:
    `TRACEIT_DISBURSEMENT_SETTLEMENT_WORKER_ENABLED=false` by default.
    Never enable it while pointing at protected `TraceIt`.
-   Worker was tested against a disposable DB and reportedly moved the
    same record to `SETTLED` after the delay. Worker tests were also
    reported as 3 passing, database-free.
-   Local backend was found not running at one point, and local
    configuration pointed to protected `TraceIt` with worker disabled.
    The UI therefore could not advance until an authorized admin
    confirmation was recorded and the worker was running in a safe
    environment.
-   In one inspected real/current record, status was `APPROVED`,
    `settlementDueAt` was null, and no manual transfer-confirmation
    audit event existed. Thus no countdown had started. Admin panel
    lacked a confirmation control; a new admin queue/control was added,
    with explicit warning to use only after verifying an external manual
    transfer.
-   NGO and donor dashboards now reportedly refresh every five seconds
    while a disbursement is `APPROVED` or `SENT`, then stop at terminal
    state. Check current code.
-   Do not integrate or claim Razorpay payouts. No payout provider
    integration exists.

### Repeat disbursement requests

-   A prior issue was that the server lacked a proper
    outstanding-request/remaining-funds guard, while the UI could hide
    request actions for allocated milestones.
-   Reported fix: requests serialized per campaign; duplicates rejected
    while a request is pending, approved, or awaiting transfer; eligible
    funds account for prior requests; UI explains restrictions and
    recalculates eligible funds.
-   A subsequent request is allowed after the previous request reaches
    its legitimate terminal state, if eligible funds remain.
-   Server must retain authorization, ownership, amount,
    remaining-funds, duplicate and concurrency checks.
-   The UI should explain why a request is unavailable rather than
    silently hide it.

## 9. Email delivery --- recently working, but preserve protections

### Configuration

-   Gmail SMTP is used.
-   `GMAIL_USER` should be the authenticating Gmail account,
    e.g. `aarush2975@gmail.com`.
-   `EMAIL_FROM` should usually be the sender address, also
    `aarush2975@gmail.com`; `smtp.gmail.com` is the SMTP hostname, not
    an email address.
-   Gmail App Password must be configured as `GMAIL_APP_PASSWORD` and
    never printed.
-   The latest provider configuration uses port `587` with required
    STARTTLS. Verify the actual environment variable names in
    `backend/src/services/.../gmailSmtpProvider.ts` before editing env
    settings.
-   A safe probe reportedly resolved DNS, connected on port 587,
    received SMTP greeting, and completed TLS 1.3 STARTTLS. SMTP
    authentication and submission were not tested during that probe.
-   User subsequently reported email finally worked. Preserve working
    configuration; do not change SMTP settings unless a new failure is
    demonstrated.

### Email reliability fixes

-   Shared recipient validation and early diagnostic rejection were
    added at enqueue, worker, and provider boundaries:
    -   `recipientValidation.ts`
    -   `notificationService.ts`
    -   `emailOutboxProcessor.ts`
    -   `gmailSmtpProvider.ts`
-   Gmail provider moved to port 587 with STARTTLS.
-   Network failures before connection remain retryable within existing
    eight-attempt limit.
-   A timeout during SMTP `DATA` without final server response is
    treated as ambiguous and is not automatically retried, to avoid
    duplicate emails.
-   Placeholder recipient addresses are rejected before sending. Do not
    weaken this guard.
-   Earlier placeholder addresses included reserved example domains and
    seed defaults such as `traceit.dev`. Current database inspection
    found no placeholder outbox recipients/profile domains at that time;
    historical log rows could not be tied to current records.
-   Existing failed rows had reached attempt 8 with `ETIMEDOUT`,
    `CONNECT_TIMEOUT`, command `CONN`; the old Gmail config selected
    port 465 and TCP timed out. Port 587 STARTTLS path worked in safe
    connectivity probe.
-   The "Bounded run finished after 10 job(s)" log indicates the
    configured job cap, not necessarily successful delivery.
-   No rows were reset/requeued/resubmitted during the investigation.
    Historical delivery of those failed jobs remained unconfirmed;
    latest user says email now works.
-   Do not retry an ambiguous submission blindly. Use a verified
    controlled inbox for tests only. Keep worker disabled by default
    unless the intended environment is verified.
-   Registration OTP is currently a stub; there was no campaign email
    flow at the time of investigation.

## 10. Current unfinished issue --- bank-transfer review tests

Latest test summary: - Test suites: 39 passed, 1 skipped, 1 failed (41
total). - Tests: 308 passed, 3 failed, 4 skipped (315 total). - All
three failures are in `tests/bankTransferService.test.ts`.

Failing cases: 1.
`records approval, provenance, audit, and one donor email with careful attribution` -
Expected `harness.outboxRows` length 1; received 0. 2.
`makes repeated and concurrent approval requests one logical email event` -
Expected one outbox row; received 0. 3.
`rolls back approval when the transactional outbox insert fails` -
Expected `reviewBankTransfer(..., 'APPROVE', ..., harness.database)` to
reject with `outbox write failed`; it resolved with status `APPROVED`.

Likely investigation area: - `reviewBankTransfer` in bank transfer
service. - Transactional outbox enqueue helper and recent recipient
validation. - `makeReviewDatabase` test harness / mock transaction
behavior. - Test fixture recipient is `donor@example.org`; check whether
current validation intentionally rejects reserved example domains. Do
not weaken production validation just to pass tests; adjust fixtures if
appropriate. - Verify approval inserts exactly one correctly attributed
outbox event: `BENEFICIARY_TRANSFER_REVIEWED:${transfer.id}` with
milestone `BENEFICIARY_TRANSFER_REVIEWED`. - Repeated/concurrent
approvals must not create duplicate logical email events. - If
transactional outbox insert fails, approval must roll back to
`SUBMITTED`; do not swallow the error. - Preserve provenance and audit
behavior. - Do not alter Gmail transport settings to fix these tests;
email delivery itself is reported working. - Focused test command
previously suggested:
`cd ~/Trace-It/backend && npx jest tests/bankTransferService.test.ts --runInBand` -
The user has **no coding-agent credits left**. Prefer helping them
inspect/fix this manually when they ask; do not assume they can launch
an agent.

## 11. Other historical project notes

### Seed and donor KYC

-   User chose feature order 3 → 2 → 1 in an earlier workflow.
-   `prisma/seed.ts` task completed; one-time full-file replacement was
    explicitly allowed then.
-   Donor KYC task: optional PAN and UI text "For donations over
    ₹10,000"; PAN hashed, not on-chain; frontend has no `apiService.ts`.
-   CI KYC HMAC vars were present. Typecheck passed after that task.

### CI / frontend quality

-   Earlier CI had no frontend typecheck script.
-   Build errors previously included unused imports/props in
    `DonationHistoryTable`, `DonorDashboard`.
-   Lint reported \~88 issues (`no-explicit-any`, React Compiler /
    `react-hooks/set-state-in-effect`, `ban-ts-comment`); these were
    historical and may have changed.
-   Fix incrementally; do not attempt broad lint cleanup without
    request.

### Anchor retry history

-   Earlier worker target UUID: `76416616-7eb0-40bd-a8c1-d455d19f9566`;
    events 19--38; root and batch key were recorded in prior handoff,
    but should not be reused blindly.
-   Earlier `BlockchainService` issues included missing
    `SOLANA_WALLET_KEYPAIR_PATH`, undefined program ID / `PublicKey`
    errors, Prisma retry validation, and RPC 429s. These may be
    resolved; inspect current code and state before reopening.

### Local test DBs created in earlier work

These were disposable test DBs used in prior reports. Do not assume they
still exist or are safe without verifying current config: -
`traceit_live_api_20261015_4d8c1a77` -
`traceit_anchor_test_20261015_4d8c1a77` -
`traceit_reliability_e2e_20261015_8ce5869b` -
`traceit_reliability_workflow_20261015_5bdb8765` -
`traceit_anchor_test_20261015_a1faafce` -
`traceit_anchor_test_seedverify_20261015` (ownership/safety uncertain;
do not reset)

## 12. Current status and next steps

User says email now works, and major disbursement and blockchain
workflows have been fixed according to agent reports. The immediate
outstanding task is the three bank-transfer review tests. No
coding-agent credits remain, so do not suggest another agent run as the
default.

Recommended next manual steps: 1. Inspect `git status` and preserve all
diffs. 2. Read the implementation of `reviewBankTransfer`, its
notification/outbox helper, and `tests/bankTransferService.test.ts` /
`makeReviewDatabase`. 3. Check if `donor@example.org` is intentionally
rejected by shared recipient validation. Use a clearly valid, controlled
test address in the test fixture if the validator is correct. 4. Ensure
the service performs the outbox insert inside the same transaction and
propagates failures, so approval rolls back. 5. Run only
`npx jest tests/bankTransferService.test.ts --runInBand` after a focused
fix, then the full suite when practical. 6. Never use the protected
database for destructive test setup.

Remember: current source, live config, and actual test output override
this handoff. Do not infer success or safety from this document alone.
