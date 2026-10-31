# Trace-It — F-06 Architecture Review and Refined Implementation Plan

---

## 1. Provenance Event Payload & Tamper-Evident Evidence

### A. Codebase Audit of Existing Hashing and Canonicalization

Inspected files:
- [`backend/src/utils/provenance.ts`](backend/src/utils/provenance.ts#L90-L175)
- [`backend/src/services/provenanceChainService.ts`](backend/src/services/provenanceChainService.ts#L37-L73) and [lines 120–145](backend/src/services/provenanceChainService.ts#L120-L145)
- [`backend/src/services/anchor/anchorBatchService.ts`](backend/src/services/anchor/anchorBatchService.ts#L50-L56) and [lines 190–210](backend/src/services/anchor/anchorBatchService.ts#L190-L210)
- Existing tests: [`backend/tests/simulation.test.ts`](backend/tests/simulation.test.ts#L138-L158) and [`backend/tests/disbursement.test.ts`](backend/tests/disbursement.test.ts#L284-L300)

**Key Finding:**
The canonical payload and cryptographic hash commit **strictly and exclusively** to the fields defined in `CanonicalProvenanceEvent` ([`backend/src/utils/provenance.ts#L101-L110`](backend/src/utils/provenance.ts#L101-L110)):
1. `schemaVersion` (always `1`)
2. `eventType` (string)
3. `entityType` (string)
4. `entityId` (string, validated UUID)
5. `amountInr` (string, validated 2-decimal non-negative decimal)
6. `ngoId` (string | null, validated UUID or null)
7. `campaignId` (string | null, validated UUID or null)
8. `occurredAt` (string, ISO-8601 UTC timestamp)

`transitionKey` is a database column on `provenance_events` (`transitionKey String`), but **it is not included in `CanonicalProvenanceEvent`, `serializeProvenanceEvent()`, or `hashProvenanceEvent()`**. Therefore, storing policy information solely in `transitionKey` does not provide cryptographic tamper-evidence.

Furthermore, both [`anchorBatchService.ts#L196`](backend/src/services/anchor/anchorBatchService.ts#L196) and [`provenanceChainService.ts#L120-L135`](backend/src/services/provenanceChainService.ts#L120-L135) verify rows by reconstructing `ProvenanceEventInput` strictly from the table columns: `eventType`, `entityType`, `entityId`, `amountInr`, `ngoId`, `campaignId`, `occurredAt`, then comparing `serializeProvenanceEvent(input) === event.canonicalPayload`. Changing `CanonicalProvenanceEvent` schema or keys would break backward compatibility with existing anchored events and regression suites.

### B. Recommended Architecture: Smallest Compatible Tamper-Evident Mapping

To provide cryptographic, tamper-evident proof of all 6 required elements without breaking the existing hash format or canonicalization rules, we map them directly into the 7 canonical fields:

| Required Element | Canonical Field | Value / Representation | Verification Guarantee |
|---|---|---|---|
| **Campaign ID** | `campaignId` AND `entityId` | `campaignId` (UUID) | Validated UUID committed in hash payload. |
| **Policy Field (`allowOverfunding`)** | `entityType` | `"CampaignPolicy:allowOverfunding:${previousValue}->${newValue}"` | Field name committed in canonical JSON and payload hash. |
| **Previous & New Value** | `entityType` | `"CampaignPolicy:allowOverfunding:false->true"` (or `true->false`) | Explicit state transition committed directly in canonical JSON and payload hash. |
| **Acting Administrator ID** | `ngoId` | `adminId` (admin's Profile UUID) | Validated UUID in canonical JSON; captures acting principal. |
| **Occurrence Timestamp** | `occurredAt` | `occurredAt` (`Date` -> ISO-8601 string) | Precise occurrence timestamp committed in hash payload. |
| **Amount (Non-monetary)** | `amountInr` | `"0.00"` | Conforms to `normalizeAmountInr` regex. |

**Resulting Canonical Payload (`canonicalPayload`):**
```json
{
  "schemaVersion": 1,
  "eventType": "CAMPAIGN_POLICY_UPDATED",
  "entityType": "CampaignPolicy:allowOverfunding:false->true",
  "entityId": "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
  "amountInr": "0.00",
  "ngoId": "f9e8d7c6-b5a4-3210-fedc-ba9876543210",
  "campaignId": "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
  "occurredAt": "2026-10-31T21:49:45.000Z"
}
```

**Why this is the smallest, safest change:**
1. Zero modifications to `backend/src/utils/provenance.ts` canonicalization rules or `PROVENANCE_SCHEMA_VERSION`.
2. Zero modifications to `verifyProvenanceEvents()` or `anchorBatchService.ts`.
3. Every required field is serialized, hashed via SHA-512 into `payloadHash`, chained into `chainHash`, and anchored to Solana.

---

## 2. Audit Logging and SIEM Compatibility

### A. Current Implementation Analysis

[`backend/src/services/auditLogService.ts`](backend/src/services/auditLogService.ts#L21-L56) performs two actions:
1. Database persistence: `await prisma.auditLog.create(...)`.
2. SIEM forwarding: `logger.info('Security Event', { eventType: params.action, ... })` ([`backend/src/utils/logger.ts`](backend/src/utils/logger.ts#L1-L43) with Winston Console and optional Elasticsearch transport).

**Defects in naive implementations:**
- Directly calling `tx.auditLog.create(...)` bypasses SIEM (`logger.info('Security Event')`).
- Directly calling existing `writeAuditLog(...)` inside the transaction bypasses the transaction boundary (runs on `prisma`, not `tx`), swallows errors (preventing rollback on failure), and emits SIEM logs *before* commit (which would emit phantom SIEM events if the transaction subsequently rolls back).

### B. Recommended Strategy: Transactional Database Persistence with Post-Commit SIEM Forwarding

We distinguish **transactional database guarantees** from **external SIEM delivery guarantees**:

1. **Transactional Database Persistence (Atomic & Rollback-Safe):**
   Inside `prisma.$transaction`:
   - Call `await tx.auditLog.create({ data: auditLogData })`.
   - Any database write error will bubble up and roll back the campaign update, audit log, and provenance event together.
2. **Post-Commit SIEM Forwarding (At-Least-Once Delivery):**
   - Store the audit payload in memory during the transaction.
   - **Immediately after `prisma.$transaction` successfully commits**, forward the event to SIEM via `logger.info('Security Event', ...)`.
   - Wrap the post-commit SIEM forward in a `try/catch` to ensure that if the external SIEM transport (e.g. Elasticsearch) is down, it logs a fallback warning via Winston (`exitOnError: false`) without failing the already-committed HTTP response or corrupting DB state.
3. **No Second Architecture:**
   Reuse the existing `AuditLogParams` structure and `logger.info('Security Event', ...)` convention from `auditLogService.ts`.

---

## 3. Concurrency and Lock Ordering

### A. Existing Lock Patterns in the Codebase

Inspected files:
- [`backend/src/services/donationService.ts`](backend/src/services/donationService.ts#L175-L188) and [line 282](backend/src/services/donationService.ts#L282)
- [`backend/src/services/provenanceChainService.ts`](backend/src/services/provenanceChainService.ts#L22-L35)
- [`backend/src/routes/charity.ts`](backend/src/routes/charity.ts#L623-L628)

**Code Verification:**
In `donationService.ts`:
1. Campaign row lock is acquired first:
   `SELECT "id", "targetAmount", "raisedAmount", "allowOverfunding", "status" FROM "campaigns" WHERE "id" = ${donation.campaignId} FOR UPDATE`
2. Later in the same transaction, `appendProvenanceEvent(tx, ...)` is called.
3. Inside `appendProvenanceEvent(tx, ...)`, `acquireProvenanceChainLock(tx)` acquires the PostgreSQL transaction-scoped advisory lock:
   `SELECT pg_advisory_xact_lock(${PROVENANCE_CHAIN_LOCK_KEY}::bigint)`.

**Compatibility & Deadlock Prevention:**
Our proposed lock order for `updateCampaignOverfundingPolicy`:
1. **Campaign row lock:** `SELECT id, "allowOverfunding", "ngoId" FROM campaigns WHERE id = ${campaignId} FOR UPDATE`
2. **State evaluation & campaign update:** `tx.campaign.update(...)`
3. **Audit log creation:** `tx.auditLog.create(...)`
4. **Provenance advisory lock:** Acquired inside `appendProvenanceEvent(tx, ...)`

Because both `donationService.ts` and `updateCampaignOverfundingPolicy` acquire **Campaign Row Lock FIRST** and **Provenance Chain Advisory Lock SECOND**, the locking order is globally uniform:
$$\text{Campaign Row Lock} \longrightarrow \text{Provenance Chain Advisory Lock}$$
There is **zero lock-order inversion** and **zero risk of deadlock**.

**Transaction Isolation Level:**
Standard PostgreSQL `Read Committed` (Prisma default) is preserved. Pessimistic `SELECT ... FOR UPDATE` row locking prevents any race condition or dirty read without needing `Serializable` retries.

### B. Concurrency Test Design (Order-Agnostic)

The test will not assume `Promise.all([req1, req2])` execution order:
- Initial state: `campaign.allowOverfunding = false`.
- Launch concurrent requests:
  - Request 1: `{ allowOverfunding: true }`
  - Request 2: `{ allowOverfunding: false }`
- **Assertion Logic:**
  - If Request 1 acquires lock first: Request 1 transitions `false -> true` (Audit 1: `previous: false, new: true`, Provenance 1). Request 2 unblocks, reads `true`, transitions `true -> false` (Audit 2: `previous: true, new: false`, Provenance 2). Total events: 2.
  - If Request 2 acquires lock first: Request 2 reads `false`, identifies a **No-Op** (0 audit logs, 0 provenance events). Request 1 unblocks, reads `false`, transitions `false -> true` (Audit 1: `previous: false, new: true`, Provenance 1). Total events: 1.
  - In both scenarios, the test asserts:
    1. Both requests return HTTP 200.
    2. Audit logs form a continuous, non-overlapping transition sequence ($S_0 \to S_1 \to \dots$).
    3. Provenance events strictly match actual transitions.
    4. No spurious audit log or provenance event was created for the no-op.

---

## 4. Non-Monetary Provenance Event Compatibility

Inspected files:
- [`backend/src/routes/charity.ts`](backend/src/routes/charity.ts#L644) (disbursement sum on `disbursements.amountInr`)
- [`backend/src/services/receiptService.ts`](backend/src/services/receiptService.ts#L282-L305) (receipt eligibility checks `entityType: 'Donation', eventType: 'DONATION_SUCCESS'`)
- [`backend/src/routes/donor.ts`](backend/src/routes/donor.ts#L756-L825) (`getDonationAnchors` prefix verification)
- [`backend/src/services/anchor/anchorBatchService.ts`](backend/src/services/anchor/anchorBatchService.ts#L50-L75) (batching)

**Verification Results:**
1. **Donation Totals & Campaign Financial Accounting:** `campaign.raisedAmount` is updated exclusively in `donationService.ts` and `refundService.ts`. Financial balances are never derived by summing `provenance_events.amountInr`.
2. **Receipt Eligibility:** `receiptService.ts#L283` queries strictly `where: { entityType: 'Donation', entityId: donation.id, eventType: 'DONATION_SUCCESS' }`. A `CampaignPolicy` event cannot affect receipts.
3. **Disbursement Behaviour:** Disbursements are validated against committed allocations and `campaign.raisedAmount`, not provenance rows.
4. **Batching:** `anchorBatchService.ts` batches all contiguous events `WHERE "chainHash" IS NOT NULL AND "anchorBatchId" IS NULL ORDER BY id ASC`. The `"0.00"` event is safely included in Solana Merkle batches.
5. **Hash Chain Verification:** `verifyProvenanceEvents` verifies SHA-512 contiguity across all events. An event with `amountInr: "0.00"` satisfies the regex `^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,2})?$` and passes verification seamlessly.
6. **Donor Verification Prefix Checks:** Commit `687182e` in `donor.ts#L795-L822` verifies events up to `lastRequiredSequence`. The global chain prefix remains contiguous and valid.

---

## 5. Migration and Prisma Compatibility

### A. Repository Migration Conventions

Inspected migration history in [`backend/prisma/migrations/`](backend/prisma/migrations/):
- Migrations use `ALTER TYPE "ProvenanceEventType" ADD VALUE IF NOT EXISTS '...';` (e.g. `20261031120000_concurrent_donation_refunds/migration.sql`).
- Package version: `prisma: ^7.9.1` (Prisma 7.x ESM).

### B. Safest Migration Workflow

1. Update [`backend/prisma/schema.prisma`](backend/prisma/schema.prisma#L129-L144):
   Add `CAMPAIGN_POLICY_UPDATED` to `enum ProvenanceEventType`.
2. Generate migration using the standard Prisma workflow without manually inventing timestamps:
   ```bash
   npx prisma migrate dev --name add_campaign_policy_updated
   ```
   Or `--create-only` to review the generated SQL file before applying:
   ```bash
   npx prisma migrate dev --create-only --name add_campaign_policy_updated
   ```
3. Verify the generated migration SQL contains:
   ```sql
   ALTER TYPE "ProvenanceEventType" ADD VALUE 'CAMPAIGN_POLICY_UPDATED';
   ```
4. Run `npx prisma generate` to refresh the Prisma Client types.
5. Run against the local disposable database only.

---

## 6. Revised Test Design (`backend/tests/campaignOverfundingPolicy.test.ts`)

The test suite will cover all 10 requested areas:

1. **Enable Overfunding (`false -> true`):**
   - Admin PATCH `{ allowOverfunding: true }` on a campaign with `allowOverfunding = false`.
   - Assert: HTTP 200, returned campaign has `allowOverfunding: true`.
   - Assert: `audit_logs` has row with `action: 'CAMPAIGN_OVERFUNDING_POLICY_UPDATED'`, `metadata.previousValue: false`, `metadata.newValue: true`, `actorId: adminId`.
   - Assert: `provenance_events` has row with `eventType: 'CAMPAIGN_POLICY_UPDATED'`, `entityType: 'CampaignPolicy:allowOverfunding:false->true'`, `amountInr: '0.00'`, non-null `chainHash`.
2. **Disable Overfunding (`true -> false`):**
   - Admin PATCH `{ allowOverfunding: false }` on a campaign with `allowOverfunding = true`.
   - Assert: HTTP 200, `metadata.previousValue: true`, `metadata.newValue: false`, provenance event reflects `true->false`.
3. **No-Op Update:**
   - Admin PATCH `{ allowOverfunding: false }` when already `false`.
   - Assert: HTTP 200, campaign remains `false`.
   - Assert: `prisma.auditLog.count()` and `prisma.provenanceEvent.count()` for this campaign do not increase.
4. **Concurrent Administrative Updates:**
   - Launch concurrent requests (`false -> true` and `false -> false` / `true -> false`) via `Promise.all`.
   - Assert: Row lock serializes execution; both return 200; state transitions are valid; no duplicate or inverted records.
5. **Audit Persistence Failure (Rollback Check):**
   - Mock `tx.auditLog.create` to throw an error.
   - Assert: Request fails (500); campaign `allowOverfunding` remains unchanged in DB; no provenance event created.
6. **Provenance Append Failure (Rollback Check):**
   - Mock `appendProvenanceEvent` to throw an error.
   - Assert: Request fails (500); campaign update rolls back; audit log rolls back.
7. **SIEM Delivery Failure:**
   - Mock `logger.info` to throw during post-commit SIEM forwarding.
   - Assert: Transaction has already committed; DB state and audit log are consistent; API returns 200; error caught and logged to error stream.
8. **Unauthorized and Invalid Requests:**
   - No token -> 401 Unauthorized.
   - DONOR token -> 403 Forbidden.
   - CHARITY token -> 403 Forbidden.
   - Body `{ allowOverfunding: "invalid" }` or missing -> 400 Bad Request.
9. **Non-Existent Campaign:**
   - Random non-existent UUID -> 404 Not Found.
10. **Full Provenance-Chain Integrity:**
    - Execute `verifyProvenanceEvents()` across all stored provenance events after policy updates.
    - Assert: `localVerification.valid === true`, `errors.length === 0`.

---

## 7. Deliverable Summary & Files to Modify

| File | Change Scope |
|---|---|
| [`backend/prisma/schema.prisma`](backend/prisma/schema.prisma#L129-L144) | Add `CAMPAIGN_POLICY_UPDATED` to `ProvenanceEventType`. |
| `backend/prisma/migrations/<timestamp>_add_campaign_policy_updated/migration.sql` | Migration adding enum value to PostgreSQL. |
| [`backend/src/routes/admin.ts`](backend/src/routes/admin.ts#L592-L628) | Implement pessimistic locking (`SELECT ... FOR UPDATE`), no-op filtering, atomic campaign update, atomic audit persistence, atomic provenance chaining, and post-commit SIEM logging in `updateCampaignOverfundingPolicy`. |
| [`backend/tests/campaignOverfundingPolicy.test.ts`](backend/tests/) | New 10-point comprehensive integration test suite. |
