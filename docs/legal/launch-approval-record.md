# Legal and Compliance Launch Approval Record

Status: **NOT APPROVED**
Release scope: Public JinaCampus launch
Record version: `draft-0.1`

## Required Signatories

Each approval needs full name, official authority/designation, explicit approve/reject decision, date, approved document versions, launch scope, conditions, and a secret-free evidence reference.

| Approval | Signatory | Decision | Date | Evidence reference | Conditions |
|---|---|---|---|---|---|
| Qualified Indian legal counsel | Pending | Pending | Pending | Pending | Validate laws, contracts, liability, child data, state/board and launch model |
| Privacy and data-protection owner | Pending | Pending | Pending | Pending | Contacts, rights, consent, retention, subprocessors and transfers |
| Security owner | Pending | Pending | Pending | Pending | Incident response, CERT-In, logs, testing and recovery |
| Engineering authority | Pending | Pending | Pending | Pending | Implementation, migration, tenant isolation, evidence and rollback |
| Operations authority | Pending | Pending | Pending | Pending | Support, monitoring, backup/restore, incident and offboarding |
| Finance/commercial authority | Pending | Pending | Pending | Pending | Pricing, tax, billing, cancellation, refunds and provider costs |
| Business/product signatory | Pending | Pending | Pending | Pending | Product claims, accepted risk, launch scope and customer communication |

## Document Approval Matrix

| Document/control | Version | Effective date | Counsel | Business signatory | Production evidence |
|---|---|---|---|---|---|
| Privacy Notice | `draft-0.1` | None | Pending | Pending | Pending |
| Terms of Service | `draft-0.1` | None | Pending | Pending | Pending |
| Cookie Notice | `draft-0.1` | None | Pending | Pending | Tracking/cookie verification pending |
| Acceptable Use Policy | `draft-0.1` | None | Pending | Pending | Pending |
| Data Processing Agreement | `draft-0.1` | None | Pending | Pending | Pending |
| Institution Service Agreement | `draft-0.1` | None | Pending | Pending | Pending |
| Retention Schedule | `draft-0.1` | None | Pending | Pending | Deletion/backup evidence pending |
| Rights and Consent Procedure | `draft-0.1` | None | Pending | Pending | Contact and workflow drill pending |
| Incident Response Plan | `draft-0.1` | None | Pending | Pending | Contacts and rehearsal pending |
| Subprocessor Register | `draft-0.1` | None | Pending | Pending | Contracts/regions pending |

## Release Gate Checklist

- [ ] Legal entity name, address, registration and authorised signatory verified.
- [ ] Privacy contact, Grievance Officer, support/security contact and CERT-In PoC operational.
- [ ] Final documents translated or made available in required languages.
- [ ] Institution contract, DPA and order schedules executed for launch institutions.
- [ ] Child/guardian authority and consent evidence workflow approved and tested.
- [ ] Versioned user/institution acceptance evidence implemented or an approved contractual alternative recorded.
- [ ] Rights, grievance, correction, export and deletion procedures drilled.
- [ ] Retention, legal hold, backup ageing and secure deletion verified.
- [ ] Production subprocessor contracts, regions and cross-border assessment approved.
- [ ] Security, vulnerability, incident, logging, CERT-In and breach notification controls verified.
- [ ] Backup, restore, RPO/RTO and application rollback evidence approved.
- [ ] Subscription, taxes, billing, cancellation and refunds approved before paid public sales.
- [ ] Consumer, e-commerce, dark-pattern, accessibility and marketing-claim review complete.
- [ ] State, board, employment and institution-specific requirements confirmed.
- [ ] `npm run legal:readiness` passes in the production build environment.
- [ ] Authenticated production smoke confirms legal links and draft/effective status.

## Approval Boundary

Completing a checklist or setting `LEGAL_DOCUMENT_STATUS=EFFECTIVE` does not itself create legal approval. The environment value may be changed only after all referenced signatories approve the exact versions. Conversely, a legal approval does not authorise production migration, data deletion, provider activation, billing activation, or deployment unless those actions are separately approved under the release process.
