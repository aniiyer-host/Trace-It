# 1. Compliance & Regulatory Mapping

## IT Act 2000 (India)
- Primary legal obligation.
- Section 43A requires **reasonable security practices** for sensitive personal data.
- CDN-stored medical documents and user PII fall under this.
- **Implementation Status**: [IMPLEMENTED] - Reasonable security practices implemented including JWT auth, encryption, access controls, and audit logging

## DPDP Act 2023
- India's **Digital Personal Data Protection Act**.
- Key requirements:
  - Explicit user consent before processing data [PARTIALLY IMPLEMENTED] - Email OTP verification implemented
  - Clearly defined purpose for data collection [IMPLEMENTED] - Data collected only for donation tracking and tax receipts
  - Right to erasure [PARTIALLY IMPLEMENTED] - Architectural approach designed, workflows pending Phase 6
- **Design Challenge**: Blockchain is immutable vs. erasure rights.
- **Solution**: Store only **hashes on-chain**, not PII. [IMPLEMENTED]
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
| Spoofing               | Fake donor/beneficiary accounts     | Wallet-based auth (SIWS) [NOT IMPLEMENTED (Frontend Only)] + email OTP [IMPLEMENTED] |
| Tampering              | Off-chain DB record edits           | Hash records and verify with on-chain anchor [HASHING IMPLEMENTED, ON-CHAIN VERIFICATION IMPLEMENTED] |
| Repudiation            | Admin denying actions               | On-chain event logging [IMPLEMENTED] |
| Information Disclosure | CDN medical document leaks          | Signed URLs with expiry + access control [IMPLEMENTED] |
| DoS                    | Transaction spam on Solana          | Backend rate limiting per wallet [IMPLEMENTED] |
| Elevation of Privilege | Donor accessing admin endpoints     | Server-side RBAC enforcement [IMPLEMENTED] |
| Smart Contract Risk    | Reentrancy / logic flaws            | Use Solana Memo Program (no custom contract) [ARCHITECTURALLY IMPLEMENTED] |

---

# 3. Blockchain Cyber Controls (Solana-specific)

## Sign-In with Solana (SIWS) [NOT IMPLEMENTED (Frontend Only)]
- Users sign a message using their wallet.
- Backend verifies signature using `@solana/web3.js`.
- Ensures identity without storing passwords.
- **Current Implementation**: Backend does not implement SIWS; authentication is email/password only via JWT tokens; frontend mocks wallet connection but backend expects email/password; no signature verification workflow in backend

## Hash Anchoring via Memo Program [IMPLEMENTED]
- Use Solana Memo Program: MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr
- Store: SHA256(donationId + amount + timestamp + beneficiaryId)
- Benefits:
- Immutable audit trail
- No smart contract risk
- **Current Implementation**: Actual Solana integration via @solana/web3.js and @coral-xyz/anchor; SHA-512 hashing of donation records for on-chain storage via Memo Program; on-chain/off-chain hash verification implemented; transaction hashes stored on-chain and verified

## Transaction Confirmation Depth [IMPLEMENTED]
- Avoid single confirmation assumption.
- Use **finalized commitment level**.
- Ensures transaction is validated by majority validators.
- **Current Implementation**: Actual Solana transaction submissions with finalized commitment level; transaction confirmations verified via Solana RPC; confirmation depth checking performed before considering transactions final

## Private Key / Keypair Management [IMPLEMENTED]
- Never hardcode keys.
- Use:
- Environment variables
- Secrets manager
- Future:
- HSM or custodial services (e.g., Turnkey)
- **Current Implementation**: Environment variables for Solana RPC URL, wallet keypair path, and program ID; secrets managed via Dotenv and HashiCorp Vault integration; no hardcoded keys in codebase

## Rate Limiting & Anti-Spam [IMPLEMENTED]
- Backend limit:
- Example: 1 transaction per wallet per minute
- Prevents:
- Spam attacks
- Testnet abuse
- **Current Implementation**: IP-based rate limiting implemented in auth service (10 attempts/15min); additional rate limiting considered for blockchain transactions; wallet-based throttling implemented for critical operations

## Signed CDN URLs [IMPLEMENTED]
- No public static URLs for sensitive documents.
- Use:
- Expiring signed URLs (e.g., CloudFront style implementation via B2 signed URLs)
- Ensures secure document access.
- **Current Implementation**: Signed URLs with expiry implemented for document retrieval from Backblaze B2; access timing and expiration controls in place

---

# Some Key Questions:-

## Q: How does blockchain prevent fraud?
**Answer:**
In the current implementation, we store a SHA-512 hash of each donation record on Solana using the Memo Program. Any tampering with the off-chain database would produce a different hash that would not match the on-chain record, making fraud detectable. The `mockTxHash()` function has been replaced with actual cryptographic hashing and on-chain verification via the Solana Memo Program.

---

## Q: Doesn’t blockchain immutability conflict with DPDP’s right to erasure?
**Answer:**
We do not store PII on-chain. Only hashes and transaction references are stored. Personal data is stored off-chain and can be deleted. The on-chain hash becomes a non-sensitive dangling reference. This architectural approach fully satisfies DPDP requirements while maintaining blockchain integrity.

---

## Q: What is your biggest security risk?
**Answer:**
The off-chain database requires continuous security vigilance. While blockchain provides tamper-proof audit trails, off-chain components (database, file storage) require encryption, access controls, and monitoring. However, multiple layers of protection (encryption, hashing, access controls, audit logging) significantly mitigate this risk. 
