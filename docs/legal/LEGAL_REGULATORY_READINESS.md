# JinaCampus Legal and Regulatory Readiness

Status: **PRE-LAUNCH CONTROL DOCUMENT — NOT LEGAL APPROVAL**  
Owner: JinaCampus / Parshwa Insights  
Prepared: 25 August 2026  
Review cadence: quarterly and before each material product, vendor, pricing, or data-use change.

## 1. Purpose and launch gate

This register converts JinaCampus legal, privacy, security, contractual, and consumer obligations into implementation gates. It is an engineering/compliance working document, not a substitute for advice from qualified Indian counsel, a chartered accountant/tax adviser, or a security auditor.

**Public launch is blocked until every P0 item below is either CLOSED with evidence or formally accepted by the authorised signatory after counsel review.** No engineer may mark a legal interpretation, liability allocation, tax position, or contractual commitment CLOSED merely because code exists.

## 2. Product/data position observed in the repository

JinaCampus is a multi-tenant school-management SaaS. The current repository processes or is designed to process school staff and student data including identity/contact information, academic records, attendance, guardian relationships, staff records, documents, authentication/session telemetry and communications. The schema already uses tenant scoping, RBAC, audit logs, UUIDs, session metadata, private document buckets, and masked-only Aadhaar/bank references for the approved student-record workflow.

The current public authentication surface did not contain dedicated privacy, terms, cookie, or acceptable-use links at the time of this audit. The repository also did not contain a complete legal policy pack. These are launch gaps.

## 3. Regulatory baseline to validate with counsel

| Area | Working position for launch | Engineering / operational consequence | Owner | Status |
|---|---|---|---|---|
| Digital Personal Data Protection Act, 2023 + DPDP Rules, 2025 | The Act/Rules are being brought into force in phases. Build to the full target state before the applicable provisions become enforceable rather than waiting for the final date. | Notices, lawful processing map, rights workflow, processor contracts, security safeguards, breach process, child-data controls, contact/grievance route, retention/erasure. | Legal + Privacy + Engineering | P0 OPEN |
| Child data | JinaCampus must not assume that the Rules' limited educational-institution exemptions automatically extend to a SaaS vendor. Institution/JinaCampus fiduciary/processor roles and any exemption must be determined per processing purpose. | Guardian/parent authority model; age/role-aware flows; no behavioural tracking/targeted advertising to children; minimisation; school-controlled purposes. | Legal + Product | P0 OPEN |
| IT Act / SPDI transition | Until superseded for the relevant processing, maintain privacy, consent/security practices appropriate to sensitive information and do not weaken existing safeguards. | Keep sensitive fields minimised; no plaintext Aadhaar/bank credentials; access control and security programme. | Legal + Security | P0 OPEN |
| CERT-In directions | Maintain a reportable cyber-incident process, India-time synchronisation, required log retention, and ability to provide information to CERT-In within applicable timelines. | Incident runbook, 24x7 escalation path, log inventory, evidence preservation, vendor escalation clauses. | Security | P0 OPEN |
| Consumer Protection Act / E-Commerce Rules | Applicability depends on contracting/sales model; public online subscription sales can create e-commerce/consumer disclosure and grievance duties. | Clear pricing, renewal/cancellation/refund terms, legal identity/contact details, grievance route, no dark patterns or misleading claims. | Legal + Commercial | P0 OPEN |
| GST / invoicing | Tax treatment, registration, place-of-supply, invoice/e-invoice obligations depend on entity and customer facts. | Billing system must use approved GST/tax configuration and immutable invoice/credit-note records. | Finance + CA | P0 OPEN |
| Payments | JinaCampus should use an authorised payment provider and avoid storing card credentials. FeeDesk collection design must be reviewed before activation. | Token/provider references only; webhook verification; reconciliation; refunds; receipts; segregation of school funds from SaaS subscription billing. | Finance + Engineering | P0 OPEN |
| Contracts / electronic acceptance | SaaS order forms, DPA, terms, policies and acceptance evidence must be versioned and attributable. | Store document version/effective date/acceptance actor/time/context for contractual acceptance. | Legal + Engineering | P0 OPEN |
| Intellectual property / OSS | Product, brand, customer content and third-party components need documented ownership/licensing. | OSS inventory/SBOM, attribution where required, contributor/contractor IP assignment, customer-content licence boundaries. | Legal + Engineering | P1 OPEN |
| Accessibility | Treat accessible school workflows as a product requirement and validate any statutory/customer-specific obligations. | WCAG-oriented QA, keyboard/screen-reader support, accessible notices/consent. | Product + QA | P1 OPEN |

## 4. Required legal document pack

The following documents must be prepared as version-controlled templates and reviewed by qualified Indian counsel before publication or signature:

1. **Public Privacy Notice** — controller/fiduciary identity, categories/purposes, lawful grounds/consent where applicable, recipients/processors, retention, security, rights, grievance/contact, child data, international processing, policy changes.
2. **Terms of Service / SaaS Terms** — service scope, authorised users, acceptable use, fees/taxes, suspension, termination, IP, confidentiality, warranties, availability, backups, liability, indemnities, governing law/disputes, notices, order-of-precedence.
3. **Institution SaaS Agreement / Order Form** — legal entity, plan, term, branches, pricing, implementation, support/SLA, payment, renewal/cancellation, authorised signatory.
4. **Data Processing Agreement (DPA)** — institution/JinaCampus roles per purpose, documented instructions, confidentiality, subprocessors, security, incident cooperation, rights requests, deletion/return, audit/assurance, cross-border processing, liability alignment.
5. **Acceptable Use Policy** — credential sharing, unlawful content/use, security abuse, unauthorised surveillance, scraping, harassment, misuse of student/staff information.
6. **Cookie / Tracking Notice** — actual inventory only. Essential authentication/security storage must be distinguished from optional analytics/marketing. Do not deploy non-essential tracking until a consent design is approved where required.
7. **Subscription, Cancellation and Refund Policy** — B2B subscription rules, trials, renewals, taxes, cancellation timing, refunds/credits and exceptional service-failure handling.
8. **Security Overview / Trust Statement** — factual controls only; no unverified certifications or absolute security claims.
9. **Subprocessor List** — provider, purpose, data categories, processing location, contractual status and change-notice process.
10. **Child / Student Data Notice** — plain-language, audience-specific explanation for institutions, guardians and students; distinguish school-required processing from optional features.
11. **Grievance and Data Rights Procedure** — intake, identity/authority verification, tenant routing, deadlines, escalation, evidence and closure.
12. **Incident and Personal Data Breach Response Plan** — security triage, legal assessment, CERT-In and DPDP notifications when applicable, customer/affected-person communications, preservation and post-incident review.
13. **Retention and Deletion Standard** — category-by-category schedule with legal/contractual basis; deletion must include production, derived copies and processor instructions subject to backup/legal-hold rules.
14. **Business Continuity / Backup and Recovery Statement** — RPO/RTO approved by management; restore testing; customer responsibilities; no unsupported uptime promise.

### Publication rule

Draft documents must not be presented as final legal terms. Before production publication, replace all placeholders for legal entity name, registered/principal office, support/grievance/privacy contacts, GSTIN/CIN or other applicable registration details, governing law/forum, pricing/refund commitments, SLA, subprocessors and effective dates.

## 5. Data-governance controls required in product

### 5.1 Processing inventory / ROPA

Maintain a machine-readable or controlled register for each processing activity:

- tenant/institution and data-subject category;
- data fields/categories;
- purpose and responsible decision-maker;
- processing role (institution, JinaCampus, joint/independent where counsel determines);
- lawful basis / consent requirement;
- source and recipients;
- subprocessors and location;
- retention trigger and period;
- security classification;
- child-data flag;
- export/correction/erasure capability;
- audit/event evidence.

### 5.2 Rights request workflow

Create a tenant-safe privacy-request service rather than deleting records directly from support tickets. Minimum workflow:

`RECEIVED -> IDENTITY_OR_AUTHORITY_VERIFICATION -> TENANT_REVIEW -> LEGAL_HOLD_CHECK -> IN_PROGRESS -> FULFILLED / PARTIALLY_FULFILLED / REJECTED_WITH_REASON -> CLOSED`

Requests must support access, correction/completion/update, erasure where applicable, grievance, consent withdrawal where processing relies on consent, and nomination when the relevant DPDP provision applies. Guardian requests must prove the guardian/student relationship; staff cannot access another tenant's requests.

### 5.3 Consent / authority evidence

Do not use one global checkbox as the legal basis for all school processing. Store evidence only when consent/authority is actually required. Evidence should include purpose, notice version, subject, parent/guardian where applicable, method, timestamp, withdrawal/revocation, and tenant context. Mandatory school administration processing and optional communications/tracking must remain separable.

### 5.4 Retention and deletion

No universal retention number is approved by this document. Legal/finance/education/employment requirements vary by record type and contract. Create a schedule for at least:

- user/account and authentication records;
- students, guardians and enrollments;
- attendance and academic records;
- uploaded identity/admission documents;
- staff/leave records;
- communication content and delivery logs;
- audit/security logs;
- contracts and acceptance evidence;
- invoices, receipts, payments, refunds and tax records;
- backups.

Implement legal holds and tenant offboarding as explicit workflows. Destructive production deletion requires authorised approval and tested backup/restore evidence.

## 6. Security and breach readiness

### P0 security controls

- Maintain strict `tenantId` scoping and server-side permission checks.
- Encrypt data in transit and at rest using infrastructure-supported controls.
- Keep service-role keys, peppers, session secrets, provider credentials and database credentials outside source control.
- Require strong authentication for privileged/platform operators; prefer phishing-resistant MFA/passkeys.
- Maintain least privilege for database, storage, support and production administration.
- Add production security headers after compatibility testing: HSTS, CSP, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, frame-ancestor protection and a least-privilege `Permissions-Policy`.
- Centralise security/audit logging and preserve required logs in India where legally required; document time synchronisation.
- Maintain dependency/vulnerability scanning, patch SLAs, secrets scanning and backup restore tests.
- Commission an independent application/infrastructure security assessment before launch; if a CERT-In empanelled audit is contractually/regulatorily required, scope it explicitly.

### Incident severity / notification clock

The incident runbook must record `detectedAt`, `awarenessAt`, systems/tenants/data affected, containment, evidence, decision owners and notification timestamps. CERT-In-reportable incidents must be escalated immediately so the statutory reporting window can be met. When the applicable DPDP breach rules are in force, affected Data Principals and the Data Protection Board workflow must also be supported, including the detailed Board update within the prescribed period.

Never promise a customer that every incident is reportable or that every event has the same notification deadline; legal/security must classify the event.

## 7. Child and student safeguards

JinaCampus must apply a high-protection default because schools necessarily handle children's data:

- institution-authorised access only; guardian/student portals limited to linked records;
- no sale of student personal data;
- no targeted advertising to children;
- no unnecessary behavioural profiling/tracking;
- no public student directory by default;
- minimise DOB, health, identity and financial information;
- never store full Aadhaar or bank/card data merely for convenience;
- school-configurable visibility for sensitive fields;
- guardian authority verification for privacy requests and optional consent where required;
- age-appropriate/plain-language notices when students interact directly with JinaCampus;
- prevent staff exports from bypassing RBAC/audit controls;
- subprocessor contracts must prohibit independent use of school/student data.

## 8. Institution responsibility split to put in contracts

Subject to counsel approval, institution agreements should make the school responsible for the lawfulness/accuracy of data and instructions it uploads, user/guardian authority, local notices/consents it is responsible for, role assignment, retention instructions, and lawful communications. JinaCampus remains responsible for its own processing, platform security obligations, processor/subprocessor management, access controls, incident cooperation, and following documented lawful instructions. Contract language must not attempt to waive non-waivable statutory duties.

## 9. Launch-critical checklist

| ID | Requirement | Evidence required | Owner | Gate |
|---|---|---|---|---|
| LEG-001 | Confirm operating legal entity and registrations | incorporation/registration records, registered address, GST/tax advice | Founder/Finance/Legal | P0 |
| LEG-002 | Counsel-approved SaaS Terms + institution agreement/order form | signed legal approval + version | Legal | P0 |
| PRIV-001 | Counsel-approved Privacy Notice + child/student notice | approved version + effective date | Legal/Privacy | P0 |
| PRIV-002 | DPA and subprocessor schedule | approved template + executed vendor DPAs | Legal/Security | P0 |
| PRIV-003 | Processing inventory and data-flow map | ROPA/data map | Privacy/Engineering | P0 |
| PRIV-004 | Data-rights/grievance workflow and contact | tested runbook + ticket evidence | Privacy/Support | P0 |
| PRIV-005 | Retention/deletion schedule | approved schedule + implementation tickets | Legal/Privacy/Engineering | P0 |
| PRIV-006 | Child-data role/exemption analysis | written counsel opinion per processing purpose | Legal | P0 |
| SEC-001 | CERT-In incident process and contacts | tabletop evidence + log-retention proof | Security | P0 |
| SEC-002 | Independent security assessment | final report + P0/P1 remediation evidence | Security | P0 |
| SEC-003 | Production secrets/access/backup review | checklist + restore test | Engineering/Security | P0 |
| WEB-001 | Legal links on all login/public/checkout surfaces | QA screenshots/tests | Product | P0 |
| WEB-002 | Cookie/tracker inventory; optional consent if needed | scanner/inventory + CMP decision | Privacy/Product | P0 |
| COM-001 | Pricing, cancellation/refund, grievance disclosures | approved public copy + QA | Commercial/Legal | P0 if online sale enabled |
| FIN-001 | GST/invoicing position approved | CA memo/configuration | Finance | P0 before paid launch |
| PAY-001 | Payment provider and PCI scope reviewed | provider agreement + architecture | Finance/Security | P0 before payments |
| IP-001 | IP ownership and OSS review | assignments/contracts + dependency licence report | Legal/Engineering | P1 |
| OPS-001 | SLA/support/BCP commitments approved and tested | SLA + backup/DR evidence | Operations | P0 |
| GOV-001 | Evidence register and quarterly review owner assigned | signed governance record | Management | P0 |

## 10. Evidence register template

Every control should have an evidence entry:

| Requirement ID | Control / requirement | Evidence URI / file | Responsible owner | Approval status | Document/control version | Effective date | Last tested/reviewed | Next review | Notes / exception |
|---|---|---|---|---|---|---|---|---|---|
| Example: SEC-001 | CERT-In incident escalation | `docs/legal/INCIDENT_RESPONSE.md` + tabletop record | Security Lead | Pending | 0.1 | TBD | TBD | Quarterly | Counsel/security validation required |

Evidence containing personal data, security findings, secrets, contracts, or privileged legal advice must not be committed to the public repository. Store only a controlled reference/URI and approval metadata.

## 11. Change-control rules

Routine non-destructive improvements may proceed without executive legal approval when they only strengthen privacy/security (for example, adding missing headers after compatibility testing, adding legal navigation, reducing collection, adding audit events, or improving request logging).

The following always require an authorised decision before production effect:

- final legal interpretation or claim of statutory compliance;
- accepting/altering liability, indemnity, warranty, SLA, refund or governing-law terms;
- selecting a child-data exemption or relying on consent as legal basis;
- introducing advertising, analytics, biometrics, location tracking or new sensitive-data use;
- changing retention in a way that deletes production records;
- enabling paid billing/payment flows or changing tax treatment;
- transferring data to a new country/subprocessor where legal review is required;
- signing customer/vendor contracts.

## 12. Authoritative source register

Legal should preserve current copies/links in the internal evidence system. Minimum source set:

- Digital Personal Data Protection Act, 2023 — India Code.
- Digital Personal Data Protection Rules, 2025, corrigendum and enforcement notifications — MeitY / Gazette / India Code.
- Information Technology Act, applicable rules and transition provisions — India Code / MeitY.
- CERT-In Directions dated 28 April 2022 and current FAQs/guidelines — CERT-In.
- Consumer Protection Act, 2019 and Consumer Protection (E-Commerce) Rules, 2020 as amended — India Code / Department of Consumer Affairs.
- CGST/IGST Acts, invoice/e-invoice rules and current notifications applicable to the legal entity — CBIC/GST authorities.