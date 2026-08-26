# Data Processing Agreement Template

Status: **Draft for qualified Indian counsel**
Version: `draft-0.1`

This schedule is a drafting handoff, not an executed agreement. Replace bracketed fields only through authorised legal and commercial review.

## 1. Parties and Relationship

- Customer / Institution: `[legal name, registration, address]`
- Service Provider: `[approved JinaCampus operating legal entity, registration, address]`
- Effective date and term: `[approved dates]`
- Governing service agreement / order form: `[reference]`

The agreement must classify each party's role for every processing purpose. The intended default is that the Institution determines school purposes and authorised users, while JinaCampus processes institution data under documented instructions. Any independent JinaCampus purpose, such as platform security, contract administration, legal compliance, or fraud prevention, must be listed separately and reviewed.

## 2. Processing Instructions

JinaCampus may process personal data only to:

1. Provide enabled and subscribed JinaCampus modules.
2. Authenticate users and enforce tenant, institution, branch, academic-year, and role boundaries.
3. Store, retrieve, report, export, back up, secure, support, and recover authorised records.
4. Send communications only when the institution, channel, recipient consent, template, and provider have been separately approved.
5. Meet documented legal obligations and protect the service.

Instructions outside this scope require a written change. JinaCampus must notify the Institution if an instruction appears unlawful unless prohibited by law.

## 3. Data Subjects and Categories

| Data subjects | Typical data categories |
|---|---|
| Students and applicants | Identity, admission, enrollment, class, attendance, academic, document, limited demographic and masked identifier data |
| Parents and guardians | Identity, relationship, authority, contact, communication preference and consent evidence |
| Teachers and staff | Identity, account, role, employment, attendance, leave, assignment, contact and authorised document data |
| Institution administrators | Identity, role, authentication, account, configuration and audit data |
| Website/support users | Contact, request, device, security and support metadata |

Sensitive or high-risk categories must be minimised. Passwords remain hashed; session/reset/QR secrets are not exposed; full Aadhaar and bank account numbers are not stored in student records.

## 4. Security Schedule

The final schedule must record verified controls for:

- tenant and branch isolation;
- permission-based RBAC and institutional entitlements;
- authentication, forced password change, passkeys, session expiry and revocation;
- encryption in transit and approved infrastructure encryption at rest;
- private object storage, signed access, file validation and malware controls where applicable;
- audit, security and administrative logs;
- vulnerability, dependency and patch management;
- backup, restore, disaster recovery, RPO and RTO;
- incident response, evidence preservation and notification;
- personnel confidentiality and least-privilege production access;
- secure development, migration review and release rollback.

Unverified controls must not be described as contractual guarantees.

## 5. Subprocessors

The current approved register must be attached. The final agreement must define:

- prior notice and objection process;
- equivalent privacy/security obligations;
- processing locations and remote support access;
- deletion/return on provider exit;
- incident notification and audit evidence;
- responsibility for subprocessor performance.

Optional email, WhatsApp, SMS, analytics, payment, or malware providers are excluded until separately approved.

## 6. Children and Consent

The Institution is responsible for lawful enrollment, parent/lawful-guardian authority, required notices, and verifiable consent. JinaCampus will provide configured controls and evidence fields but will not infer consent from the presence of a phone number, email address, student record, or uploaded document.

No student data may be used for targeted advertising, behavioural monitoring for advertising, or unrelated commercial profiling.

## 7. Rights Requests and Accuracy

The Institution verifies the requester and controls school-record corrections. JinaCampus will provide reasonable assistance with access, correction, completion, export, restriction, withdrawal, erasure, nomination, and grievance requests. Response times, secure delivery, exceptions, and fees (if legally allowed) require counsel approval.

## 8. Security Incidents

The parties must:

1. Maintain named primary and backup incident contacts.
2. Notify each other without undue delay under the agreed schedule.
3. Preserve evidence and coordinate containment, impact assessment, regulatory notices, affected-person notices, remediation, and post-incident review.
4. Support CERT-In and DPDP reporting deadlines applicable at the event time.

The agreement must not promise a notification deadline the operating process cannot meet.

## 9. Retention, Return, and Deletion

The signed retention schedule must define active retention, archive, backup expiry, legal hold, export format, deletion verification, offboarding assistance, and costs. Expiry or module disablement must not automatically destroy historical school records. Production deletion requires verified authority and an audited, tenant-scoped process.

## 10. Audit and Assurance

Define annual assurance, evidence delivery, questionnaires, penetration-test summaries, material findings, remediation, regulator support, and on-site audit limits. Evidence must protect other tenants, security details, and third-party confidentiality.

## 11. International Processing

List actual database, storage, hosting, logging, backup, support, and provider locations. Counsel must confirm applicable DPDP restrictions and contractual safeguards before any cross-border processing is approved.

## 12. Commercial and Liability Terms

Liability allocation, indemnities, insurance, confidentiality survival, governing law, venue, dispute resolution, precedence, and termination require explicit counsel and authorised-signatory approval. They are intentionally not invented in this template.

## Approval Record

| Role | Name and designation | Decision | Date | Evidence reference |
|---|---|---|---|---|
| Indian legal counsel | Pending | Pending | Pending | Pending |
| Privacy/security approver | Pending | Pending | Pending | Pending |
| Engineering approver | Pending | Pending | Pending | Pending |
| Business signatory | Pending | Pending | Pending | Pending |
| Institution signatory | Pending | Pending | Pending | Pending |
