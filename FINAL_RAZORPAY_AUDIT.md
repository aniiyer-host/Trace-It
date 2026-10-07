# Final Razorpay Audit Summary

## Executive Summary
Based on static code analysis of the Razorpay integration in Trace-It, I've traced the complete execution path for both success and failure scenarios. The forensic analysis reveals why a failure followed by manual closure might subsequently show "Payment confirmed / UI recorded".

## Key Findings (READ-ONLY ANALYSIS - NO FILES MODIFIED)

### 1. Callback Ordering & Settlement Behavior (PROVEN FROM CODE)
- `openRazorpayCheckout()` registers three callbacks:
  - `handler` (success): settles `{type: "success", response}`
  - `modal.ondismiss`: settles `{type: "dismissed"}`
  - `payment.failed` event: settles `{type: "payment_failed"}` then calls `checkout.close()`
- One-shot settlement guard (`let settled = false`) prevents double resolution
- Only the first callback to call `settle()` resolves the promise

### 2. DonateDialog Behavior (PROVEN FROM CODE)
- After `await openRazorpayCheckout()`, switches on result type:
  - `"dismissed"`: shows "Payment cancelled" toast, increments pollingCycle, returns
  - `"payment_failed"`: shows "Payment failed" toast, increments pollingCycle, returns  
  - `"success"`: calls `verifyPayment()`, then on success updates UI to show "Payment confirmed! Donation recorded."
- UI rendering based on `createdDonation.status`:
  - `SUCCESS`: shows "Payment Confirmed!"
  - `FAILED`: shows "Payment Failed"
  - `INITIATED`/other: shows "Payment Initiated" spinner
- `createdDonation` remains `INITIATED` in failure/dismissed branches until polling updates it

### 3. Dashboard Polling Behavior (PROVEN FROM CODE)
- `useEffect` polls `GET /api/donor/getByUser` every 3 seconds (max 60 seconds)
- Updates `createdDonation` if status or taxReceiptUrl changes
- Clears interval if status becomes `"FAILED"`
- **Can update status from `INITIATED` to `SUCCESS` or `FAILED` based on backend state**

### 4. Backend Verification Requirements (PROVEN FROM CODE)
For `verifyPayment` to succeed and transition to `SUCCESS`:
- Valid donor JWT and ownership
- Matching Razorpay order ID
- Valid Razorpay signature verification
- Razorpay payment fetch shows:
  - `status: "captured"`, `captured: true`
  - Matching amount, currency, order ID
- Razorpay order fetch shows:
  - `status: "paid"`
  - Matching amount, currency, receipt, notes
- `completeDonationSuccess()` conditionally transitions from `INITIATED` or `FAILED` to `SUCCESS`

### 5. Explanation for Observed Behavior (HYPOTHESIS)
The sequence "failure → manual close → payment confirmed" can be explained by:
1. Razorpay fires `payment.failed` event → frontend shows failure toast
2. User manually closes modal → `modal.ondismiss` fires but settlement guard ignores it
3. Frontend returns, leaving `createdDonation.status` as `INITIATED` 
4. **Meanwhile**: Backend state changes to `SUCCESS` via:
   - Dev simulator endpoint (`/api/webhooks/razorpay/simulate-success`)
   - Prior successful donation with same ID being reused
   - Manual database update or test harness
5. Polling detects status change → updates UI to show "Payment Confirmed!"

### 6. Runtime Evidence to Distinguish Causes
- **Stale initial state**: Check React DevTools - if `createdDonation.status === "SUCCESS"` immediately after failure toast
- **Polling update**: Monitor network - if `GET /api/donor/getByUser` returns `"status": "SUCCESS"` after failure
- **Simulator button**: Check if dev simulate button was clicked post-failure
- **Callback order**: Add temporary debug logs in `openRazorpayCheckout` to see settlement sequence

## Critical Constraints Verified (PROVEN FROM CODE)
- `modal.ondismiss` **does NOT** cause FAILED state (distinct settlement paths)
- No frontend sets donation to FAILED directly (only webhook does)
- No weakening of webhook verification (signature validation intact)
- No alteration of `completeDonationSuccess()`
- No database schema changes
- No KYC, receipt, attestation, allocation, or unrelated UI modified

## Files Examined (NO MODIFICATIONS)
- `frontend/src/services/razorpayPayments.ts`
- `frontend/src/components/DonateDialog.tsx`
- `backend/src/routes/donor.ts` (verifyPayment)
- `backend/src/services/donationService.ts`
- `backend/src/routes/webhooks/razorpay.ts`

```
FILES MODIFIED: NONE
BEHAVIOR CHANGED: NO
```