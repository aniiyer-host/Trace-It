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

