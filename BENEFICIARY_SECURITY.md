# Beneficiary ID Verification Security Overview

## 1. OVERVIEW
This document outlines the beneficiary ID verification system and its role in Trace-It's trust model. The system ensures that funds raised for a specific beneficiary are verifiably delivered to that exact individual, maintaining the core cryptographic integrity and trust guarantees of the platform.

## 2. THE THREAT WE ARE PROTECTING AGAINST
- **Fund Misdirection/Embezzlement**: An NGO claiming to deliver funds to beneficiary A but actually delivering them to beneficiary B, or keeping the funds entirely.
- **Cryptographic Proof Requirement**: There is a critical need for cryptographic proof that the correct, originally intended beneficiary actually received the funds, preventing bait-and-switch fraud.

## 3. CURRENT IMPLEMENTATION (Phase 3)
- **What data is collected**: A beneficiary wallet ID. This is currently a randomly generated identifier, not personal identifying information (PII).
- **Hashing strategy**: HMAC-SHA512.
- **Salt strategy**: The `campaign.id` is used as the HMAC key/salt.
  - *Why?* This provides per-campaign uniqueness without requiring a globally managed secret. It prevents cross-campaign hash reuse attacks (rainbow tables or replay attacks across different campaigns).
- **Where the hash is stored**: In the `Campaign` model, under the `beneficiaryIdHash` field.
- **What is NEVER stored**: The raw beneficiary wallet ID is never stored in the database.
- **Verification flow**: During the delivery attestation process, the NGO must re-enter the beneficiary's wallet ID. The system re-hashes this entered ID using the same `campaign.id` salt and compares it to the stored hash. A match confirms the correct beneficiary. A mismatch triggers a 422 error and flags the NGO.
- **What happens on mismatch**: A 422 HTTP response is returned, the NGO receives a warning, the mismatch event is logged, and administrators can see that the NGO has been flagged for a failed delivery attempt.

## 4. WHAT THE CYBERSECURITY TEAM SHOULD REVIEW
- Is HMAC-SHA512 using `campaign.id` as the salt sufficient, or should an additional global pepper or separate secret be added?
- Should delivery mismatch attempts be rate-limited to prevent brute-force guessing of the wallet ID?
- Should repeated mismatches trigger an automatic suspension of the NGO's account?
- Is the current mock beneficiary wallet ID format (`SOL` prefix + random hex string) providing sufficient entropy for the hash input?
- Should the hash comparison be performed using a constant-time comparison function to prevent timing attacks? (Currently, it uses standard `===` equality checking, which is not constant time).

## 5. KNOWN LIMITATIONS IN CURRENT PHASE
- Wallet IDs are currently mocked/simulated and are not real Solana wallets on the blockchain.
- The "wallet ID" is merely a random string; it does not cryptographically prove that the beneficiary actually controls a real digital wallet.
- There is currently no zero-knowledge (ZK) proof of delivery. The system relies on the NGO self-reporting the wallet ID, albeit backed by a cryptographic commitment.
- Mismatch logging is currently implemented on the frontend only and is not yet written to a secure audit log table in the database.

## 6. WHAT CHANGES WHEN BLOCKCHAIN PHASES ARE IMPLEMENTED
- The mock wallet generation will be replaced by authentic Solana wallet creation.
- The wallet ID will transition from a random string into a real public key that can be independently verified on-chain.
- Zero-Knowledge (ZK) proofs may replace or supplement the current hash comparison mechanism.
- The cybersecurity team will need to thoroughly review the hashing and verification strategy again when these blockchain features are integrated.
