# SchoolCast Release Approval Ledger

## Current Decision

**NO-GO for SchoolCast activation as of 15 August 2026.** Restricted source publication and a deployment with SchoolCast remaining `DISABLED` are authorised under `SC-AUTH-DEPLOY-20260815`. Migration, runtime configuration changes, workers, providers, tenant enablement, and live delivery remain unauthorised. Names, timestamps, and evidence references for the four formal operational sign-offs must still be supplied by their accountable owners.

The four formal sign-off requests and the separately scoped production migration request remain pending. The current operator-session directive authorises only `SC-AUTH-DEPLOY-20260815`; it is recorded in `docs/evidence/schoolcast-disabled-scope-deployment-authorization-2026-08-15.json` and does not authorise the migration or any activation action.

Governance acknowledgement `SC-ACK-20260815-01` is recorded as process acknowledgement only. It does not change any approval or authorization status and records every production-impacting action as not performed.

## Technical Evidence

| Gate | Status | Evidence reference | Accountable owner |
|---|---|---|---|
| Additive staging migration and schema validation | Passed in staging | `docs/schoolcast-staging-release-qa.md` | Engineering owner pending |
| Synthetic role/isolation/functional QA | Passed in staging | `docs/schoolcast-staging-release-qa.md` | QA owner pending |
| Private staging Storage and scanner recovery | Passed in staging | `docs/schoolcast-staging-release-qa.md` | Security owner pending |
| Synthetic DRY_RUN worker reference | Passed in staging; not production-scale approval | `docs/schoolcast-production-release-gates.md` | Operations owner pending |
| Pilot capacity and SLO target | Approved target; hosted certification pending | docs/schoolcast-on-call-runbook.md | Requesting product owner; formal name pending |
| Required source producers | Synthetic staging cutover passed; production monitoring/cutover pending | `docs/schoolcast-staging-release-qa.md` | Module owners pending |
| Hosted production worker/scheduler | Pending | Distributed staging profile and preflight are validated; no approved hosts or deployment evidence | Operations |
| Monitoring, alerting, and on-call drill | Pending | Dual scrape/Alertmanager and dead-man heartbeat controls validate; no approved endpoints, owners, or drill evidence | Operations |
| Hosted private malware scanner | Pending | Private per-host ClamAV profile exists; no host, load, outage, signature, retention, or approval evidence | Security/operations |
| Live email configuration and pilot | Blocked | Guarded staging audit found zero provider configurations, approved external templates, consent records, or non-dry-run rows; no approved sender, billing, webhook, or pilot evidence | Business/operations |
| Live WhatsApp configuration and pilot | Blocked | Guarded staging audit found zero provider configurations, approved external templates, consent records, or non-dry-run rows; no approved business/phone identity, billing, webhook, or pilot evidence | Business/operations |
| Production backup/PITR and restore rehearsal | Blocked after partial staging rehearsal | The staging logical backup restored and validated in 73.314 seconds, but it is on-demand, excludes Storage objects, has no off-site copy, and cannot certify production RPO/RTO; see docs/schoolcast-production-recovery-rehearsal.md | Database/operations |
| Production fail-closed release scope | Verified for the next deployment | Vercel Production explicitly contains `SCHOOLCAST_RELEASE_SCOPE=DISABLED`; the control-plane update completed on 15 August 2026 | Engineering/operations |
| Production worker kill switch | Verified for the next deployment | Vercel Production explicitly contains `SCHOOLCAST_WORKER_ENABLED=false`; the control-plane update completed on 15 August 2026 | Engineering/operations |
| Production feature-disable/rollback rehearsal | Partial | Server fail-closed policy and staging queue-claim denial passed; current and prior ready Vercel rollback candidates exist; no production traffic rollback was authorised | Engineering/operations |

Repository-only distributed staging status: `docs/schoolcast-distributed-staging-readiness.md`.
Provider/recovery evidence contract and current operator procedure: `docs/schoolcast-provider-and-recovery-readiness.md`. The measured staging restore evidence and unresolved production boundary are recorded in `docs/schoolcast-production-recovery-rehearsal.md`. The machine validator rejects unknown fields, raw contacts, and credentials and does not authorize migration, worker activation, or live delivery.

## Required Sign-Offs

| Approval | Decision | Approver | Date/time | Evidence or conditions |
|---|---|---|---|---|
| Operations | Requested; decision pending | Not supplied | Not supplied | `SC-APR-OPS-20260815`; recovery ownership, monitoring, runbooks, alerting, and restore evidence required |
| Technical/engineering | Requested; decision pending | Not supplied | Not supplied | `SC-APR-ENG-20260815`; migration, schema, regression, rollback, and production-target evidence required |
| Security/privacy | Requested; decision pending | Not supplied | Not supplied | `SC-APR-SEC-20260815`; encryption, independent retention, Storage recovery, privacy, and incident evidence required |
| Product/business | Requested; decision pending | Not supplied | Not supplied | `SC-APR-PROD-20260815`; disabled-scope limitations, deferred capabilities, support, and rollback acceptance required |
| Institutional pilot owner | Pending | Not supplied | Not supplied | Controlled pilot acceptance and support readiness |

## Independent Production Action Authorisations

Every row is a separate release gate. Approval of one row does not approve any other row.

| Production action | Status | Authoriser | Date/time | Evidence reference |
|---|---|---|---|---|
| Apply additive SchoolCast database migration | Request prepared; not authorised | Not supplied | Not supplied | `SC-AUTH-MIG-20260815`; recovery gate and four approvals remain incomplete |
| Deploy reviewed SchoolCast code with scope `DISABLED` | Authorised; execution blocked by separately gated schema migration | Explicit current-session owner directive; formal name/designation not supplied | 15 August 2026 | `docs/evidence/schoolcast-disabled-scope-deployment-authorization-2026-08-15.json`; no migration authority |
| Activate SchoolCast workers or schedulers | Not authorised | Not supplied | Not supplied | Hosted worker certification remains incomplete |
| Activate email or WhatsApp providers | Not authorised | Not supplied | Not supplied | Provider, consent, billing, webhook, and recipient-pilot gates remain incomplete |
| Change production scope to `IN_APP_CORE` | Not authorised | Not supplied | Not supplied | Consider only after migration and disabled-scope deployment smoke tests pass |
| Enable the approved pilot tenant | Not authorised | Not supplied | Not supplied | Requires a separate pilot owner, audience, monitoring, audit, and acceptance record |

## Approval Recording Rules

1. Record the decision, accountable person, timestamp, immutable evidence reference, and any conditions.
2. Do not store provider secrets, database URLs, recipient contacts, or credentials in this ledger.
3. A conditional approval remains blocked until every condition has evidence.
4. Any failed release rehearsal returns the decision to NO-GO.
5. Production feature flags, migration, live providers, and workers remain disabled until every required sign-off is approved.
6. The release-evidence validator always returns every production action as unauthorised. An accountable human authorisation record is required after the prerequisite evidence passes.
