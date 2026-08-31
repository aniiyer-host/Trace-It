# Trace-It Architecture & Working Details

This document explains how Trace-It achieves **donation traceability**, **donor anonymity**, and **trust** through a combination of on‑chain (Solana) and off‑chain (backend/database) components. It covers the data flow, what is stored where, how transactions are signed and verified, and how the system ensures that funds reach the intended recipient while protecting donor identity.

---

## 1. High‑Level Overview

Trace-It consists of three loosely coupled layers:

| Layer | Technology | Responsibility |
|-------|------------|----------------|
| **Frontend** | React + Vite + TypeScript | User interface for donors, NGOs, admins. Communicates with the backend via REST API. |
| **Backend** | Node.js / Express / TypeScript, Prisma ORM, Supabase Postgres | Business logic: payment processing (Razorpay), donation record keeping, identity mapping, signing and sending Solana transactions, webhook handling, status updates, reconciliation. |
| **Blockchain (Solana)** | Solana blockchain + Anchor framework (Rust) | Immutable, public ledger that stores a verifiable hash of each donation and basic metadata. The program authority is the backend’s wallet (or a shared wallet in production). |

The backend acts as the **trusted intermediary** that knows the real donor identity (via the userId) but only ever publishes a **cryptographic hash** of that identity on‑chain. The on‑chain data is public and tamper‑proof, allowing anyone to audit that a donation of amount X was recorded for a given NGO/campaign at a specific time, without being able to trace it back to an individual unless they possess the backend’s secret.

---

## 2. On‑Chain Data Model

The Solana program defines several account structures (PDAs). The most important for donation traceability is `DonationRecord`.

### 2.1 DonationRecord (on‑chain)

Located at `blockchain/programs/traceit/src/state/donation_record.rs`:

```rust
pub struct DonationRecord {
    /// Off‑chain donation UUID (e.g., UUIDv4)
    #[max_len(36)]
    pub donation_id: String,

    /// SHA‑512 hash of (userId + secret) — **never store raw userId**
    #[max_len(128)]
    pub donor_id_hash: String,

    /// NGO profile ID
    #[max_len(36)]
    pub ngo_id: String,

    /// Campaign/project ID
    #[max_len(36)]
    pub campaign_id: String,

    /// Donation amount in paisa (INR * 100)
    pub amount_paisa: u64,

    /// Currency code (always "INR")
    #[max_len(3)]
    pub currency: String,

    /// Unix timestamp of the donation
    pub timestamp: i64,

    /// Current status:
    /// 0=Initiated, 1=Success, 2=Allocated, 3=Disbursed, 4=Delivered
    pub status: u8,

    /// SHA‑512 hash of the **full** donation record for tamper detection
    #[max_len(128)]
    pub record_hash: String,

    /// Bump seed for PDA derivation
    pub bump: u8,
}
```

**Key points:**

* `donation_id` is used as part of the PDA seed, so the on‑chain account address is deterministic:  
  `PDA = create_program_address([b"donation", donation_id_without_hyphens], program_id)`.  
  This lets anyone look up the record by knowing only the donation UUID (which is also stored off‑chain).

* `donor_id_hash` = SHA‑512( userId ‖ secret ).  
  The secret is an environment variable known **only to the backend** (and therefore to anyone who controls the backend). Without the secret, it is computationally infeasible to recover `userId` from the hash.

* `record_hash` = SHA‑512( concatenation of all the above fields ).  
  This provides an integrity check: after reading the record from the chain, anyone can recompute the hash and verify it matches `record_hash`. If a malicious actor tried to alter any on‑chain field, the hash would mismatch.

* `status` follows a simple lifecycle that can be advanced by authorized calls (see Section 4).

### 2.2 Other On‑Chain Accounts

* `NgoRecord` – stores NGO‑specific info (name, wallet address, verification status, etc.).
* `CohortRecord` – groups donations for reporting / disbursement.
* `DisbursementRecord` – tracks when funds are sent from the treasury to an NGO wallet.

These are less central to donor anonymity but are part of the overall traceability of funds from donor → platform → NGO → beneficiary.

---

## 3. Off‑Chain Data Model (Backend)

The backend uses a Postgres database via Prisma. Relevant tables (simplified) include:

| Table | Columns (relevant) | Purpose |
|-------|--------------------|---------|
| `donations` | `id` (UUID), `userId` (FK to users), `donation_id` (UUID, same as on‑chain), `ngo_id`, `campaign_id`, `amount_paisa`, `currency`, `timestamp`, `status`, `donor_id_hash`, `record_hash`, `razorpay_order_id`, `razorpay_payment_id`, `receipt_url`, … | Primary source of truth for the application; stores both the raw `userId` (for internal operations like emailing receipts) and the on‑chain derived fields (`donor_id_hash`, `record_hash`). |
| `users` | `id`, `email`, `name`, `hashed_password`, … | Donor accounts. |
| `ngos` | `id`, `name`, `wallet_address`, `verified`, … | NGO profiles. |
| `campaigns` | `id`, `ngo_id`, `title`, `description`, `target_amount`, … | Fundraising campaigns. |
| `blockchain_transactions` | `signature`, `slot`, `status`, `donation_id`, … | Log of every on‑chain transaction attempt (for retries & auditing). |

**Important:** The backend **never** writes the raw `userId` to the Solana chain. It only ever writes the hash (`donor_id_hash`). The mapping `userId → donor_id_hash` is stored in the `donations` table (and can be recomputed as needed).

---

## 4. Transaction Flow – From Donation to On‑Chain Record

Below is the step‑by‑step process when a donor makes a contribution.

### 4.1 Frontend → Backend: Initiate Payment

1. Donor selects an NGO/campaign and enters an amount.
2. Frontend calls `POST /api/donor/create-order` (or similar) → backend.
3. Backend:
   * Generates a Razorpay order (amount in paisa, currency INR, random receipt).
   * Returns the Razorpay order ID and other needed data to the frontend.
   * At this point, a pending donation record is **not** yet created in the DB (or it is created with status `Initiated` – depends on implementation).

### 4.2 Frontend → Razorpay: Payment

4. Frontend redirects donor to Razorpay checkout (or uses Razorpay JS) with the order details.
5. Donor completes payment using UPI, card, netbanking, etc.
6. Razorpay redirects back to the frontend with `razorpay_payment_id`, `razorpay_order_id`, and `razorpay_signature`.

### 4.3 Frontend → Backend: Payment Verification

7. Frontend sends the three Razorpay parameters to `POST /api/donor/verify-payment`.
8. Backend:
   * Retrieves the Razorpay key secret from env.
   * Computes HMAC‑SHA256(order_id \| payment_id) and compares to the signature.
   * If valid, proceeds; else returns error.

### 4.4 Backend: Create Off‑Chain Donation Record

9. Backend creates a row in `donations`:
   * `donation_id` = newly generated UUID (or the one passed from frontend).
   * `userId` = the authenticated donor’s internal ID.
   * `ngo_id`, `campaign_id`, `amount_paisa`, `currency`, `timestamp` = now.
   * `status` = `Success` (or `Initiated` → will be updated to Success after on‑chain confirmation).
   * Computes:
     ```
     donor_id_hash = sha512( userId || SECRET )
     record_hash   = sha512( concat(donation_id, donor_id_hash, ngo_id, campaign_id,
                                  amount_paisa, currency, timestamp, status) )
     ```
   * Stores `donor_id_hash` and `record_hash` in the row.

### 4.5 Backend → Solana: On‑Chain Record

10. Backend calls the `blockchainService.recordDonation` function:
    * Builds an instruction to the Solana program `traceit`:
        - Program ID: read from `BLOCKCHAIN_PROGRAM_ID` env (or Anchor.toml).
        - Accounts:
            * `donation_record` PDA: `[
                b"donation",
                donation_id_without_hyphens
              ]`
            * `authority`: the backend’s wallet (the signer that pays transaction fee).
            * `system_program`: Solana system program.
        - Data: the arguments (`donation_id`, `donor_id_hash`, `ngo_id`, `campaign_id`, `amount_paisa`, `currency`, `timestamp`, `record_hash`).
    * Signs and sends the transaction using the backend’s wallet keypair (`SOLANA_WALLET_KEYPAIR_PATH` env or the key stored in the platform secret manager).
    * Waits for confirmation (or relies on retry processor for async handling).

11. Solana Program (`record_donation` handler):
    * Validates input lengths and that `amount_paisa > 0`.
    * Creates (or updates) the `DonationRecord` account at the PDA with the provided data.
    * Sets `status = 1` (Success) because the backend only calls this after payment verification.
    * Emits a log message: `TraceIt: Donation recorded on-chain: {donation_id}`.
    * Returns success.

### 4.6 Backend: Update Off‑Chain Record & Notify

12. On transaction success, backend:
    * Updates the `donations` row to set `status = Success` (if not already).
    * Optionally stores the transaction signature for audit.
    * Sends a confirmation email/receipt to the donor (using `userId` to look up email).
    * Returns success to frontend.

13. Frontend shows donation confirmation screen.

---

## 5. Status Lifecycle & Further On‑Chain Updates

After the initial success, the donation may progress through additional stages, each triggered by an authorized party (usually the backend acting on behalf of an NGO or admin) calling the `update_donation_status` instruction.

### 5.1 Update Donation Status Instruction

Defined in `blockchain/programs/traceit/src/instructions/update_status.rs` (excerpt):

```rust
#[derive(Accounts)]
#[instruction(donation_id: String, new_status: u8)]
pub struct UpdateDonationStatus<'info> {
    #[account(
        mut,
        seeds = [b"donation", donation_id.replace("-", "").as_bytes()],
        bump = donation_record.bump,
        has_one = authority   // authority must match the account that can update
    )]
    pub donation_record: Account<'info, DonationRecord>,

    #[account(mut)]
    pub authority: Signer<'info>, // Typically backend wallet or NGO wallet

    pub system_program: Program<'info, System>,
}
```

The handler simply updates `record.status = new_status` after basic validation.

### 5.2 Typical Transitions

| Status | Meaning | Who can trigger |
|--------|---------|-----------------|
| 0 – Initiated | Order created, payment pending | Frontend (via backend) |
| 1 – Success | Payment verified, on‑chain record created | Backend (after verification) |
| 2 – Allocated | NGO has accepted the donation and earmarked it for a specific beneficiary/project | NGO portal / admin |
| 3 – Disbursed | Funds have been sent from the platform treasury to the NGO’s wallet | Backend (treasury service) |
| 4 – Delivered | Beneficiary confirms receipt (via NGO update or beneficiary feedback) | NGO / beneficiary portal |

Each transition results in a new Solana transaction (signed by the authorized authority) that updates the same `DonationRecord` PDA. Because the address is deterministic, anyone can watch the chain and see the status evolve over time.

---

## 6. How Anonymity Is Preserved

| Element | What is stored on‑chain | Can it be reversed to identify donor? |
|---------|-------------------------|--------------------------------------|
| `userId` | **Never** stored on‑chain. | N/A |
| `donor_id_hash` | `SHA512( userId || secret )` | Without the secret, it is computationally infeasible to recover `userId`. Even if an attacker knows a particular `userId`, they would need to try all possible secrets (the secret is a high‑entropy string stored only in the backend). |
| `record_hash` | Hash of all fields, including `donor_id_hash`. | Does not reveal `userId` by itself. |
| `donation_id`, `ngo_id`, `campaign_id`, `amount`, `timestamp`, `status` | Publicly visible. | These alone do not identify the donor. |

The backend holds the secret (as an environment variable) and can map a `donor_id_hash` back to a `userId` by looking up the `donations` table (or recomputing the hash for each user if needed, though typically the mapping is stored). Thus, the backend can still send receipts, tax documents, etc., while the public ledger shows only an opaque hash.

**Note:** If the secret were ever leaked, past donations could be de‑anonymized. The secret should be rotated periodically (with a migration to re‑hash existing records) and treated as a sensitive credential.

---

## 7. How Trust & Traceability Are Ensured

1. **Immutability** – Once a transaction is confirmed on Solana, the data cannot be altered or removed. Anyone can query the PDA at any time and see the exact same fields that the backend originally submitted.

2. **Public Verifiability** – The Solana explorer or any RPC client can call `getAccountInfo` on the donation PDA and retrieve the stored `DonationRecord`. The `record_hash` field allows independent verification:
   * Re‑compute the SHA‑512 hash of the retrieved fields (excluding `record_hash` itself and `bump`).
   * Compare to the stored `record_hash`. A match proves the data has not been tampered with since it was written.

3. **Transaction Signing & Audit** – Each on‑chain call is signed by the backend’s wallet (or an authorized NGO/admin wallet). The signature is visible on‑chain, so anyone can confirm that a particular update originated from a trusted key. The backend logs every transaction signature in `blockchain_transactions` for internal auditing.

4. **Off‑Chain ↔ On‑Chain Consistency** – The backend stores the same logical data in Postgres. A background job (`blockchainRetryProcessor`) watches for:
   * Transactions that failed to confirm (and retries them with exponential backoff).
   * Discrepancies between the off‑chain `record_hash` and the on‑chain record (if any).
   * If a mismatch is found, it can raise an alert or trigger a re‑submission.

5. **Deterministic Addressing (PDA)** – Because the donation record address is derived from the `donation_id`, there is no need to maintain a separate on‑chain mapping table. Anyone who knows the donation ID (which is also returned to the donor in the receipt) can look up the on‑chain record directly.

6. **Upgrade Authority Control** – The Solana program’s upgrade authority is held by the same wallet that acts as the `authority` in transactions. In production, this is a shared, multi‑sig or hardware‑wallet‑protected key, ensuring that only authorized parties can upgrade the program logic (thus preventing malicious changes to the record structure).

---

## 8. Data Flow Diagram (textual)

```
+----------------+        +-------------------+        +---------------------+
|   Frontend     | <--->  |   Backend (API)   | <--->  |   Solana Cluster    |
| (React/Vite)   | HTTP   | (Node/Express)    | RPC    | (Devnet/Mainnet)    |
+----------------+        +-------------------+        +---------------------+
        ^                         ^                         ^
        |                         |                         |
        | 1. Create Razorpay order|                         |
        |------------------------>|                         |
        |                         |                         |
        | 2. Redirect to Razorpay |                         |
        |                         |                         |
        |                         |                         |
        | 3. Payment completed    |                         |
        |                         |                         |
        | 4. Verify signature     |                         |
        |<------------------------|                         |
        |                         |                         |
        | 5. Compute donor_id_hash|                         |
        |    & record_hash        |                         |
        |                         |                         |
        | 6. Insert into Postgres |                         |
        |                         |                         |
        | 7. Build & sign tx      |                         |
        |                         |------------------------>|
        |                         |                         |
        |                         | 8. RecordDonation ix   |
        |                         |<------------------------|
        |                         |                         |
        | 9. Confirmation         |                         |
        |<------------------------|                         |
        |                         |                         |
        |10. Update status (alloc|disb|delivered) as needed|
        |                         |------------------------>|
        |                         |                         |
        |                         | 11. UpdateDonationStatus|
        |                         |<------------------------|
        +-------------------------+-------------------------+
```

---

## 9. Summary of Guarantees

| Property | How It Is Achieved |
|----------|-------------------|
| **Donor anonymity** | Only a keyed hash (`donor_id_hash`) of the donor identifier appears on‑chain; the key is secret to the backend. |
| **Funds traceability** | Every donation creates an immutable on‑chain record with amount, NGO/campaign IDs, timestamp, and status. The transaction chain shows flow from backend wallet → program → donation PDA. |
| **Tamper evidence** | `record_hash` lets any observer detect post‑fact alteration of on‑chain fields. |
| **Auditability** | All transaction signatures are public; backend logs them internally; Reconciliation job detects mismatches. |
| **Upgradability with control** | Program upgrade authority is held by a secure wallet (multisig/HSM), preventing unauthorized logic changes. |
| **Fault tolerance** | `blockchainRetryProcessor` retries failed transactions; off‑chain DB acts as a fallback source of truth. |
| **Scalability** | Reading donation status from the chain is cheap (single account lookup). Heavy analytics/queries run off‑chain against Postgres. |

---

## 10. Recommendations for Future Hardening

* **Rotate the donor secret** periodically and re‑hash existing `donor_id_hash` values (requires a migration script that reads all donations, recomputes hash with new secret, and updates both DB and on‑chain via a transaction that updates `donor_id_hash` and `record_hash`).
* **Use a multi‑sig or threshold wallet** for the program authority in production to avoid a single point of failure.
* **Consider zero‑knowledge proofs** (e.g., zk-SNARKs) if you ever need to prove properties about the donation amount or NGO eligibility without revealing the amount itself on‑chain.
* **Add encryption** for sensitive off‑chain fields (e.g., user email) at rest, and enforce strict IAM rules on the database.
* **Implement rate‑limiting and monitoring** on the Solana RPC endpoints used by the backend to prevent draining transaction fees due to bugs or attacks.

---

## 11. Conclusion

Trace-It achieves a strong balance between **privacy** (donor anonymity via keyed hashing) and **transparency** (public, immutable ledger of donation facts). The backend acts as the trusted party that knows real identities but only ever commits cryptographic commitments to the chain. Anyone can audit that a donation of a specific amount was recorded for a specific NGO at a specific time, and they can verify the data hasn’t been altered. Meanwhile, the donor’s real identity remains hidden unless the backend’s secret is compromised—a risk mitigated by treating that secret as a highly protected credential and rotating it as needed.

This design satisfies the core goals of the platform: donors can give with confidence that their money reaches the intended cause, and they can do so without exposing their personal information to the public blockchain.

--- 

*End of document*.