# Security Guidance for Trace It Platform

This document provides a security-focused overview of the Trace It platform for Claude Code assistants.

## Key Security Controls & Implementation Status

### Authentication & Authorization
- **Current State**: Mock implementations (`mockAuth.ts`, `mockWallet.ts`) accept any credentials; no real validation.
- **Planned**: Wallet-based SIWS with `@solana/web3.js`, email OTP, role-based access control (RBAC) for donor/NGO/admin.
- **Risk**: High - trivial bypass possible.

### Data Protection
- **Architecture**: PII stored off-chain only; donation record hashes anchored on Solana via Memo Program.
- **Current State**: Hashing uses mock functions (non-cryptographic); no actual on-chain anchoring.
- **Risk**: High - no tamper-evidence; PII stored plaintext in Zustand stores.

### Threat Model (STRIDE)
| Threat          | Mitigation Planned               | Current Status      |
|-----------------|----------------------------------|---------------------|
| Spoofing        | SIWS + email OTP                 | Partially mocked    |
| Tampering       | Hash + on-chain anchor           | Not implemented     |
| Repudiation     | On-chain event logging           | Not implemented     |
| Info Disclosure | Signed URLs + access control     | Not implemented     |
| DoS             | Backend rate limiting per wallet | Not implemented     |
| Privilege Escalation | Server-side RBAC          | Not implemented     |
| Smart Contract  | Use Solana Memo Program only     | Architecturally safe|

### Residual Risks (High)
1. Authentication/authorization bypass via mock services.
2. Lack of cryptographic hashing for on-chain anchoring.
3. Client-side plaintext PII storage vulnerable to XSS.
4. Missing rate limiting enabling DoS/spam.
5. Absence of security event logging/audit trail.
6. No dependency scanning or secrets management.

### Immediate Recommendations
1. Replace mock authentication with real backend verification.
2. Implement actual SHA-256 hashing and Solana Memo Program integration.
3. Add environment-based configuration with secrets protection.
4. Enforce input validation and sanitization on all inputs.
5. Implement role-based access controls (donor/NGO/admin).
6. Add backend rate limiting (per wallet/IP).
7. Integrate security event logging and monitoring.
8. Configure security headers (CSP, HSTS) for production.
9. Establish automated dependency scanning (npm audit, Snyk).
10. Conduct manual penetration testing pre-production.

### Compliance Notes
- Architecture aligns with DPDP/GDPR (PII off-chain, hashes on-chain) but lacks operational controls.
- RBI/VDA considerations satisfied by using blockchain as logging layer only (no crypto issuance).
- IT Act 2000 & DPDP Act 2023 partially met via architectural decisions; functional controls pending.

*Last Updated: 2026-08-15*