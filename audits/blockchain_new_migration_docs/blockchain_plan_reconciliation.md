# Trace-It Blockchain Plan Reconciliation

## 1. Executive Summary

The existing blockchain implementation plan and roadmap are not architecturally valid as written under the newer necessity audit. The audit establishes a different canonical position: blockchain must not sit in the critical path for donations, disbursements, NGO workflows, or core application decisions. The recommended design is a PostgreSQL-first system with a cryptographic audit trail, hash chaining, and periodic blockchain anchoring for public verifiability.

Under that baseline, the older plan and roadmap are not merely incomplete; they are materially misaligned. They treat blockchain as a primary operational dependency, on-chain status tracking as a requirement, and smart contracts as a core application layer. The audit explicitly rejects that role. The result is that the old plan/roadmap should be treated as legacy design material, not as the active architecture.

Architectural conclusion: the current blockchain effort should be substantially revised and reduced in scope. The surviving elements are the data integrity concepts, the hash-based verification patterns, and the optional public-anchor mechanism. The operational blockchain stack, smart-contract-driven status lifecycle, wallet-driven transaction workflow, and critical-path event submission should be removed or deferred unless a later business case justifies them.

## 2. Document Comparison

### blockchain_necessity_audit.md

This is the newest and most authoritative architectural assessment. It concludes that blockchain currently provides limited unique value for the Trace-It MVP and should be removed from the critical path. Its position is that the system should use PostgreSQL as source of truth and maintain a tamper-evident hash-chain audit log, with periodic blockchain anchoring for public verification. It treats blockchain as a public-verification layer, not as a core application dependency.

### blockchain_implementation_plan.md

This document assumes blockchain is a central component of the application. It defines a single unified Anchor program, describes a donation lifecycle with on-chain records and status transitions, and sets out a phased plan to integrate blockchain into donation webhooks, NGO registration, cohort hashing, disbursement flows, and later ZK/beneficiary features. It treats blockchain as a business-enabling layer, not just an audit extension.

### blockchain_implementation_roadmap.md

This document is even more expansionary. It includes custom contract architecture, per-campaign program assumptions, full status lifecycle tracking, donor/NGO/cohort/disbursement flows, and later Phase 4 ambitions around ZK verification, ImpactTokens, vendor wallets, and beneficiary redemption. It makes blockchain important to core functionality and project roadmap sequencing, which directly conflicts with the audit’s recommendation.

### Cross-document baseline

- Agreement: all three documents treat integrity, transparency, and auditability as important.
- Partial agreement: all three consider hashes, record integrity, and tamper evidence important.
- Contradiction: the audit says blockchain should be non-critical and optional; the plan and roadmap say blockchain is central to the application workflow.
- Beyond audit recommendation: the older documents add custom smart contracts, live on-chain fulfillment assumptions, frequent on-chain transactions, backend wallet infrastructure, and business logic enforcement that the audit explicitly says is unnecessary or misallocated.

## 3. Blockchain Role Comparison

### Necessity audit

- Role: optional public-verification and tamper-evidence layer
- Problem solved: public auditability and cryptographic integrity without blocking donations or disbursements
- Components depending on it: none in the critical path; only optional anchor/reconciliation services
- Critical path?: no
- Data written to blockchain: periodic hashes / roots / anchor payloads only
- Smart contracts required?: not for MVP; optional only if needed for public anchors
- Used for: auditability, verification, anchoring, not day-to-day operations
- Infrastructure: asynchronous anchor service, RPC access, signing key, monitoring, retry logic
- Security assumptions: PostgreSQL remains source of truth; blockchain is a public append-only reference, not business logic authority

### Implementation plan

- Role: core application infrastructure for transactions and status lifecycle
- Problem solved: on-chain record of donation/disbursement flow, tamper evidence, public verification of donation records, status synchronization, and eventual trust
- Components depending on it: donations, NGO approvals, cohort proof flows, disbursement approvals, public donation API, backend services
- Critical path?: yes, because webhook and status update logic call blockchain after DB writes and rely on transaction submission for trust
- Data written to blockchain: donation records, status, NGO/cohort/disbursement metadata, transaction hashes
- Smart contracts required?: yes, unified Anchor program with multiple instructions
- Used for: donations, status transitions, attestations, auditability, verification, and business-logic-like state transitions
- Infrastructure: Solana RPC, wallet keypair, retry queue, reconciliation script, blockchain service, devnet deployment
- Security assumptions: backend wallet is trusted to sign valid records; on-chain records are treated as meaningful evidence and eventual truth

### Roadmap

- Role: comprehensive on-chain operational layer spanning core flows, governance, and later beneficiary logic
- Problem solved: not just verification but full on-chain lifecycle tracking, NGO registration, cohort proof anchoring, disbursement tracking, possible ZK attestations, and future tokenized beneficiary flow
- Components depending on it: backend services, Prisma schema fields, frontend explorer links, admin flows, external wallet flows, future ImpactToken logic
- Critical path?: yes, across design and staged implementation
- Data written to blockchain: donation states, disbursement states, document hashes, Merkle roots, application metadata, future proofs and tokens
- Smart contracts required?: yes, single unified program plus future expansion to ZK and token-related functionality
- Used for: donations, disbursements, attestations, verification, public auditability, and later beneficiary engagement
- Infrastructure: RPC, wallet, program upgrades, devnet/mainnet readiness, multi-sig considerations, governance structures
- Security assumptions: custom program logic is necessary to maintain trust and enforce lifecycle; this is the strongest contradiction against the audit

## 4. Implementation Component Cross-Reference

| Component | Implementation Plan | Roadmap | Necessity Audit | Status | Reason |
|---|---|---|---|---|---|
| Smart contracts / Anchor program | Unified `traceit` program with donation, NGO, cohort, disbursement instructions | Unified program plus future expanded lifecycle and token/beneficiary features | Optional, not required for MVP; public anchoring can be simpler | MODIFY / DEFER | The program is useful only if blockchain is explicitly retained as an optional anchor layer; it is not necessary for core donation or disbursement operations |
| Wallet / account management | Backend wallet keypair, funded devnet wallet, secret config | Dedicated service wallet; future upgrade authority/multi-sig discussions | Needed only for anchor submissions; should be isolated and minimal | MODIFY | Keep the keypair pattern but reduce its role to asynchronous anchoring, not operational authorization |
| Blockchain transactions | Record donations and update status on-chain in real workflow | Planned for all lifecycle events and status transitions | Should be asynchronous and non-critical | MODI FY / REMOVE | Transaction submission should be best-effort, batched, and delayed; not a blocker for DB operations |
| On-chain donation records | Core implementation feature | Core roadmap item | Not required as source of truth; only optional anchor or verification record | REMOVE / REPLACE | Replace with PostgreSQL primary records and optional anchor hashes |
| On-chain disbursement records | Planned program + backend integration | Core phase 3 feature | Not required in critical path; should be optional or deferred | REMOVE / DEFER | The disbursement lifecycle is fully enforceable in DB; blockchain does not meaningfully improve it |
| On-chain attestations | Present as future extension | Present in later phases | Optional, only if publicly verifiable attestations are required | DEFER | Do not build this before core audit log and anchor flow are in place |
| Blockchain event listeners | Retry processor and webhook-driven hooks | Not explicit but implied by blockchain integration | Not required if blockchain is optional | REMOVE | Event listeners are only needed if blockchain is a real operational dependency; they are not needed for DB-first design |
| Web3 / RPC infrastructure | Required for donation workflow | Required for all phases | Required only for periodic anchoring | MODIFY | Keep RPC infrastructure but narrow its scope to anchor publishing and verification |
| Transaction signing | Backend signs all program interactions | Backend signs all interactions and planned future wallet flows | Only signing for anchor publication | MODIFY | Sign only when submitting anchor payloads or attestation proofs; no signing for routine business steps |
| Gas / fee handling | Treated as expected operational overhead | Included as cost consideration | Should be minimized or eliminated for core operations | REMOVE / DEFER | Fees are irrelevant for DB-first operations and should not drive critical application logic |
| Blockchain synchronization | Reconciliation and status parity jobs | Explicitly required | Not needed in core operations; only for verifying anchor state | REMOVE | Synchronization should be an auxiliary monitoring and verification task, not a business prerequisite |
| Blockchain verification | Public donation API and explorer links | Strong emphasis on verification and consistency | Public verification should rely on anchor metadata and not block core flows | KEEP / MODIFY | Verification remains useful but as a separate read-only layer, not a control point |
| PostgreSQL audit records | Largely not treated as canonical or primary | Not emphasized in earlier design | Core requirement and canonical source of truth | KEEP | This is the central architecture required by the audit |
| Hash chaining | Mentioned in backend and architecture patterns | Present in some DB fields but not as main design | Core requirement | KEEP | This is the right integrity mechanism for the application |
| Merkle roots / proofs | Mentioned in roadmap and schema | Part of cohort proof architecture | Useful only if later justified; not required in baseline | DEFER | Not necessary for MVP or canonical design unless a specific transparency requirement emerges |
| Periodic blockchain anchoring | Not central in old docs | Not central in old docs | Core recommended pattern | KEEP / MODIFY | This is the correct remaining blockchain use case |
| Public verification | Planned via explorer links and public API | Strong emphasis | Should be based on PostgreSQL audit chain + anchor verification | KEEP / MODIFY | The audit support is the public trust mechanism, but it must be decoupled from business operations |
| Backend APIs | Donation and admin flows call blockchain | Many API endpoints tied to blockchain | APIs should stay DB-first and blockchain-optional | MODIFY | All backend APIs should work without blockchain and not fail if blockchain is unavailable |
| Frontend dependencies | Explorer links and wallet assumptions | More extensive wallet/beneficiary assumptions | Frontend should remain blockchain-optional | MODIFY | Remove or reduce blockchain dependence from user-facing flows and display only optional verification references |
| Background workers / jobs | Retry queue and reconciliation script | Explicitly planned | Only for asynchronous anchoring reliability | MODIFY | Keep retry queue, but only for anchor jobs, not business-critical status updates |
| Failure / retry handling | Complex and central | Very central in plan | Should be simple and non-blocking | MODIFY | Failure handling should not block application logic; it should track anchor publication only |
| Database schema changes | Already includes blockchain fields | Already includes many blockchain-related fields | Additional schema should focus on audit chain and anchor metadata | MODIFY | Add audit log, hash chain, anchor metadata; avoid making blockchain part of core record semantics |
| CI/CD / deployment requirements | Devnet deployment, RPC config, wallet secrets | Mainnet readiness planning | Not required for core app; only for optional public verification service | DEFER | Remove from canonical MVP path and move to later operational stage if a blockchain anchor service is pursued |
| Environment variables / secrets | Many blockchain-related secrets | Extensive config requirements | Keep only minimal anchor service secrets | MODI FY / REDUCE | Reduce to the secrets required for the optional public-verification layer |
| Deployment requirements | Solana CLI, Anchor deploy, RPC, wallet | Mainnet readiness | Optional and delayed | DEFER | Not a primary application requirement |

## 5. Critical Path Analysis

The current plan and roadmap violate the recommended architecture in several ways because they place blockchain before the business logic and rely on it for fundamental application correctness.

### Critical-path violations in the current plan

1. Donation webhooks trigger blockchain recording immediately after payment verification.
   - This makes the donation business path dependent on Solana RPC availability and backend wallet operations.
   - Under the audit, donations should succeed based on PostgreSQL and payment status, with blockchain writing as a separate non-critical action.

2. Status synchronization is treated as a required business function.
   - `update_donation_status` and subsequent flows are framed as required application state transitions.
   - The audit says the database remains authoritative and blockchain should not enforce status transitions.

3. Disbursement lifecycle logic is organized around on-chain recording.
   - The roadmap and plan assume blockchain-enforced lifecycle records for disbursements and allocation results.
   - The audit says disbursement tracking belongs in PostgreSQL and can use a hash-chain registry; blockchain does not need to be in the path.

4. NGO and cohort registration are treated as core blockchain workflows.
   - These are described as required application events.
   - Under the recommended architecture, they can be logged in the database and optionally anchored if desired, but not treated as application-critical chain dependencies.

5. Public APIs are designed to expose blockchain transaction hashes as core evidence.
   - This couples user-facing transparency to blockchain availability and transaction confirmation.
   - The audit prefers a DB-backed audit trail and optional public verification of periodic anchors.

6. Retry, reconciliation, and synchronization jobs are treated as part of the main operational flow.
   - These are valid for an optional public anchor layer, but they become operationally excessive when blockchain is assumed necessary.

7. The architecture assumes blockchain state is needed before a donation or disbursement is considered complete.
   - The audit rejects that assumption. It says blockchain is a secondary verification layer.

### Justification check under the newer architecture

The desired architecture allows:
- Donations to function without blockchain availability
- NGO/disbursement workflows to function without blockchain availability
- Core database operations to function without blockchain availability
- Audit history to remain available through PostgreSQL
- Blockchain anchoring to be asynchronous/non-critical
- Public verification to depend on blockchain only when an anchor needs to be verified

The current plan violates these properties because it treats blockchain as part of the transaction path and as a source of business trust.

## 6. Plan vs Roadmap Consistency

### Internal consistency of the older docs

The two older documents are broadly consistent in one major respect: both assume blockchain is a primary enabler and that the project should continue toward a smart-contract-based architecture. However, they are not fully consistent with each other, and they are not consistent with the necessity audit.

#### Areas of consistency

- Both plan and roadmap prioritize on-chain records for donation lifecycle and status updates.
- Both treat blockchain as integral to transparency and auditability.
- Both define a unified program and multiple on-chain record types.
- Both assume future expansion into NGO/cohort/disbursement and later beneficiary features.

#### Areas of mismatch or inconsistency

- The roadmap dates the architecture as 2026-08-15 and includes earlier design confusion about Memo Program vs custom Anchor program; the implementation plan is more concrete and later in time but still assumes the same central blockchain architecture.
- The roadmap includes “single unified program” as a decision but also references multiple earlier architecture assumptions, including three-program options and a Memo Program approach. That shows unresolved architectural drift.
- The plan strongly emphasizes a blockchain retry/reconciliation architecture, while the roadmap earlier says the end-state should include several more advanced blockchain patterns and may even assume custom governance and token systems.
- The roadmap’s Phase 4 includes ZK/proof and ImpactToken concepts that are not justified by the necessity audit and would be pure optional extensions, not baseline requirements.
- The plan and roadmap both overstate the need for blockchain in core flows and do not distinguish between core app logic and optional anchor/public verification.

### Summary of consistency verdict

The plan and roadmap are internally aligned on the wrong architectural premise: blockchain is essential. They are not compatible with the newer necessity audit. The plan does not merely need a small update; it needs a conceptual reset.

## 7. Canonical Trace-It Blockchain Architecture

The canonical architecture should separate the Trace-It system into distinct layers.

### Core system

The core system is PostgreSQL-backed and remains the source of truth for all operational data. It should include:

- donation records
- disbursement records
- NGO and campaign state
- user role and permission state
- payment status from Razorpay
- audit event records
- integrity metadata and hash-chain entries
- user-facing application APIs
- donor and NGO workflow logic

This is the layer that must remain available, consistent, and recoverable without blockchain. Business processes, user experience, and operational decisions should all depend on PostgreSQL and service logic, not blockchain.

### Audit / integrity layer

This layer sits within the core system and is the primary transparency mechanism. It should include:

- append-only audit events
- previous-hash linkage
- record hash generation
- signed database entries or backend signing of aggregate records
- tamper detection and verification routines
- database-level retention of event history

This is the actual system that provides the day-to-day transparency and integrity capability. It is lower complexity than a blockchain-first design and more aligned with the audit’s recommendation.

### Blockchain anchoring layer

This is the optional verification extension. It does not drive business logic. It should include:

- periodic aggregation of the hash chain or audit-root data
- one or more anchor transactions submitted to blockchain
- transaction hash storage in the database
- metadata linking anchor batch ID to database entries
- asynchronous retry and monitoring for anchor publication

This layer exists only to make the database audit trail publicly verifiable and tamper-evident from outside the system.

### Public verification layer

This layer is read-only and dependent on blockchain only when an anchor needs to be verified. It should include:

- a public verification API or tool
- a way to retrieve anchor data from blockchain
- comparison against PostgreSQL audit-root data
- a method to validate historical integrity and detect tampering

It is not the source of truth and does not gate the application.

### Boundary between layers

The correct boundary is simple:

- The PostgreSQL system performs the business function.
- The hash-chain audit log records the history.
- The blockchain layer only anchors a root or summary when the application chooses to do so.
- Public verification reads blockchain only as a reference to check the database’s integrity history.

## 8. Revised Implementation Strategy

The implementation strategy should be rebuilt around the audit’s recommendation and the project’s real operational needs.

### What should actually be implemented first

1. PostgreSQL audit log with append-only entries
   - Each significant application action produces a record with a previous-hash linkage and current hash.
   - These records remain the operational ledger for Trace-It.

2. Hash-chain protection and tamper detection
   - A signed or backend-key-protected chain provides integrity and supports later external checking.

3. Business logic in the database and backend
   - Donation status, NGO state, disbursement state, and approval decisions remain off-chain and authoritative.

4. Optional anchor scheduler
   - The system periodically publishes a root hash or selected digest to blockchain.
   - Anchoring is asynchronous and non-blocking.

5. Verification tooling
   - Operators and auditors can compare PostgreSQL audit history to blockchain anchor evidence.

### What should not be implemented in the canonical path

- on-chain donation workflow as a business dependency
- on-chain status transitions as the source of truth
- smart-contract ownership of donation/disbursement state
- wallet-driven workflow for routine donations
- blockchain-enforced NGO/cohort/disbursement lifecycle
- ZK or token programs unless there is a separate requirement emerging later

## 9. Revised Roadmap

### Reconciliation of the existing roadmap steps

| Existing roadmap step | Current purpose | Audit compatibility | Required action | Reason | Replacement step if applicable |
|---|---|---|---|---|---|
| Phase 1: environment setup and core program | Build Solana/Anchor environment and program skeleton | Low | Remove or reduce to optional anchor-layer prep | Not necessary for MVP core functionality | Define optional anchor environment only if anchoring is pursued |
| Phase 2: webhook integration and reliability | Record donation on-chain immediately after payment confirmation | Low | Remove from critical path; move to optional anchor job | Donation should not depend on blockchain | Add asynchronous donation audit hash publication job |
| Phase 3: NGO registry, cohort hashing, disbursement program | Put NGO/cohort/disbursement logic on chain | Low | Remove or defer | Business logic belongs in PostgreSQL | Add DB audit records and optional anchor metadata |
| Phase 4: ZK verification, ImpactTokens, beneficiary flow | Add advanced on-chain beneficiary design | Very low | Defer heavily or remove from canonical roadmap | Not justified by the necessity audit | Create a later optional research track only |
| Phase 5: hardening, devnet testing, mainnet readiness | Prepare blockchain for production | Low | Defer and narrow to optional anchoring service | This is not a primary system requirement | Productize the anchor service only if public verification is required |

### Proposed revised roadmap

#### Phase 0: Architecture boundary and requirements
- Confirm that PostgreSQL is source of truth for all operational records.
- Confirm that blockchain is optional for public verification and audit anchoring only.
- Define the hash-chain and anchor requirements.

#### Phase 1: PostgreSQL integrity layer
- Build append-only audit records for donations, disbursements, NGO decisions, campaign updates, and key operational events.
- Add hash chaining, previous-record linkage, and tamper detection.
- Ensure all core APIs remain functional without blockchain.

#### Phase 2: Operational resilience and consistency
- Add idempotent event creation patterns.
- Add retry and monitoring for anchor publication jobs, not for core business actions.
- Add reconciliation logic to reconcile DB state with anchor metadata and public verification state.

#### Phase 3: Optional blockchain anchor service
- Create an anchor service that aggregates recent audit records and submits roots or digests to blockchain.
- Store transaction hashes and block numbers in PostgreSQL.
- Keep service non-blocking to core workflows.

#### Phase 4: Public verification tooling
- Build verification scripts or read-only endpoints to check blockchain anchors against the database ledger.
- Provide public proof to auditors without making blockchain a prerequisite for operations.

#### Phase 5: Optional advanced extensions only if justified later
- If the product requires a public transparency feature beyond audit anchoring, consider a narrow extension.
- ZK, tokenization, and beneficiary wallet features remain separate research tracks and should not be part of the canonical MVP.

## 10. Documentation Changes Required

### blockchain_implementation_plan.md

Sections that remain valid:
- The description of the current blockchain prototype environment is a useful historical artifact.
- The general notion of integrity and tamper evidence is still relevant.
- The need for a retry/reconciliation mechanism remains valid, but it should be narrowed to anchor publication.

Sections requiring modification:
- All sections that frame blockchain as a core application dependency should be rewritten as optional architecture.
- The “Phase 1/2/3/4/5” sequence should be replaced with a PostgreSQL-first and anchor-second sequence.
- The requirement to record donation/disbursement status on-chain must be reworded as optional or deferred.
- The environment variable section should be reduced to only the anchor-service dependencies.

Sections that should be removed:
- Smart-contract-first workflow as the canonical implementation path
- On-chain donation/disbursement source-of-truth assumptions
- Full status lifecycle enforcement by blockchain as a required item
- Critical-path webhook integration assumptions
- Mainnet readiness for all blockchain features in the MVP path

Sections to add:
- “canonical architectural assumption: PostgreSQL is source of truth”
- “optional public anchor layer” section
- “business continuity without blockchain” section
- “hash-chain audit model” section

Terminology to change:
- Replace “blockchain is required” with “blockchain is optional/public verification layer.”
- Replace “record donation on-chain” with “publish donation-integrity anchor when available.”
- Replace “status lifecycle enforcement” with “database status lifecycle management.”

### blockchain_implementation_roadmap.md

Sections that remain valid:
- The need to reason about cross-team dependencies and data fields remains useful.
- The database schema observations about `solanaTxHash` and hash fields remain relevant as optional metadata.
- The earlier technical concerns about cost, consistency, and key management are still useful if recast as anchor-service concerns.

Sections requiring modification:
- The central roadmap narrative must be rewritten so blockchain is not a prerequisite for the app.
- Phase 2 onward must be re-scoped away from operational on-chain action and toward audit-chain plus anchor metadata.
- The custom program assumptions and ZK/ImpactToken stages should be clearly labeled as optional future work, not the product core.

Sections that should be removed:
- “Single unified Anchor program” as the main product architecture
- “Phase 3: NGO registry, cohort hashing, disbursement program” as an MVP requirement
- “Phase 4: ZK Verification, ImpactTokens & Beneficiary Flow” as a current roadmap priority
- “Mainnet readiness” as an immediate requirement for core app deployment

Sections to add:
- “Audit log first, blockchain anchoring second” design principle
- “Operational independence from blockchain” principle
- “Verification-only blockchain usage” decision note
- “Defer advanced blockchain features until justified by explicit product need” policy

Terminology to change:
- “Solana on-chain audit ledger” should become “optional public verification anchor service.”
- “custom on-chain programs” should become “optional public-anchor implementation, if needed.”
- “status lifecycle enforcement” should become “database-owned workflow logic.”

## 11. Architectural Risks and Open Questions

These are the unresolved issues that cannot be fixed by editing the old docs alone:

- Is Trace-It truly required to expose public verification at all, or is the audit trail for internal operators sufficient?
- Should the project maintain a simple periodic day/week anchor schedule, or only anchor when volumes cross a threshold?
- Who owns the anchor-signing key and what is the rotation process?
- How should anchor data be structured so that a verifier can prove the database log matches the blockchain anchor without exposing sensitive data?
- What is the business justification for blockchain if the app does not need public proof for legal, donation, or donor-trust reasons?
- What should happen if anchoring fails repeatedly for several days—should the system keep a backlog, suppress alerts, or continue with a degraded verification state?
- Are there comparable requirements for GDPR, audit retention, or data retention that would change the database-first recommendation?
- What is the intended public verification consumer: donors, NGOs, regulators, or external auditors?

These are not contradictions in the current documents; they are open product and governance questions that should be resolved before a final anchor service design is approved.

## 12. Final Reconciliation

1. What from the existing blockchain implementation plan should survive?
   - The integrity and hash-based verification concepts remain useful.
   - The idea of a retry mechanism and verification tooling is still valuable, but only for the optional anchoring service.
   - The database-level audit and tamper-evidence work should remain as a canonical implementation area.

2. What should be removed?
   - Any requirement that blockchain be in the critical path for donations, disbursements, NGO workflows, or status transitions.
   - Smart-contract-driven lifecycle enforcement as a core application requirement.
   - On-chain record creation for everyday business activities.
   - ZK/beneficiary/token features unless there is a separate explicit business case.

3. What should be redesigned?
   - The blockchain layer should be redesigned as an asynchronous anchor service instead of a business execution layer.
   - The application architecture should be PostgreSQL-first with the audit chain as the canonical integrity mechanism.
   - Public verification should be built as a read-only verification layer tied to periodic anchor publication.

4. What should be deferred?
   - Smart-contract-heavy operational workflows
   - Mainnet governance and complex upgrade authority design
   - Advanced ZK and tokenization work
   - Any beneficiary wallet or redemption functionality not explicitly justified by product requirements

5. What should become the canonical blockchain architecture for Trace-It?
   - A minimal but explicit optional blockchain anchoring layer that periodically anchors an audit root or hash bundle to a public chain.
   - The core application remains PostgreSQL-based and business-operational.
   - The blockchain component exists to provide tamper-evident public proof, not to drive critical application behavior.

The existing implementation plan and roadmap should not be retained as-is. They should be substantially revised and, in spirit, replaced by a PostgreSQL-first audit-and-anchor architecture. The blockchain footprint should shrink from a core business platform to an optional public-verification extension.
