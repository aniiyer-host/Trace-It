# Razorpay Behavior Analysis: Failure UI Followed by "Payment Confirmed" Display

## 1. Callback Ordering
**PROVEN FROM CODE**
- `openRazorpayCheckout` registers three callbacks:
  1. `handler` (success): calls `settle({type: "success", response})`
  2. `modal.ondismiss`: calls `settle({type: "dismissed"})`
  3. `payment.failed` event: calls `settle({type: "payment_failed"})` then `checkout.close()`
- Settlement guard: `let settled = false`; `settle()` returns early if `settled === true`, preventing double resolution.

## 2. Promise Settlement Behavior
**PROVEN FROM CODE**
- Only the first callback to call `settle()` resolves the promise.
- `payment.failed` callback:
  - Logs event
  - Calls `settle({type: "payment_failed"})` → if successful, logs and calls `checkout.close()`
  - `checkout.close()` may trigger `modal.ondismiss` but settlement guard prevents double resolution.
- `modal.ondismiss` callback:
  - Logs dismiss
  - Calls `settle({type: "dismissed"})` → if successful, logs and requests polling restart
- `handler` callback:
  - Logs success
  - Calls `settle({type: "success", response})` → if successful, logs and resolves promise.

## 3. DonateDialog Behavior
**PROVEN FROM CODE**
- After `await openRazorpayCheckout(...)`, DonateDialog switches on `checkoutResult.type`:
  - `"dismissed"`: shows "Payment cancelled" toast, increments `pollingCycle`, returns.
  - `"payment_failed"`: shows "Payment failed" toast, increments `pollingCycle`, returns.
  - `"success"` (default): calls `verifyPayment`, then on success:
    - Updates donation status via `setDonations` and `setCreatedDonation`
    - Shows "Payment confirmed! Donation recorded." toast
    - Fetches donation history
  - On verification error: shows "Payment submitted" toast.
- UI rendering (`createdDonation.status`):
  - `SUCCESS`: shows "Payment Confirmed!" with transaction hash.
  - `FAILED`: shows "Payment Failed" with suggestion to try again.
  - `INITIATED` or other: shows "Payment Initiated" spinner + dev simulate button.
- `createdDonation` is never set to `FAILED` or `SUCCESS` in the failure/dismissed branches; remains `INITIATED` until polling updates it.

## 4. Dashboard Polling Behavior
**PROVEN FROM CODE**
- `useEffect` in DonateDialog runs when:
  - `createdDonation` exists
  - `createdDonation.status !== "FAILED"`
  - `user?.id` exists
- Polling interval: 3 seconds, max 60 seconds.
- Each poll:
  - Calls `apiService.donations.getByUser()`
  - Finds donation by `createdDonation.id`
  - If status or taxReceiptUrl changed, updates `setDonations` and `setCreatedDonation`.
  - If new status is `FAILED`, clears interval.
- Thus, polling can update `createdDonation.status` from `INITIATED` to `SUCCESS` or `FAILED` based on backend state.

## 5. Backend Verification Requirements
**PROVEN FROM CODE** (`verifyCheckoutPayment` + `completeDonationSuccess`)
- For `verifyPayment` to succeed:
  1. Valid JWT donor auth.
  2. Donation belongs to donor.
  3. Razorpay order ID matches donation's `razorpayOrderId`.
  4. Valid Razorpay signature (`order_id|payment_id`).
  5. Razorpay payment fetch returns:
     - `payment.id === razorpay_payment_id`
     - `payment.order_id === donation.razorpayOrderId`
     - `payment.status === "captured"`
     - `payment.captured === true`
     - `payment.amount === expectedAmountPaise`
     - `payment.currency === "INR"`
     - Matches donation amount and currency.
  6. Razorpay order fetch returns:
     - `order.id === donation.razorpayOrderId`
     - `order.status === "paid"`
     - `order.amount === expectedAmountPaise`
     - `order.currency === "INR"`
     - Matches receipt and notes.
  7. `completeDonationSuccess` transitions donation from `INITIATED` or `FAILED` to `SUCCESS` (conditional update).

## 6. Possible Race Conditions
**UNPROVEN** (requires timing analysis)
- Race between:
  - `payment.failed` event firing → settling promise → `checkout.close()`
  - User manually closing modal → `modal.ondismiss` firing
  - If `modal.ondismiss` fires before `payment.failed` settlement, dismiss wins.
  - If `payment.failed` settles first, `modal.ondismiss` after settlement is ignored.
- Race between donation creation (`POST /donate`) and Razorpay checkout opening:
  - Donation created with `status: INITIATED` and `razorpayOrderId`.
  - If webhook arrives before frontend calls `verifyPayment`, backend may update status.
- Race between polling intervals and state updates:
  - Polling may miss rapid status changes if interval too long.

## 7. Exact Explanation(s) Consistent with Observed Behavior
**HYPOTHESIS** (requires runtime evidence)
The observed sequence:
1. User selects Airtel Payments Bank → Razorpay shows failure UI.
2. Frontend initially reports failure (toast: "Payment failed").
3. User manually closes Razorpay Checkout UI.
4. Trace-It subsequently displays "Payment confirmed / UI recorded".

Can be explained by:

- **Scenario A (Stale Success State)**: The donation record already had `status: SUCCESS` from a previous successful donation (e.g., due to insufficient cleanup, or user reusing same donation ID). The frontend shows "Payment confirmed" based on `createdDonation.status`, not the current checkout outcome. The failure toast was shown, but the UI rendering used stale state.

- **Scenario B (Polling Update After Manual Close)**:
  1. Razorpay fires `payment.failed` event → frontend settles promise as `payment_failed` → shows failure toast.
  2. User manually closes modal → `modal.ondismiss` fires but settlement guard ignores it.
  3. Frontend returns from `handleDonate`, leaving `createdDonation.status` as `INITIATED`.
  4. Polling continues (since status ≠ FAILED).
  5. *Simultaneously*, a backend process (e.g., simulator, manual webhook retry, or prior successful donation) updates the donation to `SUCCESS`.
  6. Polling detects status change → updates `createdDonation` → UI re-renders to show "Payment Confirmed!".
  5. User perceives this as "after closing checkout, UI shows confirmed".

- **Scenario C (Misattributed Toast)**:
  The "Payment confirmed" toast might actually be from the dev simulator button (`handleSimulatePayment`) being clicked accidentally after the failure UI appears, not from the success branch. This button is visible in dev mode and calls the simulate-success webhook.

- **Scenario D (Race in Settlement)**:
  If `handler` (success) and `payment.failed` callbacks fire nearly simultaneously, race in settlement could cause success to win despite Razorpay showing failure UI (unlikely but possible if Razorpay misfires).

## 8. What Runtime Evidence Would Distinguish Them
**PROVEN BY TEST** (suggested diagnostics)
- To distinguish **Scenario A (Stale State)**:
  - Inspect `createdDonation` object in DevTools React tab immediately after failure toast: if `status` is `"SUCCESS"` before polling, state was stale.
- To distinguish **Scenario B (Polling Update)**:
  - Monitor network tab: after failure toast, see if `GET /api/donor/getByUser` returns a donation with `status: "SUCCESS"`.
  - Add breakpoint in `useEffect` polling callback to see if it updates status.
- To distinguish **Scenario C (Simulator Button)**:
  - Check if dev simulator button was visible and clicked; inspect call stack for `handleSimulatePayment`.
- To distinguish **Scenario D (Settlement Race)**:
  - Add temporary debug logs in `openRazorpayCheckout` to see which callback fired first (already present as `[Razorpay Checkout Debug]` logs).

**Note**: Since the backend cannot receive real Razorpay webhooks locally, any status change to `SUCCESS` must come from:
- Prior successful donation (same ID reused)
- Dev simulator endpoint (`/api/webhooks/razorpay/simulate-success`)
- Manual database update
- Stale state from previous successful transaction

**Most consistent with constraints**: Scenario B (polling update after backend state change via simulator or prior success) or Scenario A (stale initial state).

**FILES MODIFIED: NONE**