# JinaCampus Legal and Regulatory Readiness Pack

Status: **DRAFT - NOT APPROVED FOR PUBLIC LAUNCH**
Prepared: 2026-08-22
Default document version: `draft-0.1`

This directory contains implementation drafts and operational controls for review by qualified Indian legal counsel, privacy/security reviewers, and authorised Parshwa Insights signatories. It is not legal advice and must not be represented as a final compliance opinion.

## Public Documents

The application exposes these draft routes:

- `/legal/privacy`
- `/legal/terms`
- `/legal/cookies`
- `/legal/acceptable-use`
- `/legal/data-rights`
- `/legal/security`
- `/legal/data-processing`

Draft pages are marked as drafts and set to `noindex`. They become publication-ready only after the `npm run legal:readiness` gate passes with approved values for the legal entity, named contacts, version, effective date, and review date.

## Internal Documents

- `legal-readiness-register.md`: requirement, control, owner, approval, evidence, and review register.
- `data-processing-agreement-template.md`: institution/JinaCampus DPA drafting schedule.
- `institution-service-agreement-template.md`: commercial and service terms drafting schedule.
- `data-retention-schedule.md`: proposed record retention and deletion rules.
- `data-rights-and-consent-procedure.md`: verified request and consent operations.
- `incident-response-plan.md`: security incident and breach response procedure.
- `subprocessor-register.md`: current and optional service-provider review register.
- `launch-approval-record.md`: required counsel and executive approvals.

## Governing Sources to Recheck Before Approval

- [Digital Personal Data Protection Act, 2023](https://www.meity.gov.in/static/uploads/2024/02/Digital-Personal-Data-Protection-Act-2023.pdf)
- [Digital Personal Data Protection Rules, 2025](https://www.meity.gov.in/static/uploads/2025/11/53450e6e5dc0bfa85ebd78686cadad39.pdf)
- [DPDP commencement notification, 13 November 2025](https://www.meity.gov.in/static/uploads/2025/11/c56ceae6c383460ca69577428d36828b.pdf)
- [CERT-In directions under section 70B](https://www.cert-in.org.in/PDF/CERT-In_Directions_70B_28.04.2022.pdf)
- [Information Technology SPDI Rules, 2011](https://www.meity.gov.in/sites/upload_files/dit/files/RNUS_CyberLaw_15411.pdf)
- [Consumer Protection resources](https://consumeraffairs.nic.in/acts-and-rules/consumer-protection/consumer-protection)
- [UIDAI Aadhaar myth busters](https://uidai.gov.in/en/my-aadhaar/about-your-aadhaar/aadhaar-myth-busters.html)
- [NCPCR guidelines](https://www.ncpcr.gov.in/public/guidelines)

The DPDP framework has phased commencement. Counsel must confirm the provisions effective on the actual launch date and how transitional IT Act/SPDI obligations apply. State education rules, board rules, school-record requirements, employment law, tax, payments, consumer law, and contract stamping/execution requirements must be assessed for each launch model and jurisdiction.

## Launch Rule

Public launch is blocked until:

1. Indian counsel approves the final documents and legal-role allocation.
2. Authorised signatories accept liability, commercial, dispute, refund, and service-level terms.
3. Privacy and grievance contacts are named and operational.
4. Institution contracts, DPA, subprocessor list, retention schedule, rights procedure, and incident plan are executed or approved.
5. Required consent/notice evidence and contract-version acceptance are auditable.
6. Production backup, recovery, security logging, CERT-In escalation, and breach drills are evidenced.
7. State/board-specific and child-data requirements for the pilot institutions are confirmed.
