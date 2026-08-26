# Security Incident and Personal Data Breach Response Plan

Status: **Draft - contacts and rehearsal pending**
Version: `draft-0.1`

## Required Roles

| Role | Primary | Backup | Status |
|---|---|---|---|
| Incident Commander | Pending | Pending | Launch blocker |
| Security Lead | Pending | Pending | Launch blocker |
| Privacy/Legal Lead | Pending | Pending | Launch blocker |
| CERT-In Point of Contact | Pending | Pending | Launch blocker |
| Operations/Recovery Lead | Pending | Pending | Launch blocker |
| Institution Liaison | Per affected institution | Pending | Contract requirement |

## Severity and First Actions

1. Record detection time, reporter, affected service, symptoms, and evidence reference.
2. Protect people and contain active access without destroying evidence.
3. Revoke compromised sessions/credentials, isolate affected workers/providers, and disable risky features where necessary.
4. Determine affected tenant, institution, branch, users, records, data categories, time range, storage, providers, and geographic locations.
5. Preserve immutable logs and a decision timeline. Do not copy raw secrets or broad personal datasets into incident tickets.
6. Activate legal/privacy assessment and institution communication.

## Notification Decision

- CERT-In Directions require qualifying incidents to be reported within the applicable short statutory window and require a designated Point of Contact. The operating target must support the current six-hour direction unless official requirements change.
- DPDP breach notice timing and content must follow the provisions and rules effective on the incident date. The 2025 Rules include affected-person notice without delay and Board reporting requirements, with detailed information generally required within the prescribed period.
- Institution notification timing, responsibilities, content and approval must match the signed DPA and incident schedule.
- No notification may state that a provider delivered a message unless delivery evidence confirms it.

Qualified counsel decides reportability; operations must escalate early enough to meet the shortest potentially applicable deadline.

## Containment, Recovery, and Evidence

- Apply tenant-scoped containment and verify no cross-tenant impact.
- Restore only from verified backups after cause and integrity checks.
- Validate migrations, credentials, object storage, queues, webhooks and scheduled jobs before reopening.
- Monitor for recurrence and unauthorised access.
- Record root cause, impact, decisions, notices, recovery time, data loss window, corrective actions and owners.

## Log Controls

CERT-In-relevant ICT logs must be enabled, protected, retained for the required rolling period, and maintained within India where required. The production logging architecture must demonstrate coverage, timestamps, access control, integrity, searchability, retention and secure deletion. Application audit logs alone are not proof that all required ICT logs are covered.

## Mandatory Rehearsals

- credential/session compromise;
- cross-tenant access attempt;
- private storage disclosure;
- database availability or restore event;
- malicious document upload;
- provider/webhook compromise when providers are enabled;
- child-data disclosure and urgent guardian/institution coordination;
- CERT-In and DPDP notification clock exercise.

No public launch readiness claim is permitted until primary/backup contacts are named and at least one tabletop plus one technical recovery rehearsal is recorded.
