# Trace-It Terms of Use

Effective Date: [Insert Effective Date]

This Terms of Use (“Terms”) governs the access and use of the Trace-It platform (“Platform”) by administrators, non-governmental organisations (“NGOs”), donors, and other users. These Terms are intended to describe a practical and implementation-based operating framework for the Platform as currently designed and reviewed in the project documentation and source code.

This document should be read together with the Privacy Policy and the Data Usage Policy. It is a proposed contractual and operational framework for the Platform and should be reviewed by qualified Indian legal counsel before publication.

## 1. Scope and purpose

Trace-It is a donation and provenance transparency platform designed to support:

- user registration and authentication;
- NGO onboarding and review workflows;
- campaign creation and fundraising;
- donation processing and payment reconciliation;
- receipt generation and donor communication;
- disbursement and evidence management;
- provenance record creation and verification; and
- administrative oversight, audit and security review.

The Platform is not a regulator, bank, government verification service, or a substitute for independent legal advice, external audit, or law-enforcement investigation. The Platform may provide technical and operational infrastructure to support transparency, review and accountability, but it does not itself guarantee that an NGO’s fundraising claims, financial management, government status, or downstream fund utilisation are correct in all respects.

## 2. Relationship between contractual terms and technical controls

These Terms set out the intended responsibilities, expectations and rules for Platform users. The Platform’s technical controls are separate from the contractual obligations described here.

Examples of operational technical safeguards implemented in the reviewed system include:

- JWT-based authentication and role checks;
- bcrypt password hashing and hashed refresh-token storage;
- role-based access controls for administrators, NGOs and donors;
- payment webhook signature verification;
- S3-compatible document storage with encrypted content;
- SHA-512 integrity checks for uploaded documents;
- signed document access URLs;
- audit logging and security middleware; and
- provenance and blockchain integrity verification workflows.

These technical measures support Platform security and evidence integrity, but they do not, on their own, confirm the truth of every user representation, the legality of every fundraising campaign, the final use of funds, or the completeness of a user’s compliance with all applicable laws. In other words, technical enforcement is not a substitute for user accountability or legal compliance.

## 3. User eligibility and account responsibility

Users may access the Platform only in accordance with the Platform’s account and role model. Each account holder is responsible for:

- using the Platform for lawful and authorised purposes;
- keeping their login credentials secure;
- ensuring that account information is accurate and up to date;
- promptly notifying the Platform of suspected unauthorised access or misuse;
- complying with these Terms and all applicable laws and regulations relevant to their role; and
- using the Platform in a manner consistent with the permissions assigned to their role.

The Platform may deny, suspend, restrict or revoke access where it reasonably suspects misuse, material inaccuracy, security risk, operational abuse, or non-compliance with these Terms or applicable law.

## 4. NGO obligations and responsibilities

NGOs are expected to be responsible for the accuracy, integrity and legal compliance of their Platform use. In particular, NGOs must:

### 4.1 Truthful representation and onboarding information

- provide accurate and complete organisation information, including name, profile details, registration information, contact information, and other information requested in onboarding;
- ensure that any registration number, FCRA number, 80G information or other stated credentials are accurate to the best of the NGO’s knowledge and are not knowingly misrepresented;
- provide truthful information about the organisation’s mission, activities, campaigns and operations; and
- not misrepresent the identity, status, authority, governance or legal standing of the organisation.

The Platform may request supporting documents or other evidence during review. The Platform’s review processes are not a guarantee that government registration, tax exemption status, or any NGO status has been independently verified by Trace-It or by a government authority.

### 4.2 Campaign accuracy and fundraising communications

NGOs must ensure that all campaign descriptions, fundraising objectives, disbursement plans, milestones, use-of-funds statements, and related communications are accurate, honest, and not materially misleading. NGOs must not:

- make false or deceptive claims about a campaign or expected outcomes;
- claim that funds have been used, disbursed or delivered when they have not;
- misstate the status, progress, or completion of an activity or project;
- use the Platform to solicit funds for unlawful, unapproved, or deceptive purposes; or
- present the Platform as a guarantee of government approval, legal compliance, or final financial settlement.

### 4.3 Financial management, fund utilisation and legal compliance

NGOs retain responsibility for their own financial governance, operational execution, and lawful management of funds. NGOs must:

- use funds received through the Platform in a manner consistent with the campaign, organisation’s stated purpose and applicable law;
- maintain appropriate records of receipts, expenditure, transfers and financial controls;
- ensure that all fundraising and fund utilisation activities are lawful and compliant with applicable Indian law, applicable foreign law where relevant, and any donor-facing representations made by the NGO;
- comply with legal obligations related to tax, charity registration, fund usage, audit, reporting, and fundraising activity where applicable; and
- ensure that any bank-transfer evidence or supporting documents submitted to the Platform are genuine, correct and sufficiently representative of the actual underlying transaction or activity.

Trace-It does not independently monitor all NGO internal financial activity, all bank settlements, or all downstream uses of funds. Any representation about fund utilisation or financial compliance remains the responsibility of the NGO and relevant government, tax, or regulatory authorities.

### 4.4 Supporting evidence and review submissions

NGOs may be required to furnish or upload supporting evidence relating to:

- registration or legal status documents;
- campaign or project evidence;
- bank-transfer or disbursement records;
- receipts, invoices, payment confirmations or transfer documentation;
- organisational or financial review materials; and
- relevant status or governance records.

NGOs must ensure that evidence submitted to the Platform is accurate, complete and not fabricated or misleading. The Platform may review, classify or manage such evidence internally, but evidence review is not the same as independent verification of the underlying facts.

### 4.5 Reporting, cooperation and dispute response

NGOs must cooperate with Platform review processes, administrative inquiries and dispute-handling procedures where requested. This may include responding to requests for clarification, producing supporting records, or updating organisational or campaign information where material facts change.

## 5. Donor responsibilities and donation-related expectations

Donors are expected to use the Platform responsibly and in accordance with these Terms. Donors must:

- ensure that the donation is made lawfully and in a manner consistent with their own legal obligations;
- understand that donation amounts, payment status and receipt information are tied to the configured payment provider and may be affected by payment success, failure, pending status, or refund conditions;
- not use the Platform to misrepresent donation relationships, manipulate campaign outcomes, or attempt unlawful financial activity;
- not create fraudulent, abusive or deceptive donation patterns;
- provide accurate account information where required; and
- act in good faith when submitting donation messages, tax-related information, or support related data.

Donors should understand that a donation is not equivalent to a guarantee of project success, proof of NGO compliance, or evidence of ultimate fund use. Trace-It is not a guarantor of social, developmental, or financial outcomes following a donation.

## 6. Campaign accuracy and prohibited conduct

### 6.1 Accuracy of campaign content

Campaign content, including title, description, objectives, milestones, funding requests, disbursement notes and supporting material, should be accurate, clear and reasonably complete. Campaigns that rely on inaccurate, incomplete, misleading or stale information may be subject to review or removal.

### 6.2 Prohibited conduct

Users must not use the Platform to:

- create or support fraudulent or deceptive campaigns;
- impersonate a person, organisation, authority, or official body;
- submit false registration data or forged documents;
- mislead donors about fees, payments, settlement timing, project status, or fund utilisation;
- exploit the Platform for money laundering, unlawful transfer, extortion, or evasion of legal obligations;
- access or interfere with another user’s data or account without lawful authority;
- bypass access restrictions or attempt to evade role-based controls;
- upload malicious or harmful content to the Platform;
- use the Platform for spam, automated abuse, scraping, credential stuffing, or other harmful activity; or
- otherwise engage in behaviour that is unlawful, dishonest, abusive, fraudulent, or contrary to the spirit of the Platform.

The Platform may investigate suspicious or prohibited activity and may take appropriate remedial action, including temporary restrictions, campaign review, account suspension, or other actions permitted by the Platform’s operational controls.

## 7. Donation, payment, settlement, disbursement and refund distinctions

A critical distinction applies between donation processing, settlement, disbursement, and ultimate fund use.

### 7.1 Donation processing

A donation is a payment initiated by a donor through the configured payment provider. The Platform may record donation amount, currency, payment identifiers, status, timestamps and related metadata. The Platform’s role in donation processing is operational and reconciliatory rather than financial settlement control.

### 7.2 Payment settlement

Payment settlement is the movement of funds between the donor’s payment provider, the payment processor, and the receiving account or treasury arrangement used for the relevant flow. Settlement timing, fees, delays, reversals or failures may depend on the payment provider, the receiving institution, or the underlying payment rails. Trace-It does not guarantee that any payment will settle, complete, or be finalised on a specific timeline.

### 7.3 Disbursement and bank-transfer evidence

Disbursement is the transfer or allocation of funds from a campaign, programme, or NGO-controlled account to a recipient or designated use, as represented by the NGO. The Platform may provide a workflow for disbursement review and evidence submission, including bank-transfer records, references and supporting documents. These records may help document claimed transfers, but they do not independently prove the underlying legality, settlement or ultimate utilisation of funds.

### 7.4 Refunds and reversals

Refunds may be processed by the configured payment provider, by the Platform under a defined operational workflow, or by a combination of the two, depending on the project configuration and applicable rules. Refund eligibility, timing, approval and execution may depend on payment status, legal conditions, and operational review. The Platform does not guarantee that a refund will be granted, processed or completed in any particular case.

### 7.5 No guarantee of fund use or final outcome

The Platform does not guarantee that: 

- funds will be used for the exact purpose described in a campaign;
- a government authority or external regulator has approved the underlying activity;
- any bank transfer or disbursement has actually settled or been accepted by all relevant parties;
- final fund utilisation will match a campaign description; or
- all NGO operations are lawful or financially prudent.

Any such assurance remains the responsibility of the NGO, the relevant financial institution, and the applicable law and regulatory framework.

## 8. Supporting evidence and verification limitations

The Platform may permit NGOs and administrators to upload supporting documentation and evidence, including:

- registration certificates;
- bank-transfer evidence;
- campaign-related documentation;
- proof of operation or implementation; and
- other records relevant to a review or administrative workflow.

The Platform may also implement technical checks, metadata storage, hash verification and evidence access controls. However, supporting evidence does not automatically establish the truth of the underlying subject matter. Evidence may be incomplete, stale, disputed, or subject to an administrative review. The Platform may verify document integrity and storage consistency, but it does not independently establish legitimacy or final compliance in every external context.

The Platform is not an independent auditor or investigator of all NGO activities. The Platform’s review and evidence workflows are intended to support transparency and operational due diligence within the limits of the implemented system.

## 9. Provenance, blockchain and public records

The Platform may create provenance records to support integrity checks and transparency. In the reviewed implementation, this may include canonical payload generation, hash chaining, previous-hash continuity, batch-level commitments, and anchor records created for verification purposes.

### 9.1 Provenance architecture

The implemented provenance architecture is intended to provide a verifiable record of data integrity and history. It may include:

- canonical payload generation;
- payload hashing;
- hash chaining or continuity checks;
- batch-level commitments; and
- verification logic that compares locally persisted records against anchor or blockchain-linked data.

This infrastructure supports internal integrity review and may help establish that records have not been materially altered within the implemented model.

### 9.2 Solana blockchain records

The Platform may create or reference commitments on the Solana blockchain as part of its provenance or integrity model. Certain records may therefore become public or externally observable. Users should understand that:

- blockchain records are public by design and may be visible to third parties;
- blockchain records are not equivalent to private database records;
- a public blockchain record may not be removed by Trace-It once committed;
- blockchain verification confirms integrity within the implemented verification model, but does not independently prove bank settlement, physical movement of funds, or ultimate NGO fund utilisation; and
- the existence of a public on-chain commitment does not automatically confirm the lawfulness of all underlying real-world actions.

Users should not treat on-chain provenance as a guarantee of final fund utilisation or of the legality of all external financial activity.

## 10. Responsibilities of NGOs, government authorities and Trace-It

### 10.1 NGO responsibilities

NGOs remain responsible for:

- the accuracy of their information and campaign disclosures;
- lawful fundraising activity;
- lawful and appropriate fund utilisation;
- lawful management of all financial records and reporting obligations;
- submission of truthful supporting evidence; and
- compliance with applicable law and operational obligations.

### 10.2 Government and regulatory authorities

Government authorities, regulators, tax authorities, banks, and other public bodies remain responsible for:

- the formal registration, approval, oversight, taxation, reporting and investigation of NGOs and charitable activities;
- the enforcement of applicable laws and rules;
- regulatory review, licensing or compliance proceedings; and
- any enforcement actions concerning suspected unlawful conduct.

Trace-It is not a government authority and does not assume those functions.

### 10.3 Trace-It responsibilities

Trace-It is responsible for managing the Platform’s technical and operational functions, including:

- providing the software environment for user accounts, campaigns, payments, evidence workflows and provenance records;
- maintaining role-based access controls and authentication requirements;
- storing and protecting Platform data as implemented;
- maintaining operational audit logs and monitoring workflows within the Platform’s technical scope;
- enabling receipt, verification and review workflows as configured; and
- supporting the integrity checks and technical controls described in the implementation.

Trace-It does not guarantee that an NGO is lawfully operating, that all financial use is appropriate, or that external law-enforcement or regulatory oversight has been satisfied.

## 11. Suspension, termination and review

The Platform may suspend, restrict, remove, or terminate access or functionality where it reasonably determines that:

- a user has breached these Terms;
- information submitted to the Platform is materially inaccurate, misleading, or unsupported;
- there is a security concern or suspected unauthorised access;
- there is a suspicious or potentially unlawful campaign or payment flow;
- there is evidence of abuse, misconduct, forged documents, or fraudulent activity;
- there is a need to protect the integrity, security, or operational stability of the Platform; or
- required review, investigation, or legal process necessitates a temporary or permanent restriction.

Suspension decisions may be temporary pending review, and the Platform may require additional information or documentation before restoring access. Any formal reinstatement process, appeal procedure, or review workflow should be specified by the project owner before final publication and is currently subject to confirmation.

### 11.1 Termination

The Platform may terminate or disable a user account, NGO profile, campaign, disbursement workflow or related feature where:

- these Terms are materially breached;
- the user no longer satisfies the relevant account requirements;
- the Platform determines that continued access would create legal, security or operational risk; or
- the project owner decides that a formal account closure process should be applied.

Any complete approach to account termination, data removal, or restoration process remains a project-owner decision and should be set out in a separate operational policy or process document.

## 12. Disputes, complaints and unresolved procedures

Disputes may arise between donors, NGOs, administrators, or other users relating to campaign content, payment issues, disbursement representations, evidence review, or account restrictions. The Platform may provide an internal review workflow for administrative disputes and operational questions, but such workflow is subject to project-owner definition.

The following procedural details require confirmation before publication:

- [Insert dispute submission process]
- [Insert complaint escalation channel]
- [Insert response timeline, if any]
- [Insert final escalation path for unresolved disputes]
- [Insert governing law and venue]
- [Insert contact person or team address for notices and complaints]

The Platform does not currently provide a complete, published user-facing redress framework in the reviewed implementation, and any such framework should be specified by the project owner before publication.

## 13. Modifications to these Terms

Trace-It may update these Terms from time to time to reflect operational changes, legal developments, new feature rollouts, technical modifications, or governance requirements. Continued use of the Platform after an update constitutes acceptance of the updated Terms, unless a different process is formally adopted by the project owner.

Users should review these Terms periodically. Where material changes are made, the Platform should provide a clear notice in a manner appropriate to the Platform’s operational workflow and the project owner’s policy design.

## 14. Data and privacy relationship

These Terms are separate from the Platform’s Privacy Policy and Data Usage Policy. The handling of personal and organisational information is governed by the applicable privacy and data-use policies, and a user’s rights or obligations under those documents should be read alongside these Terms. In the event of a conflict, the project owner should clarify the governing hierarchy before final publication.

## 15. Legal review notice

This draft is intended as a practical operating document for a donation and provenance transparency platform operating in India. It is not legal advice and should not be treated as a substitute for a full legal review. The final Terms of Use should be reviewed by qualified Indian legal counsel before publication, including review of:

- user eligibility, role allocation and account governance;
- fundraising and charity-law implications;
- payment and refund arrangements;
- dispute and complaint procedures;
- regulatory and tax-related obligations; and
- any organisation-specific operational requirements.

## 16. Placeholder points requiring project-owner confirmation

The following points remain to be confirmed by the project owner or legal counsel before final publication:

- [Insert final contact or grievance channel for user complaints]
- [Insert formal suspension and appeal process]
- [Insert final account termination workflow and any data-removal process]
- [Insert payment dispute and refund escalation path]
- [Insert any disbursement review decision procedure]
- [Insert final governing law, forum, and jurisdiction]
- [Insert whether any additional NGO-specific contractual undertakings are required]
- [Insert whether a separate user agreement or policy hierarchy is required for administrators, NGOs and donors]

## 17. Conclusion

These Terms are intended to set out clear expectations for the use of Trace-It as a donation, transparency and verification platform. They are designed to reflect the Platform’s implemented technical and operational model while recognising its limits. The Platform can support transparency, record integrity, auditability and operational review, but it cannot independently guarantee the truth of all user representations, the lawfulness of all fundraising or financial activity, or the final utilisation of funds by NGOs or other parties.

The final publication of these Terms should be aligned with the project owner’s actual operational policies, legal review, and final implementation decisions before release.
