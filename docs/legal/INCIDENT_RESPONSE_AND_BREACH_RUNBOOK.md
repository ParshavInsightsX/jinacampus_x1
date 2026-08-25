# JinaCampus Incident Response and Personal Data Breach Runbook

Status: **PRE-LAUNCH DRAFT — Security + Indian counsel approval required**  
Version: 0.1  
Prepared: 25 August 2026

## 1. Objective

Provide one auditable response process for security incidents, personal-data breaches, service compromise, credential compromise, malware/ransomware, unauthorised access, tenant-isolation failures, data exfiltration, material availability incidents and reportable cyber incidents.

This runbook deliberately uses the shortest potentially applicable deadline as the operational escalation trigger. Legal determines which notification duty actually applies.

## 2. Roles

- **Incident Commander (IC):** coordinates response and timeline.
- **Security Lead:** investigation, containment, evidence and technical classification.
- **Privacy/Legal Lead:** DPDP/IT/CERT-In/customer notification assessment and privilege decisions.
- **Engineering Lead:** remediation and safe recovery.
- **Operations/Support Lead:** customer coordination and status channel.
- **Executive Approver:** material business decisions and public statements.
- **Vendor Coordinator:** hosting/database/storage/communications/payment provider escalation.

Named people, phone numbers and alternate contacts belong in the private incident contact sheet, not this public repository.

## 3. Immediate response

### T+0: detect / receive alert

Create an incident record and preserve:

- `incidentId`;
- `detectedAt` and source;
- `awarenessAt` (when JinaCampus has sufficient awareness of an incident/breach to trigger legal assessment);
- reporter/contact;
- affected service/environment;
- suspected tenants/branches/users;
- suspected data categories and child-data involvement;
- current severity;
- assigned IC/security/legal owners.

### First hour

1. Preserve logs, alerts, relevant database/storage audit events and volatile evidence where practicable.
2. Contain active compromise without destroying evidence.
3. Rotate/revoke exposed credentials or sessions when justified.
4. Determine whether tenant isolation may have failed. Treat cross-tenant exposure as high severity until disproved.
5. Identify involved subprocessors and open their emergency channels.
6. Start the notification clock worksheet. Do not wait for root-cause certainty before escalating a potentially reportable incident.
7. Keep an immutable timeline of decisions/actions.

## 4. Severity

### SEV-1 Critical

Any credible cross-tenant data exposure; privileged/platform administrator compromise; confirmed exfiltration of student/guardian/staff data; widespread authentication bypass; destructive attack affecting recoverability; major payment/financial compromise; or incident likely to trigger urgent statutory notification.

### SEV-2 High

Confirmed unauthorised access limited to one tenant; sensitive document exposure; material malware; significant service compromise; or high-likelihood personal-data breach with limited scope.

### SEV-3 Moderate

Contained security event with low data exposure likelihood, limited availability impact or policy violation requiring investigation.

### SEV-4 Low

Benign/blocked attempt, false positive or low-risk issue with no compromise evidence.

Severity may only move downward with recorded evidence/reason.

## 5. Regulatory decision worksheet

Privacy/Legal must answer and timestamp:

1. Is this a cyber incident within a category reportable to CERT-In under the directions currently in force?
2. When did the organisation become aware?
3. Does a six-hour CERT-In reporting window apply? If potentially yes, escalate for filing immediately; do not wait for a complete forensic report.
4. Is this a "personal data breach" under the DPDP framework and are the relevant notification provisions in force for JinaCampus at the time?
5. Which Data Principals are affected and what contact channels are available?
6. Is notification to the Data Protection Board required without delay and is a detailed update due within the prescribed period (including the 72-hour requirement when applicable)?
7. What institution/customer contractual notice deadlines apply?
8. Are police, sector regulators, insurers, payment providers or other authorities implicated?
9. Are any affected persons children requiring guardian/institution-coordinated communications?
10. Does a legal hold apply?

**Never record "not reportable" without the decision owner, reason and timestamp.**

## 6. CERT-In readiness

Operations/Security must maintain:

- current CERT-In incident reporting contact/process from the official CERT-In site;
- a 24x7 escalation path capable of meeting the applicable reporting window;
- system clock synchronisation to approved time sources;
- an inventory of ICT/security logs and retention locations;
- evidence that required logs are retained for the applicable minimum period and within India where required by the Directions;
- vendor clauses requiring prompt cooperation and log preservation;
- a prepared factual incident-report template.

A CERT-In report should be factual and updated as the investigation develops. Never delay a required initial report solely because all fields are not yet known.

## 7. DPDP breach communication readiness

When applicable, affected-person communications must be concise, clear and plain-language and be based on verified facts. Prepare fields for:

- nature, extent and timing of the breach;
- likely consequences relevant to the affected person;
- mitigation already taken / underway;
- safety/protective steps the affected person may take;
- JinaCampus/institution contact for questions;
- any institution-specific action.

The Board notification record must preserve initial notice and subsequent detailed information, cause/leading events, mitigation, findings on responsible persons if known, remedial steps and communications, as required at the time.

Legal must confirm exact content/deadlines against the Rules then in force before sending.

## 8. Investigation and evidence

Preserve only necessary evidence with controlled access:

- authentication/session/passkey/OTP events;
- API/application/security logs;
- database/storage access/audit logs;
- cloud/provider logs;
- relevant audit-log rows;
- deployment/configuration changes;
- affected object identifiers and tenant scopes;
- vulnerability/exploit indicators;
- support/security reports;
- hashes/snapshots where appropriate.

Do not copy production student/staff data into tickets, chat, source control or personal devices. Redact evidence shared beyond the incident team.

## 9. Containment and recovery gates

Before restoring normal operation, Security + Engineering must confirm:

- exploited access path is closed or compensating control is active;
- compromised credentials/sessions are revoked;
- malicious persistence is removed;
- tenant-scoping/authz regression tests pass for relevant paths;
- data integrity checks are complete;
- backup restore is used only from known-good recovery points;
- monitoring for recurrence is enabled;
- legal/evidence preservation requirements are not broken by cleanup.

For a tenant-isolation incident, production reopening requires explicit Security approval.

## 10. Customer/public communications

Only authorised Legal/Executive/Communications owners may issue public statements. Support must use an approved incident message and must not speculate about attacker identity, scope, cause, legal liability or "no risk" before verification.

Institutions should receive tenant-specific facts where possible; never expose another school's identity or data while reporting an incident.

## 11. Post-incident review

Complete within an internally approved period after containment:

- root cause and contributing factors;
- affected tenants/data/period;
- notification decisions and timeliness;
- containment/recovery effectiveness;
- audit/logging gaps;
- vendor performance;
- security/control changes;
- tests preventing recurrence;
- policy/training updates;
- owner/due date for every corrective action.

Material incidents require management review. Evidence must be linked in the private compliance register.

## 12. Tabletop before launch

Run at least these scenarios:

1. compromised principal account exposes one school's student documents;
2. authorization defect allows cross-tenant student lookup;
3. leaked Supabase/service credential exposes a private storage bucket;
4. ransomware/availability incident with uncertain exfiltration;
5. communications-provider breach affecting guardian phone numbers/messages.

For each exercise measure time to IC assignment, containment, tenant identification, CERT-In/legal decision, affected-person decision, vendor escalation and executive briefing.

## 13. Incident record template

| Field | Value |
|---|---|
| Incident ID | |
| Severity | |
| Detected at | |
| Awareness at | |
| Incident commander | |
| Security lead | |
| Legal/privacy lead | |
| Affected systems | |
| Affected tenant IDs | |
| Data categories | |
| Child data involved | Yes / No / Unknown |
| CERT-In decision / deadline | |
| DPDP decision / deadline | |
| Contractual notices | |
| Contained at | |
| Recovered at | |
| Root cause | |
| Evidence location | |
| Post-incident review | |
