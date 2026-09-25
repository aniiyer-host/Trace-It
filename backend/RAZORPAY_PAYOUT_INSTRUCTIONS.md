# Razorpay Payouts Integration Guide

## Current State (Temporary Override)
Currently, Trace-It supports moving a disbursement to the `APPROVED` state via the Admin Panel. 
However, because Razorpay Payouts are not yet integrated, the system lacks an automated way to physically move funds to the NGO's bank account and consequently update the database status to `SENT` or `SETTLED`.

To unblock development, a **manual override button** ("Mark as Sent & Received") has been added to the Admin Panel. 
This button calls `POST /admin/disbursements/:id/mark-settled` which forcefully transitions an `APPROVED` disbursement to `SETTLED`.

## Your Task (Next Developer)
When implementing the Razorpay Payouts system, you must:

1. **Automate the Payout:**
   When an admin clicks "Approve" (calling `approveDisbursement`), the backend should ideally trigger an API call to Razorpay (e.g., RazorpayX Payouts) to initiate the fiat transfer to the NGO's registered bank account.

2. **Handle the Webhook:**
   Set up a webhook endpoint to listen to Razorpay payout events (e.g., `payout.processed` and `payout.reversed`).
   When a payout succeeds, the webhook handler should automatically find the corresponding disbursement in the database and update its status:
   ```typescript
   await prisma.disbursement.update({
     where: { id: razorpayPayoutReferenceId },
     data: { status: DisbursementStatus.SETTLED } // or SENT
   });
   ```

3. **Remove the Temporary Override:**
   Once the webhook safely handles the state transition, you must **delete** the temporary manual override:
   - Delete `markDisbursementSettled` function in `backend/src/routes/admin.ts`.
   - Remove the `POST /disbursements/:id/mark-settled` route registration.
   - In the frontend (`frontend/src/pages/AdminPanel.tsx`), completely remove **ZONE 1.5** ("Approved Disbursements (Awaiting Transfer)") and its associated states (`approvedMilestones`). The UI should rely entirely on the automated webhook silently updating the database.
