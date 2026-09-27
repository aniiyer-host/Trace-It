# Trace-It Razorpay Test API Integration Audit

## Audit Status

This document is a pre-implementation impact audit. It does not modify `razorpay.ts`, application code, the Prisma schema, or frontend code.

The repository currently contains a simulated Razorpay order/payment flow and a webhook handler that expects Razorpay-shaped payloads. It does not currently contain a live Razorpay Node SDK dependency or a backend call to the Razorpay Orders API. The migration must therefore replace the mock order/payment boundary carefully, after confirming the selected Razorpay Test Mode account, Checkout integration mode, webhook configuration, and credentials.

Provider facts in this document are limited to the repository evidence and the official Razorpay documentation reviewed on 2026-09-25. Any value not confirmed by those sources is marked `UNKNOWN`.

## 1. Existing Payment Architecture

### Current backend flow

The actual current donation path is:

```text
Authenticated frontend
       -> POST /api/donor/donate
       -> backend validates NGO, campaign, amount, and payment method
       -> createRazorpayOrder(amount) [local mock, not Razorpay API]
       -> PostgreSQL Donation(status=INITIATED, razorpayOrderId=mock id)
       -> response includes the internal donation and mock order ID
       -> frontend currently runs initiateUpiPayment() [local mock]

Razorpay-shaped webhook request
       -> POST /api/webhooks/razorpay
       -> raw-body HMAC verification with RAZORPAY_WEBHOOK_SECRET
       -> event-specific PostgreSQL update
       -> audit log and receipt work
       -> current individual Solana recording attempt
```

The backend order is created by `backend/src/services/donationService.ts:createRazorpayOrder()`. That function currently multiplies INR by 100, generates a local receipt and returns a locally generated object. Its own comment says the real SDK/HTTP call is still TODO.

The donation endpoint is `backend/src/routes/donor.ts:createDonation()`. It:

1. Validates `ngoId`, `campaignId`, positive `amount`, and an allowed `paymentMethod` with Joi.
2. Requires an authenticated donor.
3. Requires an active NGO and active campaign belonging to that NGO.
4. Calls `createRazorpayOrder(amount)`.
5. Creates a PostgreSQL `Donation` with status `INITIATED`, INR currency, the selected payment method, and the returned order ID.
6. Writes a non-blocking `DONATION_INITIATED` audit log.
7. In non-production/non-test environments, schedules a local `completeDonationSuccess()` transition after 15 seconds.
8. Returns the internal donation ID/public ID and the order ID.

The current frontend does not open the Razorpay Checkout. `frontend/src/components/DonateDialog.tsx` calls `frontend/src/services/mockPayments.ts:initiateUpiPayment()` first, ignores its result, then calls the backend donation endpoint. The mock service generates local order/payment IDs and returns `status: 'success'`; it does not contact Razorpay.

### Payment confirmation and status handling

The shared service `backend/src/services/donationService.ts:completeDonationSuccess()`:

- Loads the donation by internal ID.
- Uses a supplied Razorpay payment ID, an existing stored payment ID, or a synthetic `pay_sim_...` ID when neither exists.
- Updates the donation to `DonationStatus.SUCCESS` and stores the selected payment ID.
- Writes `PAYMENT_SUCCESS` and optionally `AML_FLAG_RAISED` audit events.
- Starts asynchronous receipt generation.
- Currently attempts individual Solana donation recording through `blockchainService.recordDonation()`.

There is a `verifyRazorpaySignature(orderId, paymentId, signature)` helper in the same service. It computes HMAC-SHA256 over `orderId|paymentId` using `RAZORPAY_KEY_SECRET`. Repository search found tests for this helper, but no current backend route that calls it for a browser Checkout success callback.

### Webhooks

Webhook routes are defined in `backend/src/routes/webhooks/razorpay.ts` and mounted by `backend/src/index.ts` at both `/api/webhooks` and `/api/webhooks/razorpay` using the same router. The router defines:

- `POST /api/webhooks/razorpay/` -> `razorpayWebhookHandler`
- `POST /api/webhooks/razorpay/refund` -> `razorpayRefundWebhookHandler`
- `POST /api/webhooks/razorpay/simulate-success` -> development simulation

The router applies `express.raw({ type: '*/*' })`. The application also captures the body buffer through the `express.json()` `verify` callback in `backend/src/index.ts`. The webhook handler reads `x-razorpay-signature` and `rawBody`, computes HMAC-SHA256 with `RAZORPAY_WEBHOOK_SECRET`, and rejects missing or mismatched signatures with HTTP 401.

The current main webhook recognizes these event strings:

- `payment.captured`
- `payment.failed`

The current refund route recognizes:

- `refund.processed`

For `payment.captured`, the handler reads `event.payload.payment.entity.order_id` and `.id`, finds the donation by `razorpayOrderId`, ignores a webhook if `razorpayPaymentId` is already populated, updates status to `SUCCESS`, stores the payment ID, writes audit information, starts receipt generation, and then attempts individual Solana recording.

For `payment.failed`, it reads the same order/payment identifiers, finds the donation by order ID, updates the donation to `FAILED`, stores the payment ID, and writes a `PAYMENT_FAILED` audit event.

For `refund.processed`, it reads `event.payload.refund.entity.payment_id`, `.id`, and `.amount`, finds the donation by `razorpayPaymentId`, updates status to `REFUNDED`, and writes `PAYMENT_REFUNDED`.

Unrecognized events receive HTTP 200 with `{ received: true }` and are not persisted as provider events.

### Error and retry behavior

- Webhook signature failures return 401 and log `WEBHOOK_TAMPER_ATTEMPT`.
- Missing donation for a captured event returns 200 to prevent provider retries.
- Duplicate captured notifications are detected only through an existing `Donation.razorpayPaymentId`.
- Individual blockchain failures are written to `BlockchainRetryQueue`; this is downstream of payment success and must be removed from payment confirmation under the new architecture.
- `backend/src/services/blockchainRetryProcessor.ts` runs a persisted retry loop in non-test application processes.
- There is no general Razorpay API retry client because no live API client exists yet.

## 2. Current Source of Truth

| Data | Current source of truth | Evidence and limitation |
|---|---|---|
| Operational donation status | PostgreSQL `Donation.status` | Prisma enum contains `INITIATED`, `SUCCESS`, `FAILED`, `REFUNDED`, `ALLOCATED`, `DISBURSED`, and `DELIVERED`. |
| Payment success in the current implementation | The accepted `payment.captured` webhook, after webhook HMAC verification | Browser payment signature verification is implemented only as an unused helper; no live Checkout confirmation route was found. |
| Payment failure | PostgreSQL update performed by `payment.failed` webhook | This is current behavior; provider ordering and retry semantics still need robust handling. |
| Refund status | PostgreSQL `Donation.status = REFUNDED` after `refund.processed` | Refund request API is still a stub in `backend/src/services/refundService.ts`. |
| Donation amount | PostgreSQL `Donation.amount` (`Decimal(14,2)`) | The create endpoint receives INR amount and the mock order multiplies it by 100. The live integration must validate provider amount against this internal amount. |
| Currency | PostgreSQL `Donation.currencyCode`, currently written as `INR` | The endpoint hardcodes INR; the mock order also hardcodes INR. |
| Razorpay order ID | PostgreSQL `Donation.razorpayOrderId`, unique and nullable | Currently stores a locally generated mock ID. It must store the actual Order API ID after live integration. |
| Razorpay payment ID | PostgreSQL `Donation.razorpayPaymentId`, unique and nullable | Currently populated by webhook or simulation; the frontend mock payment ID is not passed through the current create route. |
| Payment-to-donation relationship | `Donation.razorpayOrderId` for captured/failed events and `razorpayPaymentId` for refunds | The association is order-first for payment events and payment-first for refunds. |
| Payment timestamps | `Donation.createdAt`/`updatedAt`; no provider payment timestamp field | Razorpay timestamps are not currently persisted separately. Mapping is `UNKNOWN` until a schema decision is made. |
| Donor identity | PostgreSQL `Donation.donorId` and authenticated request identity | No Razorpay customer identity is currently stored or used. Checkout prefill/customer mapping is `UNKNOWN`. |
| NGO/campaign relationship | PostgreSQL `Donation.ngoId` and `campaignId` | These are internal Trace-It relationships and must not be inferred from Razorpay payloads. |
| Signature evidence | Not persisted as a dedicated field | Checkout signature is not currently handled by a route; webhook signature is verified transiently from the raw request and not stored. |
| Blockchain evidence | `Donation.solanaTxHash` | This is a secondary audit reference and must not determine payment success under the PostgreSQL-first blockchain architecture. |

The target source-of-truth flow is:

```text
Frontend Checkout or provider event
       -> server-side Razorpay verification
       -> PostgreSQL donation/payment update
       -> PostgreSQL audit event
       -> asynchronous hash-chain anchoring
       -> optional Solana public verification
```

Razorpay remains the payment provider. PostgreSQL remains the Trace-It application source of truth. Solana is downstream integrity/public-verification infrastructure.

## 3. Razorpay Test/Sandbox Integration Found

### Backend configuration

The repository contains these configuration names:

- `RAZORPAY_KEY_ID` in `backend/.env.example` and `RUNBOOK.md`.
- `RAZORPAY_KEY_SECRET` in `backend/.env.example` and used by `verifyRazorpaySignature()`.
- `RAZORPAY_WEBHOOK_SECRET` in `backend/.env.example`, `backend/.env`, `backend/src/utils/envValidator.ts`, and `razorpay.ts`.
- `VITE_RAZORPAY_KEY_ID` in `frontend/.env` and `frontend/.env.example`.

Actual secret values are intentionally not reproduced here. The repository contains a tracked/local environment reference that must be treated as sensitive and rotated if exposed.

`backend/src/utils/envValidator.ts` requires `RAZORPAY_WEBHOOK_SECRET` in production, but does not require `RAZORPAY_KEY_ID` or `RAZORPAY_KEY_SECRET` at startup. This matches the current mock order implementation, which does not use either API key. The live integration must add operation-level validation for the credentials it actually needs without placing secrets in frontend code.

### SDK and HTTP usage

The backend `package.json` does not list the `razorpay` Node SDK. No backend HTTP request to `https://api.razorpay.com` was found. `createRazorpayOrder()` explicitly returns a mock object.

The frontend `package.json` does not establish a Razorpay Checkout SDK integration in the inspected payment path. `mockPayments.ts` contains a TODO with a conceptual `Razorpay.open(...)` call, but the function currently returns local values.

### Mock payment data

`frontend/src/services/mockPayments.ts` returns:

- A locally generated `order_TrIt...` order ID
- A locally generated `pay_...` payment ID
- `status: 'success'`

The frontend ignores this returned object. It calls `POST /api/donor/donate` separately, where the backend creates a different local mock order ID. Therefore the current frontend mock order ID and the backend `Donation.razorpayOrderId` are not guaranteed to match.

### Repository test fixtures

`backend/tests/e2e.test.ts` sends a manually shaped `payment.captured` event with `id`, `order_id`, `amount`, `currency`, `status`, and `method`, but deliberately uses an order ID that does not necessarily match the created donation and accepts 200/400/401. This is endpoint coverage, not a verified provider-contract fixture.

`backend/tests/donationServiceSecrets.test.ts` covers only the HMAC payment signature helper configuration and computation.

`backend/tests/simulation.test.ts` covers the development simulation route, not Razorpay Test Mode.

## 4. Confirmed Razorpay Data Contract

This section separates official provider documentation from current repository behavior. Test Mode is documented by Razorpay as a simulated transaction environment using Test API keys; the official documentation states that webhook payload structure remains the same between Test and Live modes. The actual project account configuration and received payloads still need to be captured before production integration.

### 4.1 Payment/order creation response

The official Razorpay Orders documentation confirms that the server creates an order through the Orders API with an integer `amount` in the smallest currency subunit, a three-character currency code, and optional unique `receipt` and `notes`. The documented order response includes:

| Razorpay field | Type | Meaning | Trace-It use | Required? |
|---|---|---|---|---|
| `id` | string | Unique order identifier | Store as `Donation.razorpayOrderId`; pass to Checkout | Yes |
| `entity` | string | Entity name, documented as `order` | Validation/logging only | Provider response |
| `amount` | integer | Order amount in currency subunits | Compare against internal amount before accepting payment | Yes |
| `amount_paid` | integer | Amount paid against order | Use for reconciliation/status inspection | Provider response |
| `amount_due` | integer | Amount pending against order | Use for reconciliation/status inspection | Provider response |
| `currency` | string | ISO currency code | Compare with `Donation.currencyCode` | Yes |
| `receipt` | string | Internal order receipt reference; documented maximum 40 characters and unique | Store only if a schema field is added or retain in audit metadata; do not replace internal donation ID | Optional request/response |
| `status` | string | Documented order state such as `created`, `attempted`, or `paid` | Translate only through an explicit internal mapping | Provider response |
| `attempts` | integer | Number of payment attempts | Useful for reconciliation/diagnostics; no current Donation field | Provider response |
| `notes` | object | Order metadata | Only store approved non-sensitive metadata | Optional |
| `created_at` | integer | Unix timestamp for order creation | No dedicated current field; mapping is `UNKNOWN` unless schema is extended | Provider response |
| `offer_id` | string/null | Associated offer identifier | No current Trace-It field; not required by current donation flow | Provider response |

The repository mock includes this same general shape plus `offer_id: null`, but that does not make the mock a live provider response.

### 4.2 Checkout payment confirmation

Official Razorpay Checkout documentation confirms that a successful Checkout handler/callback returns:

| Razorpay field | Type | Meaning | Current Trace-It mapping | Required? |
|---|---|---|---|---|
| `razorpay_payment_id` | string | Unique payment identifier returned for successful payment | `Donation.razorpayPaymentId` | Yes for success |
| `razorpay_order_id` | string | Order ID returned by Checkout | Compare to the server-created `Donation.razorpayOrderId`; do not trust a client order ID without comparison | Yes for success |
| `razorpay_signature` | string | Checkout payment signature | Verify server-side; not currently persisted | Yes for verification |

The official verification rule uses HMAC-SHA256 over the server-retrieved `order_id` plus `|` plus `razorpay_payment_id`, using `RAZORPAY_KEY_SECRET`. The server must use the order ID it created/retrieved, not blindly trust a returned order ID for the signing input.

The current `verifyRazorpaySignature()` helper is directionally consistent with this rule, but the repository has no active endpoint that receives the three Checkout fields and calls it. The integration must add or identify that confirmation path before relying on browser success.

### 4.3 Failed payment information

Official Checkout documentation confirms a client-side `payment.failed` error object with documented examples including `code`, `description`, `source`, `step`, `reason`, and `metadata.order_id`/`metadata.payment_id`. The exact complete error schema for the selected Checkout/API version is not represented in the repository and must be treated as `UNKNOWN` beyond those documented fields.

The current frontend does not receive or persist this error object. The current backend webhook expects `payment.failed` and reads only the payment entity `id` and `order_id`.

### 4.4 Webhook events and fields

The official Razorpay payments webhook documentation confirms these payment event names:

- `payment.authorized`
- `payment.captured`
- `payment.failed`

It also documents `order.paid` as an order/payment event and notes that payment webhook ordering is not guaranteed. The repository currently handles only `payment.captured` and `payment.failed` in the main handler.

For the documented payment entity examples, the following fields are confirmed as present in relevant payment webhook payloads:

| Field | Type | Trace-It use | Confidence |
|---|---|---|---|
| `event` | string | Event dispatch | Official docs and current code |
| `payload.payment.entity.id` | string | Payment lookup/storage | Official docs and current code |
| `payload.payment.entity.order_id` | string/null | Donation lookup by order | Official docs and current code |
| `payload.payment.entity.amount` | integer | Compare with internal amount | Official docs and current test fixture |
| `payload.payment.entity.currency` | string | Compare with internal currency | Official docs and current test fixture |
| `payload.payment.entity.status` | string | Provider-state evidence | Official docs and current test fixture |
| `payload.payment.entity.method` | string | Payment-method diagnostics/mapping | Official docs and current test fixture |
| `payload.payment.entity.created_at` | integer | Provider timestamp if persisted | Official docs; no current schema field |
| `payload.payment.entity.captured` | boolean | Capture validation where present | Official docs; exact event-specific presence must be validated |
| `payload.payment.entity.error_code` | string/null | Failure diagnostics | Official docs for failure payload |
| `payload.payment.entity.error_description` | string/null | Failure diagnostics | Official docs for failure payload |
| `payload.payment.entity.error_source` | string/null | Failure diagnostics | Official docs for failure payload |
| `payload.payment.entity.error_step` | string/null | Failure diagnostics | Official docs for failure payload |
| `payload.payment.entity.error_reason` | string/null | Failure diagnostics | Official docs for failure payload |
| `payload.payment.entity.amount_refunded` | integer | Refund/reconciliation | Official docs; no current payment amount-refunded field |
| `payload.payment.entity.refund_status` | string/null | Refund/reconciliation | Official docs; no current dedicated field |
| top-level `created_at` | integer | Webhook event timestamp | Official docs; no current dedicated field |

The official webhook validation documentation confirms:

- The signature is in `X-Razorpay-Signature`.
- The signature is HMAC-SHA256 using the webhook secret and the raw request body.
- The body must not be parsed or cast before signature generation.
- Duplicate deliveries can be identified using the `x-razorpay-event-id` header.
- Event order is not guaranteed.

The repository currently does not read or persist `x-razorpay-event-id`. That is a specific idempotency gap to address.

### 4.5 Refunds and cancellations

The repository has an implemented `refund.processed` webhook handler and a `REFUNDED` donation state. It does not have a live proactive refund API; `backend/src/services/refundService.ts` is a stub.

The exact refund event set, refund entity contract, partial-refund behavior, duplicate refund policy, and refund-to-donation amount model are `UNKNOWN` for this repository until the selected Razorpay refund documentation/account configuration is confirmed. Do not add additional refund events or fields based only on assumptions.

### 4.6 Unknown provider data

The following are not confirmed by the repository and must not be guessed during implementation:

- The actual SDK/client choice and version
- The actual Test Mode account/webhook configuration
- The exact order `notes` contents to be used for Trace-It
- Any provider receipt-to-donation mapping beyond the current mock receipt
- Whether Checkout handler, callback URL, webhooks, or all three will be used
- The complete payment/refund/error payloads delivered to the configured endpoint
- Whether provider timestamps and fees should be persisted
- Whether the account supports any non-INR currency or partial-payment mode
- Any Razorpay customer, invoice, token, card, VPA, or bank data requirement

## 5. Trace-It Model Comparison

| Trace-It field | Existing purpose | Razorpay source | Mapping required? | Notes |
|---|---|---|---|---|
| `Donation.id` | Internal UUID | None | No | Must remain Trace-It's internal identifier. |
| `Donation.publicId` | Public-facing donation identifier | None | No | Do not replace with a Razorpay ID. |
| `Donation.donorId` | Authenticated internal donor profile | Authenticated Trace-It session | No | Razorpay customer identity is not currently used. |
| `Donation.ngoId` | Internal NGO relationship | Trace-It request/campaign | No | Keep internal. |
| `Donation.campaignId` | Internal campaign relationship | Trace-It request/campaign | No | Keep internal. |
| `Donation.amount` | INR business amount, Decimal(14,2) | Order/payment `amount` in subunits | Yes | Convert internal INR to integer paise for order creation; compare provider amount to expected paise before success. Avoid floating-point ambiguity. |
| `Donation.currencyCode` | Currency code, default `INR` | Order/payment `currency` | Yes | Current endpoint hardcodes INR; reject mismatches rather than silently converting. |
| `Donation.paymentMethod` | Trace-It enum: UPI, CARD, NETBANKING, WALLET, SOLANA_STUB | Checkout selection or payment entity `method` | Partial | Current request chooses the internal method before payment. Provider method mapping must be explicitly defined; do not infer `SOLANA_STUB` from Razorpay. |
| `Donation.status` | Operational donation lifecycle | Verified provider event/status | Yes | PostgreSQL remains authoritative. Do not map every provider state directly without transition rules. |
| `Donation.razorpayOrderId` | External order correlation | Order response `id`, Checkout `razorpay_order_id`, payment entity `order_id` | Yes | Unique field; server-created order ID is authoritative for correlation. |
| `Donation.razorpayPaymentId` | External payment correlation | Checkout `razorpay_payment_id`, payment entity `id` | Yes | Unique field; write only after validating association and event/signature. |
| `Donation.donorMessage` | Optional donor message | Razorpay `notes` only if intentionally used | No current mapping | Do not put arbitrary donor/business data in provider notes without a privacy decision. |
| `Donation.taxReceiptUrl` | Trace-It receipt URL | None | No | Receipt generation remains internal. |
| `Donation.taxReceiptEmailed` | Receipt delivery state | None | No | Independent of payment provider. |
| `Donation.donorIdHash` | Privacy/hash field for blockchain/audit | Trace-It `donorId` plus secret | No direct provider mapping | Keep internal cryptographic handling. |
| `Donation.solanaTxHash` | Legacy individual blockchain reference | None from Razorpay | No | Under the blockchain migration, this must not determine payment success; future anchor references belong to the audit/anchor model. |
| `Donation.createdAt` / `updatedAt` | Trace-It timestamps | Order/payment/webhook timestamps | No direct overwrite | Preserve application timestamps; provider timestamps may be audit metadata or require a new field. |
| Payment signature | Not a current Donation field | `razorpay_signature` or `X-Razorpay-Signature` | Verification required | Verify transiently; store only a non-sensitive verification result/event unless a schema decision requires more. |
| Webhook event ID | No current field | `x-razorpay-event-id` | Idempotency required | Requires a durable event record or an additive field/model; do not overload `razorpayPaymentId`. |
| Refund ID/amount | Not a Donation field | Refund event entity | Partial mapping | Current handler logs refund ID/amount but stores only `REFUNDED`; partial refund requirements are unresolved. |

## 6. `razorpay.ts` Impact

### Current responsibilities

`backend/src/routes/webhooks/razorpay.ts` currently:

- Receives webhook requests through an Express router.
- Preserves/reads the raw body.
- Verifies the webhook HMAC signature.
- Parses the event JSON.
- Handles captured, failed, and processed-refund branches.
- Finds donations by Razorpay order/payment IDs.
- Updates PostgreSQL donation status and external IDs.
- Writes audit logs.
- Starts receipt generation and AML notification work.
- Starts individual blockchain recording after capture.
- Returns 200 for unknown events and missing donations.
- Provides a development-only simulated success endpoint.

### Responsibilities that remain

- Receive and authenticate provider webhooks.
- Dispatch only explicitly supported event types.
- Correlate provider IDs to the internal donation.
- Validate amount, currency, and state transition before updating PostgreSQL.
- Make processing idempotent.
- Write payment audit events.
- Trigger receipt/notification work after a valid state transition.

### Responsibilities that must change

- Remove individual Solana recording from payment confirmation. Payment success must not wait for or depend on `blockchainService.recordDonation()`.
- Stop treating `razorpayPaymentId` alone as sufficient duplicate protection; add event-level and payment-level idempotency based on confirmed identifiers.
- Stop accepting a captured webhook solely because it has a matching order ID; validate the payment amount/currency and compatible provider state.
- Avoid writing a payment ID from a failed notification in a way that blocks a later valid captured event unless the business rules explicitly support that lifecycle.
- Use constant-time comparison for signatures where the implementation permits it and ensure the raw body is the exact signed bytes.
- Decide whether missing-donation events should be acknowledged, quarantined, or retried. The current unconditional 200 prevents provider retry but can lose correlation if the donation was temporarily unavailable.

### New responsibilities

- Persist or otherwise durably deduplicate `x-razorpay-event-id`.
- Validate provider amount/currency against the server-side donation/order values.
- Handle out-of-order payment events without regressing a terminal or later state.
- Record provider event metadata needed for audit/reconciliation without storing unnecessary sensitive payment details.
- Allow an API-fetch reconciliation path when a user-facing confirmation arrives before a webhook, as recommended by Razorpay documentation, but keep PostgreSQL authoritative for Trace-It state.

### Responsibilities that should move elsewhere

- Provider API client construction and order creation should live in a dedicated payment service rather than a route-level webhook module.
- Payment payload normalization should be a typed service boundary, separate from webhook transport/signature handling.
- Durable provider-event/idempotency storage should be a database/service concern.
- Receipt generation and notifications should remain asynchronous service work.
- Blockchain anchoring must move out of payment confirmation and into the separate audit-chain anchor worker described in `blockchain_migration_implementation_guide.md`.

## 7. Payment State Model

### Existing Trace-It states

The Prisma `DonationStatus` enum is:

```text
INITIATED -> SUCCESS -> ALLOCATED -> DISBURSED -> DELIVERED
                 \-> FAILED
                 \-> REFUNDED
```

The exact transition policy is implemented across the webhook, `completeDonationSuccess()`, and status services. The provider must not directly own the downstream allocation/disbursement/delivery states.

### Confirmed/observed mappings

| Razorpay state/event | Trace-It state/action | Status | Notes |
|---|---|---|---|
| Order created | `INITIATED` | Current repository behavior | The donation is created after the local mock order is returned. A real order creation failure must not create a successful donation. |
| `payment.captured` | `SUCCESS` | Current repository behavior and official payment event | Must additionally validate order association, amount, currency, and idempotency. |
| `payment.failed` | `FAILED` | Current repository behavior and official payment event | Must not prevent a later valid captured event if Razorpay sends failure followed by capture for the same payment/order scenario. |
| `refund.processed` | `REFUNDED` | Current repository behavior | Partial-refund semantics are not defined; do not assume every refund means the whole donation is refunded. |
| `payment.authorized` | `SUCCESS`? | Ambiguous | Official docs distinguish authorized from captured; the repository has no authorized handler. Do not mark donation `SUCCESS` until capture policy is confirmed. |
| `order.paid` | `SUCCESS`? | Ambiguous | Official docs describe this event, but the repository does not handle it. Choose one authoritative success event or deduplicate both against the same order/payment before implementation. |
| Order `created`/`attempted`/`paid` | `INITIATED`/`SUCCESS`? | Partial | Provider order state is not the same as all Trace-It donation states. Define only the mappings needed by the selected flow. |
| Checkout client `payment.failed` | `FAILED`? | Not currently persisted | Client failure is useful for UX but server-side webhook/API verification must determine persisted business state. |

### Required rule

Razorpay payment status is external evidence. PostgreSQL decides the Trace-It donation state after server-side authenticity, association, amount, currency, and transition checks. A browser success callback alone must not mark a donation successful without signature verification.

## 8. Webhook Architecture

The intended server flow is:

```text
Razorpay webhook
       -> preserve raw body
       -> verify X-Razorpay-Signature with webhook secret
       -> read x-razorpay-event-id for deduplication
       -> validate event shape and supported event
       -> correlate by server-created order/payment ID
       -> validate amount/currency/state transition
       -> update PostgreSQL idempotently
       -> append payment audit event
       -> enqueue receipt/reconciliation work
       -> return acknowledgement
```

The current handler implements raw-body HMAC verification and event branches, but it does not persist the provider event ID, validate provider amount/currency against the donation, or explicitly handle out-of-order events. It also triggers individual Solana recording after capture.

Razorpay documentation states that webhook delivery is asynchronous, duplicate deliveries can occur, and event order should not be assumed. The implementation should therefore treat the webhook as a durable event-processing boundary rather than as a one-shot notification.

Unknown or unsupported events should be acknowledged only after the integration has a deliberate observability policy. At minimum, record the event name and event ID in a safe audit/reception record without storing raw sensitive payloads unnecessarily.

## 9. Interaction With the Blockchain Architecture

The current flow is effectively:

```text
Payment webhook
       -> PostgreSQL donation SUCCESS
       -> individual recordDonation() Solana transaction
       -> solanaTxHash update/retry
```

The target flow is:

```text
Razorpay Checkout/webhook/API verification
       -> PostgreSQL donation/payment update
       -> PostgreSQL payment audit event
       -> hash-chain audit entry
       -> periodic anchor batch
       -> Solana anchor transaction
```

Required changes:

- `completeDonationSuccess()` must stop treating `recordDonation()` as part of payment finalization.
- `razorpayWebhookHandler` must not await or retry individual Solana recording as part of webhook completion.
- Payment success must remain valid if Solana/RPC/wallet configuration is absent.
- The payment event must be available to the PostgreSQL audit-chain process.
- The future anchor worker may hash/anchor payment audit data, but must not put raw payment credentials, secrets, or unnecessary personal/payment-instrument data on-chain.
- `Donation.solanaTxHash` is legacy individual-record storage and should not be used as the payment-success flag in the new architecture.

## 10. Idempotency Analysis

### Duplicate scenarios

- The same webhook can be delivered more than once.
- `payment.failed` can be followed by `payment.captured` according to official Razorpay payment webhook documentation.
- A browser success callback can arrive before or after a webhook.
- The provider/API request can succeed while the response is lost.
- A user can retry after a failed payment.
- The backend can retry provider calls after a timeout.
- A webhook can arrive before a related database transaction is visible or committed.
- The current development auto-transition and simulation endpoint can process the same donation separately from a real provider event.

### Identifiers available

Confirmed repository/provider identifiers are:

- Internal `Donation.id`
- Server-created Razorpay order ID, stored as `Donation.razorpayOrderId`
- Razorpay payment ID, stored as `Donation.razorpayPaymentId`
- Official webhook event ID header `x-razorpay-event-id`

Do not use a mock frontend payment ID as the backend order correlation key. The current frontend mock result is ignored and may not match the backend-created order.

### Required idempotency behavior

- Store the server-created order ID before Checkout begins.
- Use the order ID to find the donation for payment events.
- For captured events, reject or quarantine mismatched amount/currency/order associations.
- Persist the webhook event ID or a dedicated provider-event record before applying the event; exact schema name is not yet defined.
- Treat a repeated event ID as already processed.
- Treat a repeated payment ID as idempotent only after confirming it belongs to the same donation/order.
- Do not let a failed event permanently block a later valid capture without an explicit state policy.
- On provider request timeout, fetch/reconcile by the known server-created order ID before creating another order.
- For a user retry after a failed payment, create a new Razorpay order as the official documentation requires; do not reuse the old order ID. Decide whether the retry remains the same Trace-It donation or creates a new attempt record before implementation.

## 11. Security Review

### Positive existing controls

- `RAZORPAY_KEY_SECRET` is required by `verifyRazorpaySignature()` through `requireEnvironmentVariable()`.
- Production startup requires `RAZORPAY_WEBHOOK_SECRET` through `validateEnvironment()`.
- Webhook signature verification uses HMAC-SHA256 and the raw body.
- The frontend environment contains only a key ID, not a key secret.
- Webhook tamper attempts are audit logged.
- The backend validates authenticated donor, active NGO, active campaign, and positive donation amount before creating the donation.

### Gaps to resolve

- No live provider client currently uses `RAZORPAY_KEY_ID`/`RAZORPAY_KEY_SECRET` for order creation.
- No active route receives and verifies the Checkout success triplet.
- `x-razorpay-event-id` is not persisted for webhook idempotency.
- Payment amount and currency from webhook are not compared to the stored donation amount/currency.
- The handler logs `providedSignature` and `generatedSignature` in audit metadata on mismatch. This is sensitive authentication material and should be redacted or represented as a failure reason rather than logged verbatim.
- The captured webhook audit metadata includes donor ID and amount. Review SIEM/audit data minimization before enabling real provider payloads.
- Raw webhook headers are included in missing-signature audit metadata. Headers can contain sensitive values and should be allowlisted/redacted.
- `crypto` equality is currently ordinary string equality. Use a constant-time comparison where appropriate after validating equal-length encoded values.
- The current top-level `RAZORPAY_WEBHOOK_SECRET` constant is read at module load while the handler also reads the environment again. Remove ambiguity when modifying the file, and fail closed in every environment where real webhooks are enabled.
- Do not send `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, or payment verification secrets to the frontend.

### Signature boundaries

There are two different signatures:

1. Checkout payment signature: HMAC-SHA256 over the server-created order ID, a literal `|`, and the Checkout payment ID, using `RAZORPAY_KEY_SECRET`.
2. Webhook signature: HMAC-SHA256 over the exact raw webhook request body, using `RAZORPAY_WEBHOOK_SECRET`, compared with `X-Razorpay-Signature`.

Do not reuse the webhook secret for Checkout verification or the payment key secret for webhook verification.

## 12. Error Handling and Availability

### Razorpay unavailable during order creation

Do not create a successful donation. The API should return a provider-unavailable/error response and leave no false `SUCCESS` record. Whether to create an `INITIATED` record before or after a successful order response must be decided; the current implementation creates the donation after the local mock order returns.

### Order creation fails

Return an explicit failure to the caller. Do not persist a provider order ID unless Razorpay confirmed the order. If an ambiguous timeout occurs after the request was sent, reconcile using the chosen receipt/idempotency strategy before retrying.

### Payment succeeds but the browser response is lost

The webhook should eventually update PostgreSQL. If the user-facing flow needs immediate confirmation, use the verified Checkout response or a server-side provider fetch, but still make the update idempotent and do not rely on the browser alone.

### Webhook is delayed

Keep the donation `INITIATED` or an explicitly defined pending state until a valid server-side confirmation arrives. Do not mark it successful from timeout, frontend display, or Solana activity.

### Webhook is duplicated

Verify the signature, check the provider event ID and payment/order association, then return an idempotent acknowledgement without repeating side effects.

### Payment verification fails

Do not mark the donation `SUCCESS`; do not generate a success receipt; do not trigger blockchain anchoring for a success event. Audit the rejection without logging secrets/signatures.

### PostgreSQL unavailable

Do not silently acknowledge a valid payment as processed if the state cannot be durably recorded. The retry/acknowledgement policy must be chosen with the provider's webhook retry behavior and operational requirements. Preserve enough event identity to reconcile later.

### Blockchain unavailable

Payment processing continues. The PostgreSQL payment and audit-chain event are sufficient for operational success; the later anchor remains pending/retryable.

## 13. Testing Requirements

### Existing tests

| Test/location | Classification | Reason |
|---|---|---|
| `backend/tests/donationServiceSecrets.test.ts` | Keep and extend | Confirms payment-signature secret handling and HMAC behavior. Add server-created-order and mismatch cases. |
| `backend/tests/envValidator.test.ts` | Keep | Confirms production webhook-secret requirement. Add the final live-integration configuration policy if needed. |
| `backend/tests/e2e.test.ts` | Modify | Current webhook fixture uses a likely unmatched order ID and accepts 200/400/401; replace with signed, schema-valid provider fixtures once the contract is fixed. |
| `backend/tests/simulation.test.ts` | Keep for development simulation, separate from provider tests | It verifies local `simulate-success`, not Razorpay Test Mode. |
| `frontend/src/services/mockPayments.ts` consumers/tests | Replace or isolate | The mock currently creates IDs that are ignored and does not exercise Checkout. Keep only as an explicitly labeled local fallback. |
| Any existing webhook tests found during implementation | Keep/adapt | The current repository search did not identify a dedicated webhook test file beyond e2e/simulation coverage. |

### Required test matrix

#### Successful payment

- Create an order through the configured Test Mode client and persist its real order ID.
- Pass that order ID to Checkout.
- Verify the successful Checkout triplet server-side if the handler path is used.
- Deliver a signed captured webhook and verify one `SUCCESS` transition, one payment ID, one receipt trigger, and one audit event.

#### Failed payment

- Deliver a signed failed payment payload and verify `FAILED` behavior.
- Verify failure details are safely logged or stored according to the final schema.
- Verify a later valid capture can be handled according to the final state policy.

#### Invalid signatures

- Invalid Checkout signature does not create `SUCCESS`.
- Invalid webhook signature returns the chosen failure response and creates no payment state change.
- Missing raw body/signature is rejected.

#### Duplicate webhook

- Same `x-razorpay-event-id` twice produces one state transition and one set of side effects.
- Same payment ID with a different event ID is reconciled against the stored order/donation and state policy.

#### Delayed/out-of-order webhook

- `payment.captured` before `payment.authorized` does not fail merely because an earlier event was not seen.
- A late failed event cannot regress an already captured/successful donation without explicit policy.
- A webhook for an unknown order is observable and recoverable rather than silently lost.

#### Provider/API failures

- Order API authentication failure.
- Invalid amount/currency.
- Network timeout after request submission.
- Provider 5xx or rate limiting.
- Retry/reconciliation does not create duplicate orders or donations.

#### Database failures

- Donation/order persistence failure does not report false success.
- Webhook state update failure is retryable/reconcilable.
- Receipt and audit side effects do not obscure the payment state result.

#### Blockchain independence

- Valid Razorpay payment reaches PostgreSQL `SUCCESS` when Solana/RPC/wallet is unavailable.
- Payment audit event remains available for later anchoring.
- Anchor failure does not change a valid payment back to failed.

## 14. Environment Configuration

### Existing variables

| Variable | Current repository use | Exposure |
|---|---|---|
| `RAZORPAY_KEY_ID` | Documented backend variable but unused by current mock order creator | Server configuration; a public Checkout key may also be exposed as a client configuration value only according to the final integration design. |
| `RAZORPAY_KEY_SECRET` | Used by `verifyRazorpaySignature()` | Server-only secret. |
| `RAZORPAY_WEBHOOK_SECRET` | Used by webhook HMAC validation; required in production startup validation | Server-only secret. |
| `VITE_RAZORPAY_KEY_ID` | Present in frontend environment files; currently not used by `mockPayments.ts` | A Razorpay key ID is not the same as a secret, but expose it only if the official Checkout integration requires it and never expose its secret. |

### Configuration still required from the integration owner

- Test Mode key ID and key secret provisioned through the deployment secret mechanism.
- Test Mode webhook secret configured in the Razorpay Dashboard.
- Exact public webhook URL and selected webhook events.
- Whether Checkout uses a handler or callback URL.
- Whether backend API verification/fetch is required before the webhook arrives.
- Whether Test Mode webhook delivery is available to the selected staging/public endpoint.

Do not place real credentials, webhook secrets, payment signatures, or full provider payloads in this document, source control, frontend bundles, logs, or test fixtures.

## 15. Files Expected to Change

The paths below are actual repository paths identified by inspection. No application files were changed for this audit.

### Must change

| File | Why it changes | Type of change | Priority |
|---|---|---|---|
| `backend/src/services/donationService.ts` | Replace local mock order creation with the selected Razorpay client/API and keep payment verification separate from blockchain recording. | Payment service integration and decoupling | Highest |
| `backend/src/routes/donor.ts` | Return the real server-created order contract and connect the chosen Checkout/confirmation flow without creating false success. | Route contract and validation | Highest |
| `backend/src/routes/webhooks/razorpay.ts` | Add durable event idempotency, provider data validation, robust state handling, and remove individual Solana payment dependency. | Webhook processing/security | Highest |
| `backend/prisma/schema.prisma` | Only if the final design needs provider event IDs/timestamps/failure/refund detail not represented by current fields. | Additive persistence migration | Highest if required |
| `frontend/src/components/DonateDialog.tsx` | Replace the current mock payment call with the chosen Razorpay Checkout flow and send verified result data if using a handler. | Frontend payment initiation | Highest |
| `frontend/src/services/mockPayments.ts` | Remove from the real payment path or keep as an explicit development-only adapter. | Mock isolation/replacement | High |

### Probably change

| File | Why it changes | Type of change | Priority |
|---|---|---|---|
| `backend/src/index.ts` | Confirm raw-body handling and route mounting for the final webhook middleware; keep signature verification on exact raw bytes. | Middleware/configuration | High |
| `backend/src/utils/envValidator.ts` | Validate the final provider credentials at the correct operation/deployment boundary. | Configuration validation | Medium |
| `backend/tests/e2e.test.ts` | Replace unsigned/mismatched hand-built webhook assumptions with signed provider fixtures. | Integration tests | High |
| `backend/tests/donationServiceSecrets.test.ts` | Extend payment signature tests for server-created order ID and invalid/mismatched inputs. | Unit tests | High |
| `backend/src/services/auditLogService.ts` | Connect payment events to the new hash-chain audit layer when that layer is implemented. | Audit integration | Medium |
| `backend/src/services/refundService.ts` | Only if proactive refund requests are in scope for this integration. | Razorpay refund API | Deferred/conditional |

### Possibly change

| File | Why it may change | Type of change | Priority |
|---|---|---|---|
| `frontend/src/types/index.ts` | Add real order/payment/verification result types if the current client contract requires them. | Type/model update | Medium |
| `frontend/src/utils/apiClient.ts` | Update mapping or add payment confirmation calls if the final frontend flow uses it. | API client update | Medium |
| `backend/src/routes/public.ts` | Expose payment/receipt status only if the product needs a provider reconciliation view. | API response update | Low/medium |
| `backend/src/services/blockchainInstance.ts` and `backend/src/services/blockchainService.ts` | Only to remove individual donation recording from payment completion; anchor work belongs to the separate worker path. | Blockchain decoupling | High for migration, not Razorpay contract |
| `backend/package.json` | Add the official Razorpay Node SDK only if that is the chosen implementation. | Dependency update | High if SDK selected |

### No change required initially

| File/component | Reason |
|---|---|
| `backend/src/services/statusService.ts` | It owns downstream Trace-It business transitions; Razorpay should not replace it. |
| `backend/src/services/receiptService.ts` | Keep receipt generation downstream of validated PostgreSQL payment success. |
| `backend/src/services/hashService.ts` | Payment integration does not require changing the existing cryptographic primitives. |
| `backend/src/services/refundService.ts` | It is a stub and should remain untouched unless refunds are explicitly included in the implementation scope. |
| `backend/RAZORPAY_PAYOUT_INSTRUCTIONS.md` | This concerns future RazorpayX payouts to NGOs, not donor payment collection; do not conflate the two integrations. |

## 16. Recommended Implementation Sequence

### Phase 1 — Confirm the Current Flow

- Confirm the current backend mock order path and frontend mock path in a running test environment.
- Confirm the exact route mount used by the deployed application.
- Confirm whether any unlisted client calls or environment-specific overrides exist.
- Freeze the current Trace-It state mapping and schema assumptions.

### Phase 2 — Confirm the Razorpay Contract

- Choose the official Node SDK or direct HTTPS implementation.
- Confirm Test Mode credentials through the secret-management process.
- Confirm Checkout handler versus callback URL.
- Configure a public Test Mode webhook URL and selected events.
- Capture redacted real Test Mode order, Checkout, webhook, failure, and refund examples.
- Confirm whether `order.paid`, `payment.authorized`, `payment.captured`, `payment.failed`, and refund events are all in scope.

### Phase 3 — Replace Mock Order Creation

- Implement the server-side Orders API call in the payment service.
- Send integer INR paise and a stable, unique receipt/reference policy.
- Validate the returned order ID, amount, currency, and status before persisting.
- Persist the actual provider order ID against the internal donation.
- Keep API secrets server-side.

### Phase 4 — Connect Checkout and Confirmation

- Pass the server-created order ID to the real frontend Checkout.
- Receive the documented success triplet if using a handler/callback.
- Verify the payment signature server-side using the server-created order ID.
- Compare the payment/order identifiers to the internal donation.
- Keep the frontend success display separate from PostgreSQL success confirmation.

### Phase 5 — Harden Webhook Processing

- Preserve exact raw request bytes.
- Verify `X-Razorpay-Signature` with the webhook secret.
- Persist/deduplicate `x-razorpay-event-id`.
- Normalize and validate supported payloads.
- Validate order/payment association, amount, currency, and state transition.
- Make captured, failed, and refund handling idempotent and order-independent.

### Phase 6 — Update PostgreSQL Mapping

- Keep internal donation, donor, NGO, campaign, and amount fields authoritative.
- Store real Razorpay order/payment IDs in their existing unique fields.
- Add provider timestamp/failure/refund/event fields only if confirmed requirements justify schema changes.
- Ensure receipt and audit side effects are triggered once per valid transition.

### Phase 7 — Connect Payment Events to Audit Logging

- Emit payment initiation, verified success, failure, refund, and verification rejection events.
- Include only necessary provider identifiers/metadata.
- Feed events into the hash-chain audit layer once available.

### Phase 8 — Remove Payment-Critical Blockchain Coupling

- Remove `recordDonation()` from `completeDonationSuccess()` and the webhook path after outage tests are in place.
- Keep payment success independent of Solana/RPC/wallet availability.
- Allow the future anchor worker to process the PostgreSQL payment audit event asynchronously.

### Phase 9 — Test Real Test Mode

- Run success, failure, retry, duplicate, delayed, out-of-order, timeout, database failure, and invalid-signature tests using redacted provider fixtures and controlled Test Mode transactions.
- Verify no real/live credentials are used.

## 17. Definition of Done

- The backend uses the chosen Razorpay Test Mode client/API instead of generating local provider IDs.
- The actual order response and Checkout success contract are documented from the selected integration.
- The server verifies Checkout and webhook signatures using the correct secret and exact signed data.
- The real Razorpay order ID is stored in `Donation.razorpayOrderId`.
- The real Razorpay payment ID is stored in `Donation.razorpayPaymentId` after valid correlation.
- Amount and currency are validated against PostgreSQL before marking payment successful.
- PostgreSQL remains the Trace-It source of truth.
- Duplicate provider events and duplicate processing are idempotent.
- Failed or unverified payments cannot become successful donations.
- Payment events generate appropriate audit-chain inputs.
- Blockchain is not required to confirm a payment.
- Blockchain anchoring is asynchronous and downstream.
- No secret reaches the frontend or logs.
- Tests cover success, failure, signature, duplication, ordering, provider/network, database, and blockchain-outage cases.
- Refund behavior is either fully scoped/tested or explicitly deferred.

## 18. Open Questions

| Question | Why it matters | Missing evidence | Owner/source needed |
|---|---|---|---|
| Which official integration will be used: Razorpay Node SDK or direct HTTPS? | Determines dependency, client construction, error types, and testing approach. | No SDK dependency or API client currently exists. | Payment/backend developer and project dependency decision. |
| Will Checkout use a handler function, callback URL, webhook only, or a combination? | Determines whether a payment verification endpoint is required and how the frontend receives success. | Current frontend uses only a mock; no active Checkout integration. | Frontend/payment integration owner. |
| Which Test Mode webhook URL and events are configured? | Determines actual incoming events and endpoint routing. | No Dashboard configuration is in the repository. | Razorpay Dashboard owner. |
| Should `payment.captured` or `order.paid` be the authoritative success event? | Both are documented; processing both without deduplication can duplicate side effects. | Product/provider event selection is not recorded. | Payment owner and product decision. |
| Should `payment.authorized` ever map to Trace-It `SUCCESS`? | Authorized is not the same as captured; uncaptured payments can be refunded. | Capture policy and business requirement are not recorded. | Payment owner; confirm capture configuration. |
| What is the retry identity for a user payment attempt? | Razorpay documents one order per payment attempt; Trace-It currently has one unique order field per donation. | Product decision on same donation versus new attempt record. | Backend/product owner. |
| Should a provider event record/model be added? | Needed to deduplicate `x-razorpay-event-id` durably and audit raw event processing. | Prisma schema has no provider-event model. | Backend/database owner. |
| Should provider timestamps, fees, refund amounts, and failure codes be persisted? | Affects reconciliation, support, compliance, and schema changes. | Current Donation model has no dedicated fields. | Product/compliance/backend owners. |
| What is the required partial-refund behavior? | Current handler marks the whole donation `REFUNDED` and stores no refund record. | Refund requirements and actual refund payloads are not confirmed. | Product/payment owner. |
| Should the current development auto-transition remain after Test Mode integration? | It can race with real webhook/Checkout processing and synthesize payment IDs. | Development workflow policy is not defined. | Development owner. |
| Should the local `simulate-success` endpoint remain? | It bypasses provider verification and must not be confused with Test Mode. | No deprecation policy is recorded. | Backend/test owner. |
| Should `VITE_RAZORPAY_KEY_ID` be used by Checkout? | Determines frontend configuration and key exposure, while secret must remain server-side. | Current mock does not use it. | Frontend/payment owner. |
| How should missing-donation webhooks be handled? | Current 200 acknowledgement prevents retries but can lose a valid event. | Operational retry/reconciliation policy is absent. | Backend/payment owner. |
| What payment method mapping is required for `PaymentMethod`? | Provider methods and Trace-It enum values are not necessarily identical. | Current frontend mock uses UPI; real Checkout method behavior is not connected. | Product/payment owner. |

## 19. Final Developer Checklist

### Before Coding

- [ ] Confirm the actual current mock flow and all callers of `createRazorpayOrder()` and `completeDonationSuccess()`.
- [ ] Confirm Test Mode account, SDK/API choice, Checkout mode, webhook URL, and selected events.
- [ ] Capture redacted official Test Mode payloads; do not invent fixtures.
- [ ] Decide order/payment attempt and provider-event idempotency policy.
- [ ] Confirm PostgreSQL state mappings and refund scope.

### During Integration

- [ ] Keep Razorpay secrets server-side.
- [ ] Create orders on the server with integer currency subunits.
- [ ] Store the server-created order ID before Checkout.
- [ ] Verify Checkout signatures with the server-created order ID.
- [ ] Verify webhook signatures against the exact raw body.
- [ ] Validate order/payment IDs, amount, currency, and state transitions.
- [ ] Persist/deduplicate the provider event ID.
- [ ] Keep payment success independent of Solana.

### Before Removing Existing Payment Logic

- [ ] Real Test Mode order creation works.
- [ ] Frontend Checkout uses the backend-created order ID.
- [ ] Captured, failed, delayed, duplicate, and out-of-order events are handled.
- [ ] The development simulation path cannot race with real payment processing.
- [ ] Existing mock behavior is isolated or intentionally removed.
- [ ] Refund behavior is tested or explicitly deferred.

### Before Merge

- [ ] Backend and frontend tests pass.
- [ ] Invalid signatures never create successful donations.
- [ ] Duplicate events produce no duplicate receipts, audit events, or state transitions.
- [ ] Provider/network/database failure behavior is explicit and recoverable.
- [ ] A valid payment succeeds while Solana/RPC is unavailable.
- [ ] Payment events feed the PostgreSQL audit chain.
- [ ] No credentials, signatures, or sensitive raw payloads are committed or logged.
- [ ] `razorpay.ts` changes are reviewed against the confirmed Test Mode payloads and official documentation.

## Authoritative References Reviewed

- Razorpay Orders API: `https://razorpay.com/docs/api/orders/create/`
- Razorpay Node.js payment integration: `https://razorpay.com/docs/payments/server-integration/nodejs/payment-gateway/build-integration/`
- Razorpay payment webhook payloads: `https://razorpay.com/docs/webhooks/payloads/payments/`
- Razorpay webhook validation and Test Mode: `https://razorpay.com/docs/webhooks/validate-test/`
- Repository source: `backend/src/routes/webhooks/razorpay.ts`, `backend/src/services/donationService.ts`, `backend/src/routes/donor.ts`, `backend/prisma/schema.prisma`, `frontend/src/components/DonateDialog.tsx`, and `frontend/src/services/mockPayments.ts`