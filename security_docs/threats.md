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

