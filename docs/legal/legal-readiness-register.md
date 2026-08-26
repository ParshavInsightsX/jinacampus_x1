# Legal Readiness and Evidence Register

Status: **Launch blocked pending legal and signatory approval**
Register version: `draft-0.1`
Review date: 2026-08-22

Status definitions:

- **Implemented**: engineering or documentation control exists and has focused verification.
- **Partial**: a control exists but needs production evidence, owner configuration, or workflow completion.
- **Approval pending**: draft exists but requires counsel or authorised-signatory acceptance.
- **Blocked**: launch-critical evidence or control is absent.

| Requirement | Implemented control / evidence | Responsible owner | Status | Document version / effective date | Review schedule |
|---|---|---|---|---|---|
| Public privacy notice | `/legal/privacy`; version/status banner; draft pages are `noindex` | Privacy owner to be named | Approval pending | `draft-0.1` / none | Before launch; annual and on material change |
| Terms of Service | `/legal/terms`; signed agreement precedence; no invented liability or jurisdiction terms | Business owner + Indian counsel | Approval pending | `draft-0.1` / none | Before launch; annual and on material change |
| Cookie disclosure | `/legal/cookies`; current code audit identifies strictly necessary session cookies only | Privacy + Engineering | Implemented, production verify pending | `draft-0.1` / none | Before each tracking change |
| Acceptable use | `/legal/acceptable-use` | Security + Business owner | Approval pending | `draft-0.1` / none | Annual |
| Data processing agreement | `data-processing-agreement-template.md` and `/legal/data-processing` | Indian counsel + authorised signatory | Approval pending | Draft / none | Per material processing change |
| Institution service agreement | `institution-service-agreement-template.md` | Business owner + Finance + Indian counsel | Approval pending | Draft / none | Per pricing/service change |
| Data mapping and minimisation | Prisma/application audit; full passwords/tokens not exposed; Aadhaar made optional and masked when provided | Engineering + Privacy | Partial | Code review 2026-08-22 | Quarterly and per module |
| Child-data notice and authority | Student collection notice; public privacy child-data section | Institution + Privacy owner | Partial; evidence workflow blocked | `draft-0.1` | Per admission cycle |
| Consent capture | Communication preferences retain consent date/source; no general legal-acceptance ledger exists | Institution + Product + Engineering | Blocked for launch-scale evidence | Migration-backed workflow required | Before public onboarding |
| User agreement acceptance | Public documents versioned; no account-level acceptance/version record exists | Product + Legal + Engineering | Blocked | Design and additive migration required | Before public self-service onboarding |
| Aadhaar admission policy | Aadhaar optional in create form/schema; only masked reference and last four stored | Institution + Engineering | Implemented | Code 2026-08-22 | Annual and UIDAI change |
| Rights and grievance handling | `/legal/data-rights`; internal procedure | Grievance Officer to be named | Blocked until contacts, ticketing, SLA, and drill | Draft / none | Quarterly drill |
| Data export, correction, deletion | Existing record edit/export capabilities vary by module; no unified verified request workflow | Institution + Engineering | Partial | Module evidence required | Quarterly |
| Retention and secure deletion | Proposed schedule documented; soft-delete/private-storage patterns vary; hard-delete job not certified | Privacy + Operations + Engineering | Blocked | Draft / none | Quarterly |
| Security safeguards | RBAC, tenant/branch scope, hashed credentials, private storage, audit logs, validation, security headers | Security + Engineering | Partial; production evidence required | Current application | Every release |
| Incident and breach response | `incident-response-plan.md` | Incident Commander and CERT-In PoC to be named | Blocked until contacts and rehearsal | Draft / none | Semiannual drill |
| CERT-In logging/reporting | Audit/security logs exist; 180-day India log-retention and six-hour escalation evidence not certified | Security + Operations | Blocked | Production architecture evidence required | Monthly evidence review |
| Subprocessors | `subprocessor-register.md`; Supabase/Vercel identified; optional providers disabled unless approved | Privacy + Procurement/Security | Partial | Draft / none | Quarterly and before provider change |
| Cross-border processing | Must be confirmed from actual regions, support access, contracts, and government restrictions | Privacy + Indian counsel | Blocked | Transfer assessment required | Before launch and region change |
| Subscription/billing/refunds | Terms defer to signed Order Form; automated billing is not represented as live | Business + Finance + Indian counsel | Blocked for public paid launch | Commercial schedule required | Per plan change |
| Consumer and dark-pattern review | No public checkout audited; plain-language/legal routes added | Product + Indian counsel | Partial | UX review required | Before public sales/checkout |
| Accessibility and vulnerable users | Large targets, labelled forms, mobile support; legal pages use semantic headings | Product + Accessibility owner | Partial | Browser/accessibility evidence required | Every major UI release |
| Employment/staff data | Staff collection notice; role-scoped staff workflows | Institution + HR/legal reviewer | Partial | Institution policy required | Annual |
| Financial data | Masked student bank references; FeeDesk full module status must be separately assessed | Finance + Privacy | Partial | Scope review required | Before FeeDesk activation |
| Intellectual property and licences | Draft terms; dependency licence/SBOM review not formally signed | Engineering + Indian counsel | Blocked | Licence register required | Every release |
| Backup/recovery and availability claims | Terms do not promise unverified RPO/RTO; production evidence remains separate | Operations + Business | Blocked for contractual SLA | Recovery evidence required | Quarterly rehearsal |
| Suspension/termination | Draft terms preserve data; operational offboarding procedure not certified | Operations + Legal | Partial | Exit runbook required | Per termination |
| Legal publication gate | `npm run legal:readiness`; missing details fail closed; drafts remain `noindex` | Release manager | Implemented | `draft-0.1` | Every production build/release |

## Open Legal Decisions Requiring Authorised Review

1. Confirm the legal entity name, registration details, registered address, tax details, and authorised signatory.
2. Confirm whether JinaCampus is a Data Processor, Data Fiduciary, or joint/independent Data Fiduciary for each processing purpose.
3. Approve governing law, venue, dispute process, liability cap, indemnities, warranties, service credits, force majeure, and insurance requirements.
4. Approve plan pricing, taxes, renewal, cancellation, refunds, suspension, grace periods, and consumer/e-commerce applicability.
5. Confirm retention periods against CBSE, CISCE, State Board, employment, tax, limitation, and institution-specific requirements.
6. Confirm child-consent method, age/guardian verification, and exceptions effective at launch.
7. Approve cross-border regions, subprocessors, support access, data-transfer terms, and government-notified restrictions.
8. Name the Grievance Officer, privacy contact, CERT-In Point of Contact, Incident Commander, and backup contacts.
9. Approve the production RPO/RTO and ensure the infrastructure can substantiate contractual claims.
10. Confirm accessibility, language, and notice requirements for the intended pilot populations.

## Evidence Naming

Use secret-free evidence references in the form `LEGAL-<AREA>-YYYYMMDD-<sequence>`. Evidence must not contain credentials, database URLs, student records, guardian records, staff records, tokens, or private attachments.
