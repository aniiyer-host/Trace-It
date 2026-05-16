# 1. Compliance & Regulatory Mapping

## IT Act 2000 (India)
- Primary legal obligation.
- Section 43A requires **reasonable security practices** for sensitive personal data.
- CDN-stored medical documents and user PII fall under this.

## DPDP Act 2023
- India's **Digital Personal Data Protection Act**.
- Key requirements:
  - Explicit user consent before processing data
  - Clearly defined purpose for data collection
  - Right to erasure
- **Design Challenge**: Blockchain is immutable vs. erasure rights.
- **Solution**: Store only **hashes on-chain**, not PII.
- Strong architectural decision—highlight this in viva.

## PMLA / FATF
- Applies to donation platforms handling money.
- TraceIt advantage:
  - Blockchain provides a transparent audit trail.
- Admin verification acts as **Know Your Beneficiary (KYB)**.

## FCRA 2010
- Required if donations are **international**.
- NGOs must have FCRA registration.
- Mention as:
  - *“Out of scope for MVP but documented risk.”*

## RBI / VDA Consideration
- Solana is **not legal tender in India**.
- Clarification:
  - Platform does **not issue crypto**
  - Blockchain is used only as a **logging/audit layer**
- Keeps system outside RBI VDA regulations.

## GDPR (Future Scope)
- Applies if serving EU users.
- Architecture is already compliant:
  - PII stored off-chain
  - Hashes stored on-chain
- Strong design point for scalability.

---

# 2. Threat Model (STRIDE)

| Threat                  | TraceIt-specific Vector              | Mitigation |
|------------------------|-------------------------------------|------------|
| Spoofing               | Fake donor/beneficiary accounts     | Wallet-based auth (SIWS) + email OTP |
| Tampering              | Off-chain DB record edits           | Hash records and verify with on-chain anchor |
| Repudiation            | Admin denying actions               | On-chain event logging |
| Information Disclosure | CDN medical document leaks          | Signed URLs with expiry + access control |
| DoS                    | Transaction spam on Solana          | Backend rate limiting per wallet |
| Elevation of Privilege | Donor accessing admin endpoints     | Server-side RBAC enforcement |
| Smart Contract Risk    | Reentrancy / logic flaws            | Use Solana Memo Program (no custom contract) |

---

# 3. Blockchain Cyber Controls (Solana-specific)

## Sign-In with Solana (SIWS)
- Users sign a message using their wallet.
- Backend verifies signature using `@solana/web3.js`.
- Ensures identity without storing passwords.

## Hash Anchoring via Memo Program
- Use Solana Memo Program: MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr
- Store: SHA256(donationId + amount + timestamp + beneficiaryId)
- Benefits:
- Immutable audit trail
- No smart contract risk

## Transaction Confirmation Depth
- Avoid single confirmation assumption.
- Use **finalized commitment level**.
- Ensures transaction is validated by majority validators.

## Private Key / Keypair Management
- Never hardcode keys.
- Use:
- Environment variables
- Secrets manager
- Future:
- HSM or custodial services (e.g., Turnkey)

## Rate Limiting & Anti-Spam
- Backend limit:
- Example: 1 transaction per wallet per minute
- Prevents:
- Spam attacks
- Testnet abuse

## Signed CDN URLs
- No public static URLs for sensitive documents.
- Use:
- Expiring signed URLs (e.g., CloudFront)
- Ensures secure document access.

---

# Some Key Questions:-

## Q: How does blockchain prevent fraud?
**Answer:**
We store a SHA-256 hash of each donation record on Solana using the Memo Program. Any tampering with the off-chain database produces a different hash, which will not match the on-chain record, making fraud detectable.

---

## Q: Doesn’t blockchain immutability conflict with DPDP’s right to erasure?
**Answer:**
We do not store PII on-chain. Only hashes and transaction references are stored. Personal data is stored off-chain and can be deleted. The on-chain hash becomes a non-sensitive dangling reference.

---

## Q: What is your biggest security risk?
**Answer:**
The off-chain database is the weakest link. While blockchain is tamper-proof, a compromised 
