# Post-Evaluation Bugs

## Status: Evaluation Bugs Complete

All three bugs identified after evaluation have been addressed and manually verified.

### 1. Razorpay Failure / Exit Handling — ✅ Complete

* Explicit Razorpay payment failures are recorded as `FAILED`.
* Checkout dismissal does not incorrectly mark donations as failed.
* Successful payments remain `SUCCESS`.
* Failed donations remain retryable.
* Backend verifies Razorpay payment state before recording failure.

### 2. NGO Dashboard Disbursement Status — ✅ Complete

Fixed:

* Proof submitted but displayed as "Awaiting proof submission".
* Failed donations incorrectly included in financial totals.
* Donor trace incorrectly attributed proof from unrelated disbursements.
* Approved disbursements incorrectly appeared in the NGO Action Box as "Awaiting Admin Review".

Current behavior:

* `PENDING + proof` → Action Box / Awaiting Admin Review.
* `APPROVED + proof` → Timeline / Awaiting fund transfer.
* `REJECTED` → Resubmission flow.
* Failed donations are excluded from financial/deployment totals.

### 3. Obsolete "Marked and Settled" UI — ✅ Complete

* Removed the obsolete manual settlement controls from the admin dashboard.
* Removed associated frontend state, store actions, and API helpers.
* Backend legacy endpoint remains temporarily available but is no longer exposed through the UI.

## Known Future Integration Gap

### Actual Fund Transfer / Settlement — ⏳ Future Work

Current lifecycle:

`PENDING → APPROVED → [fund transfer mechanism] → SETTLED`

The system currently has no active payout mechanism that advances an approved disbursement to `SENT`/`SETTLED`.

This is **not considered an unresolved evaluation bug**.

It should be addressed as part of the upcoming **Razorpay Payouts / blockchain integration**, rather than by faking the UI state or restoring the removed manual settlement button.

---

**Evaluation bug cleanup: COMPLETE.**
