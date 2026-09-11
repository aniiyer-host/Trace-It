# Backend Work Summary: RBAC Fix + Attestation/Milestone Routes

**Scope:** Backend only. Frontend (`apiClient.ts` and related components) was intentionally left untouched and is tracked separately.

---

## 1. Context: what this work started from

`backend_handoff_notes.md` listed a set of API routes the frontend expected but the backend didn't have (NGO attestations, milestone proof/approve/reject, admin attestation/milestone queues, donor attestation routes).

During implementation, a review of `backend/src/routes/charity.ts` turned up a separate, more serious issue: **every route in that file was missing role-based access control.** The file called `requireAuth` but never `requireRole`, meaning any authenticated user — regardless of role — could call NGO-only endpoints (`/onboard`, `/campaigns`, `/disburse`, `/reports/fcra`, `/reports/80g`, etc.). This contradicted `security_docs/SECURITY.md`, which claimed role escalation was blocked and "verified." It wasn't — the existing test suite (`charity.test.ts`) actually asserted the vulnerable behavior as correct (a `DONOR`-role user successfully calling an NGO route and getting `200`).

Fixing this was treated as priority work ahead of the missing routes, since it was a live gap rather than a missing feature.

---

## 2. RBAC fix (`charity.ts`)

- Added `requireRole(UserRole.CHARITY)` to every route in `charity.ts`, positioned correctly **between** `requireAuth` and the handler (an early version of this fix had the arguments in the wrong order, which silently no-op'd the check since the handler ran and responded before `requireRole` ever executed — fixed).
- **`POST /onboard` is the one intentional exception** — it has no role guard, only `requireAuth`. This is the self-service "apply to become an NGO" entry point; gating it behind `requireRole(CHARITY)` would make it impossible for any `DONOR` to ever apply in the first place.
- **`GET /documents/:id/verify` was restored to fully public** (no `requireAuth`, no `requireRole`) — it's a hash-verification endpoint in the same spirit as the public campaign-verification routes, and was incorrectly locked down during the first pass.
- **Role assignment mechanism:** previously, nothing in the codebase ever set a profile's `role` to `CHARITY` — `admin.ts`'s `approveNgo` assumed the role was already `CHARITY` but nothing produced that state. Fixed by having `onboardNgo` set `role: UserRole.CHARITY` (in addition to its existing `ngoStatus: PENDING` behavior) when a user applies. Admin approval (`approveNgo`) still separately flips `ngoStatus: PENDING → ACTIVE` — role and approval status are deliberately two separate gates (identity vs. vetting).
- Signup itself was **not** changed to accept a `role` field. A single generic signup flow was kept, with NGO status being something any account can apply for afterward via `/onboard` — this matches what the rest of the codebase (`approveNgo`, `getNgos`) already assumed.

**Test coverage added:** `charity.test.ts` now includes a `describe("Charity API Role Enforcement", ...)` block with two isolated donor fixtures (one that onboards, one that stays a plain `DONOR` for the whole block) verifying:

- a `DONOR` can call `/onboard` and comes out with `role: CHARITY`
- a `DONOR` who has _not_ onboarded gets `403` from `/campaigns`, `/documents`, `/documents/upload`, `/reports/fcra`

**Also fixed:** `e2e.test.ts` had a test (`"should return empty campaigns list for non-NGO users"`) that explicitly asserted the old vulnerable behavior (donor hits `/charity/campaigns`, expects `200` + empty array). Updated to expect `403`.

---

## 3. Schema additions (Prisma)

Two gaps existed: the frontend expected `Attestation` and `Milestone` concepts that had no backing database model at all.

**Decision: `Milestone` was not given a new model.** It maps closely enough to the existing `Disbursement` model (which already had `fieldReportUrl` for proof and a `status` field) that a parallel model would have meant two competing approval workflows. Extended `Disbursement` instead:

```prisma
enum DisbursementStatus {
  PENDING
  APPROVED
  SENT
  SETTLED
  FAILED
  REJECTED   // new — distinct from FAILED, which means a payment/blockchain failure, not an admin rejection
}

model Disbursement {
  // ...existing fields...
  proofSubmittedAt DateTime?   // new — set when the NGO uploads proof post-creation
  rejectionReason  String?     // new — set by admin on reject
}
```

**`Attestation` is a genuinely new model** — nothing existing covered it:

```prisma
enum AttestationType {
  RECEIPT
  DELIVERY
}

enum AttestationStatus {
  PENDING
  NGO_SIGNED
  APPROVED
  REJECTED
}

model Attestation {
  id              String            @id @default(uuid())
  donationId      String
  type            AttestationType
  status          AttestationStatus @default(PENDING)
  requestedBy     String            // donor's profile id
  ngoSignedBy     String?
  ngoSignedAt     DateTime?
  approvedBy      String?
  approvedAt      DateTime?
  rejectionReason String?
  createdAt       DateTime          @default(now())
  updatedAt       DateTime          @updatedAt

  donation Donation @relation(fields: [donationId], references: [id])

  @@unique([donationId, type])   // max one RECEIPT + one DELIVERY attestation per donation
  @@index([donationId])
  @@index([status])
  @@map("attestations")
}
```

Plus a back-relation added to `Donation`: `attestations Attestation[]`.

Migration applied: `npx prisma migrate dev --name add_attestation_and_disbursement_milestone_fields`.

---

## 4. New route handlers

### `donor.ts` (donor requests/views attestations)

- `GET /donor/donations/:id/attestation` — lists attestations for a donation, ownership-checked (`donorId === req.user.id`).
- `POST /donor/donations/:id/attestation` — creates an attestation request (`type: receipt | delivery`, normalized to uppercase). Relies on the `@@unique([donationId, type])` constraint to reject duplicate requests (`409`).

### `charity.ts` (NGO signs attestations, uploads milestone proof)

- `GET /charity/attestations/pending` — attestations awaiting this NGO's signature, scoped via `donation.ngoId`.
- `POST /charity/attestations` — NGO signs off (`PENDING → NGO_SIGNED`). Ownership-checked against the donation before touching the attestation; a mismatched NGO gets `404`, not `403` (avoids confirming the record's existence to an unrelated party — same pattern already used elsewhere in this codebase, e.g. `getDonorReceipt`).
- `POST /charity/disburse/:id/proof` — NGO uploads proof for a milestone (a `Disbursement` row). File upload via the existing `multer`/`uploadSingle` pattern (field name `file`), creates a `Document` row (`DocumentType.FIELD_REPORT`), sets `proofSubmittedAt` + `fieldReportUrl`. Ownership-checked (`ngoId === req.user.id`) and requires `ngoStatus === ACTIVE`.

### `admin.ts` (admin reviews both)

- `GET /admin/attestations/pending` — attestations in `NGO_SIGNED` status.
- `POST /admin/attestations/:attestationId/approve` — `NGO_SIGNED → APPROVED`.
- `POST /admin/attestations/:attestationId/reject` — requires `{ reason }`, sets `REJECTED` + `rejectionReason`. Blocked if already `APPROVED`.
- `GET /admin/milestones/pending` — disbursements with `status: PENDING` and `proofSubmittedAt` set.
- `POST /admin/milestones/:id/approve` — **reuses the existing `approveDisbursement` handler** rather than duplicating logic (per the handoff notes' own suggestion that this "could be merged with the Admin approve route").
- `POST /admin/milestones/:id/reject` — new `rejectDisbursement` handler, requires `{ reason }`, sets `DisbursementStatus.REJECTED` + `rejectionReason`.

All new admin routes follow the existing `requireAuth, requireRole(UserRole.ADMIN)` pattern; all new charity routes follow `requireAuth, requireRole(UserRole.CHARITY)`; all new donor routes follow the existing `requireRole(UserRole.DONOR)` pattern (router-level `requireAuth` already applied in `donor.ts`).

**Test coverage added:** new file `backend/tests/attestation.test.ts` (17 tests), covering the full donor → NGO → admin flow for both attestations and milestones, plus:

- RBAC checks (e.g., a `DONOR` cannot approve, a `CHARITY` cannot reject a milestone)
- **ownership/IDOR checks** — a second, unrelated NGO fixture is used specifically to confirm it cannot sign another NGO's attestation or upload proof for another NGO's disbursement (gets `404`, matching the "don't confirm existence" pattern)
- state-machine checks (can't re-sign an already-signed attestation, can't reject an already-approved one, can't approve a rejected milestone)

All 17 pass; full existing suite passes after the `e2e.test.ts` fix noted above.

---

## 5. Known backlog (not done, flagged for a decision)

- **`UserRole.AUDITOR` is unused.** It exists in the schema but no route references it. Left as-is pending a product decision: either wire it to read-only access on `/admin/audit-logs` and `/admin/government-requests`, or remove it from the enum if it's not planned.

## 6. Explicitly out of scope for this round

- `frontend/src/utils/apiClient.ts` still points at the old/incorrect paths (`/ngos/...`, root `/milestones/...`, root `/attestations/...`, `/donations/user/:userId`) and one call site (`ProofUploadDialog.tsx`) sends JSON where the backend now expects a real file upload. None of this affects backend correctness or security — the backend independently enforces RBAC and ownership regardless of what the frontend sends — but the frontend will get `404`s/`403`s against several of these endpoints until it's updated separately.
- A UI issue was also spotted in passing: `NGODashboard.tsx` has a button that calls the milestone-approve endpoint directly from the NGO's own dashboard. The backend correctly rejects this (`403`, admin-only), so there's no security exposure, but the button is misleading in its current form and should probably be removed or reworked.
