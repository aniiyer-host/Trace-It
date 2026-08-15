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

