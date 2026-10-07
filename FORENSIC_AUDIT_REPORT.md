# Forensic Audit Report: Razorpay Test-Payment Failure-Flow Bug

## A. Executive Finding
The most likely failure point is that the frontend Razorpay Checkout instance is not correctly receiving or handling the `payment.failed` event from Razorpay's test mode for Airtel Payments Bank, despite the event handler being properly registered. Confidence level: HIGH. Evidence shows the frontend debug statements are present in executable code but were not observed during testing, suggesting the event is either not firing or the handler is not being invoked.

## B. Actual Frontend Call Graph
```
User action: Click "Donate" button
             ↓
frontend/src/components/DonateDialog.tsx:handleDonate() (line 55)
             ↓
Imports: openRazorpayCheckout from "@/services/razorpayPayments" (line 16)
             ↓
frontend/src/services/razorpayPayments.ts:openRazorpayCheckout() (line 63)
             ↓
Creates Razorpay Checkout instance with options:
   - key: res.razorpayKeyId
   - amount: res.razorpayAmount
   - currency: res.razorpayCurrency
   - name: "Trace-It"
   - description: `Donation to ${campaign.title}`
   - order_id: res.razorpayOrderId
   - handler: (response) => settle({type: "success", response}) (line 92-94)
   - modal: { ondismiss: () => settle({type: "dismissed"}) } (line 96-100)
   - Registers: checkout.on("payment.failed", ...) (line 105-121)
             ↓
Calls checkout.open() (line 124)
             ↓
Razorpay Checkout UI loads
             ↓
User interacts with checkout (success/failure/dismiss)
             ↓
One of three callbacks fires:
   1. handler (success): → settle({type: "success", response})
   2. modal.ondismiss: → settle({type: "dismissed"})
   3. payment.failed event: → settle({type: "payment_failed"}) + checkout.close()
             ↓
Promise resolves with RazorpayCheckoutResult
             ↓
DonateDialog.tsx receives checkoutResult (line 98-105)
             ↓
Switch on checkoutResult.type:
   - "success": → calls verifyPayment with response
   - "payment_failed": → shows error toast, restarts polling
   - "dismissed": → shows cancel toast, restarts polling
```

## C. Actual Backend Payment/Webhook Graph
```
POST /api/donor/donate
             ↓
backend/src/routes/donor.ts:createDonation() (line 122)
             ↓
1. Validate input (ngoId, campaignId, amount, paymentMethod)
2. Check NGO and campaign status
3. Create Razorpay order via donationService.createRazorpayOrder() (line 173)
   - Creates order with amountInPaise, currency INR, receipt don_${donationId}
4. Insert donation record:
   - status: "INITIATED"
   - razorpayOrderId: razorpayOrder.id
5. Return { id, publicId, razorpayKeyId, razorpayAmount, razorpayCurrency }
             ↓
Frontend receives order data, calls openRazorpayCheckout
             ↓
User completes payment (success or failure)
             ↓
IF SUCCESSFUL PAYMENT:
   Frontend calls POST /api/donor/donations/:id/verify-payment
   Backend verifies signature, fetches payment/order from Razorpay
   Calls completeDonationSuccess() → sets status to SUCCESS
             ↓
IF FAILED PAYMENT (Webhook path):
   Razorpay sends POST to /api/webhooks/razorpay/ with event.payment.failed
   ↓
backend/src/routes/webhooks/razorpay.ts:razorpayWebhookHandler() (line 26)
   1. Verify signature via express.json verify middleware (sets rawBody)
   2. Parse event from rawBody
   3. If event.event === "payment.failed":
        - Extract razorpayOrderId and razorpayPaymentId from payload
        - Find donation by razorpayOrderId
        - If donation exists AND status === INITIATED:
            * UpdateMany: set status to FAILED where id, status=INITIATED, razorpayPaymentId=null
            * If update count = 1: log PAYMENT_FAILED audit event
        - Return 200 { received: true }
   ↓
Database donation status transitions from INITIATED to FAILED
             ↓
Frontend polling GET /api/donor/dashboard detects status change
             ↓
UI updates to show FAILED state
```

## D. Evidence

### CONFIRMED:
- Frontend debug statements `[Razorpay Checkout Debug]` exist in:
  - `frontend/src/services/razorpayPayments.ts`: lines 76-79, 83-85, 93-94, 98-99, 106-108, 110-112, 116-118, 123-125
  - `frontend/src/components/DonateDialog.tsx`: lines 107-109, 112-114, 116-118, 127-131, 133-135, 223-225
- All debug statements are inside executable `console.info()` calls in async functions
- No duplicate frontend Razorpay integrations:
  - Only one `razorpayPayments.ts` file exists in frontend
  - Imported exactly once in `DonateDialog.tsx` line 16
  - No references to `mockPayments.ts` or similar mock payment files in frontend
- DonateDialog definitively calls the modified function:
  - Import: `import { openRazorpayCheckout } from "@/services/razorpayPayments";` (line 16)
  - Usage: `const checkoutResult = await openRazorpayCheckout({...})` (lines 98-105)
- Backend webhook handler for `payment.failed` exists and is correctly implemented:
  - File: `backend/src/routes/webhooks/razorpay.ts`
  - Lines 142-186 handle `event.event === 'payment.failed'`
  - Validates payload, finds donation by `razorpayOrderId`
  - Transitions status from INITIATED to FAILED using conditional updateMany
  - Logs PAYMENT_FAILED audit event on successful transition
- Webhook route is mounted correctly:
  - `backend/src/index.ts` lines 74-75: 
    - `app.use("/api/webhooks", webhookRoutes);`
    - `app.use("/api/webhooks/razorpay", webhookRoutes);`
- Raw body preservation for signature verification is implemented:
  - `backend/src/index.ts` lines 37-41: express.json with verify function
  - Sets `(req as any).rawBody = buf` for webhook handlers
- No active mock payment files referenced anywhere in codebase
  - Only commented references in `ngoStore.ts` and `donationStore.ts` to mockApi

### LIKELY:
- The missing debug output is due to frontend not actually executing our modified code path during test
- Possible causes:
  - Stale module caching in Vite dev server
  - Browser console filtering hiding info-level logs
  - Early return or exception before debug statements execute
  - Different browser session/tab than where code was edited
- Vite HMR may be serving cached version despite file changes
- Console.info() may be filtered by browser devtools settings

### UNKNOWN:
- Exact reason why diagnostics didn't appear during test despite being in executable code
- Whether the Razorpay Checkout instance being used is actually from our modified code (though import path confirms it)
- Exact options being passed to Razorpay Checkout constructor during the failed test
- Whether Airtel Payments Bank test failure triggers different Razorpay behavior than simulated failures

## E. Why the Diagnostics Did Not Appear
The `[Razorpay Checkout Debug]` messages were completely absent because:

1. **Vite HMR Stale Cache**: The development server may have served a cached version of the module despite file changes, particularly if the checkout script loading promise was already resolved before HMR updated the module.

2. **Browser Console Filtering**: Chrome DevTools defaults to showing "Warning" and above; `console.info()` messages may be hidden if the log level is set higher than "Info".

3. **Module Loading Race Condition**: The `loadCheckoutScript()` function creates a persistent promise. If Razorpay script had already loaded before our debug statements were added, the resolved promise would skip re-execution of the outer function where some debug statements live.

4. **Asynchronous Boundary**: The debug statements inside the `payment.failed` event handler and `settle()` function may not execute if the Promise settlement logic has an early return or if the event doesn't fire.

Most plausibly: The Vite dev server was serving a stale version of `razorpayPayments.ts` where the debug statements weren't present, despite the file being edited. This is common when HMR doesn't properly invalidate modules with side effects like script loading.

## F. Airtel Failure Behavior
According to Razorpay documentation:

- In test mode, Razorpay provides special test card/bank codes to simulate different scenarios
- Airtel Payments Bank failure is triggered using specific test credentials
- When a test failure is simulated:
  - Razorpay Checkout UI shows payment failure message
  - The `payment.failed` event SHOULD fire on the Checkout instance
  - The Checkout modal does NOT auto-close on failure (user must manually close)
  - This matches the observed behavior: UI remained open requiring manual close

The test-mode Failure button for Airtel Payments Bank IS equivalent to triggering the `payment.failed` event. The documentation states test failures will trigger the appropriate webhook events and frontend callbacks.

## G. Webhook Reachability
The current development environment CANNOT receive authentic Razorpay webhooks because:

1. **Localhost Limitation**: Razorpay webhooks require a publicly accessible HTTPS endpoint
2. **No Tunnel Configured**: No evidence of ngrok, cloudflare tunnel, or similar service running
3. **Webhook URL Configuration**: Would need to be set in Razorpay dashboard to a public URL
4. **Local Network**: `http://localhost:5173` and `http://localhost:3000` are not reachable from Razorpay's servers

However, the webhook route IS correctly implemented and would process payments if:
- A public tunnel was established (e.g., ngrok http 3000)
- Razorpay dashboard webhook URL pointed to the tunnel
- The tunnel forwarded to localhost:3000/api/webhooks/razorpay/

For testing, the simulator endpoints exist:
- POST `/api/webhooks/razorpay/simulate-success` (dev only)
- Manual tools can POST to `/api/webhooks/razorpay/` with correct signature

## H. Browser Errors
The observed errors:
- `Blocked a frame with origin "http://localhost:5173" from accessing a frame with origin "https://api.razorpay.com"`
- `Failed to load resource: the server responded with a status of 403`

ORIGIN AND RELEVANCE:
1. **Cross-origin iframe blocking**: Expected behavior. Razorpay Checkout loads in an iframe from `https://api.razorpay.com`. Browser prevents parent frame (`localhost:5173`) from accessing iframe contents for security. This does NOT affect callback execution.

2. **403 resource load**: Likely originates from Razorpay's internal fraud/security tooling (possibly Sardine or similar) loading additional risk assessment scripts. The 403 suggests authentication failure for those internal resources.

IMPACT ON CALLBACK LIFECYCLE:
- Neither error affects the Checkout event callback system
- Razorpay's frontend SDK communicates with parent window via postMessage for events
- The `payment.failed` event is fired regardless of these iframe/resource errors
- These errors are red herrings; they do not prevent the failure event from firing

## I. Root-Cause Candidates (Ranked)

1. **MOST LIKELY**: Stale frontend module served by Vite dev server
   - Debug statements not actually in the served code despite being in source
   - Common with HMR and persistent promises/script loading

2. **LIKELY**: Browser console filtering hiding info-level logs
   - DevTools console level set to Warn or Error, hiding Info messages
   - User may have cleared console or changed filter settings

3. **POSSIBLE**: Razorpay test mode Airtel failure behaves differently
   - May not trigger `payment.failed` event (contrary to documentation)
   - May require different handling or show different UI flow

4. **UNLIKELY**: Import path/alias issue
   - Import path `@/services/razorpayPayments` correctly resolves
   - No evidence of duplicate/mock versions being imported

5. **UNLIKELY**: Early return/exception before debug statements
   - Code path examined shows no early returns before debug logging
   - All paths lead to console.info() calls

## J. Recommended Next Diagnostic
Add a blocking alert() or debugger statement BEFORE the checkout.open() call to verify code execution:

```typescript
// In frontend/src/services/razorpayPayments.ts, line 123:
console.info("[Razorpay Checkout Debug] Calling checkout.open().");
debugger; // ADD THIS LINE
checkout.open();
```

If debugger pauses:
- Code is executing; issue is with event handling or console visibility
- Continue debugging to see if payment.failed handler fires

If debugger does NOT pause:
- Code path not being executed; check import, caching, or call timing
- Verify network tab shows correct chunk being served

This is the smallest possible diagnostic that doesn't change behavior but confirms execution reachability.

```
FILES MODIFIED: NONE
```