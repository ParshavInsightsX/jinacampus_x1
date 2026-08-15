# SchoolCast Production Release Gates

## Decision

**Blocked from production deployment as of 15 August 2026.**

SchoolCast is validated only for the synthetic staging pilot using IN_APP delivery in DRY_RUN mode. This gate review did not change production data, storage, feature flags, providers, workers, source integrations, or deployment state.

The reviewed application now has server-controlled `DISABLED`, `IN_APP_CORE`, and `FULL` release scopes. Production defaults to `DISABLED`. `IN_APP_CORE` is only a candidate scope: it excludes external channels, attachments, scheduling, source automation, Homework/Classwork guardian delivery, class-section audiences, templates, provider configuration, delivery operations, webhooks, and workers. This code-level boundary does not satisfy the blocked production recovery or approval gates.

## Gate Matrix

| Gate | Status | Evidence or blocker |
|---|---|---|
| Atomic worker claims and duplicate prevention | Pass in staging | PostgreSQL `SKIP LOCKED` claims, lock-owner finalization, deterministic idempotency, and replay checks passed. |
| Retry and stale-lease recovery | Pass in staging | Ten stale leases were recovered; retrying rows resumed; no duplicate attempts were created. |
| Synthetic load reference | Pass in staging | 1,000 messages, 5 workers, concurrency 5, 5.00 messages/second, 1,010 simulated attempts, zero worker errors, zero provider calls. |
| Production volume/SLA certification | Target approved; certification blocked | The pilot capacity/SLO envelope is approved in docs/schoolcast-on-call-runbook.md; target-scale testing on the final hosted topology remains pending. |
| Queue monitoring, alerts, and dead-letter operations | Distributed staging profile validates; external provisioning blocked | The one-host lab and one-replica-per-host staging profiles, private metrics, eleven alert rules, dual Alertmanager targets, external heartbeat controls, dashboard, target guards, and audited requeue controls are implemented. Two approved hosts, secure log retention/export, alert endpoints, and live drills remain pending. |
| Private staging attachment storage | Pass | Private access, signed expiry, MIME/signature checks, quarantine, deletion, and audit checks passed. |
| Scanner outage and recovery | Pass in staging | Scanner-unavailable failure retained quarantine, retry succeeded after recovery, and clean object promotion/deletion passed. |
| Hosted production malware scanning | Repository profile ready; approval and rehearsal blocked | The staging host profile pins one non-public ClamAV replica per worker host and remains fail-closed. Actual hosts, signature monitoring, load/outage/quarantine drills, log retention, incident procedure, and security approval are missing. |
| Source-module integration | Staging cutover certified | Transactional producers for student/staff attendance, staff leave, calendar, and GradeBook publication produced five published communications, 17 recipient snapshots, seven in-app notifications, zero external-provider rows, and an idempotent replay in the synthetic staging pilot. FeeDesk is explicitly excluded. |
| Email/WhatsApp live delivery | Blocked | The guarded staging audit confirms zero external provider configurations, approved templates, consent records, and non-dry-run rows. No approved sender, webhook, billing control, or consented recipient pilot exists. |
| Staging backup and restore | Pass | Custom-format backup, manifest, archive inspection, and isolated restore rehearsal passed before staging migration. |
| Production backup and rollback | Blocked | Supabase Free does not provide the automatic backup/PITR capability required for the approved 15-minute RPO. Funded Supabase PITR or a separately approved self-managed WAL architecture and restore rehearsal are not supplied. |
| Operational, technical, security, business approval | Blocked | All formal sign-offs remain pending. |

The staging throughput result is a reference profile, not a production capacity claim. It used only synthetic IN_APP/DRY_RUN rows on the approved staging database.

## Verification Completed

- Approved staging migration status: 23 committed migrations applied; schema up to date.
- DB-backed SchoolCast functional/security ledger: 19 scenarios passed; external provider requests: zero.
- Focused distributed-infrastructure regression suite: 6 files and 25 tests passed.
- Full repository regression suite: 122 files and 970 tests passed.
- Prisma format, schema validation, and client generation: passed.
- Strict TypeScript check and Next.js production build: passed.
- Distributed infrastructure drift validator and secret-free per-host Compose config: passed.
- Docker image-level Prometheus/Alertmanager/ClamAV runtime validation: not run because Docker Desktop was stopped.
- `git diff --check`: passed with line-ending notices only.
- SchoolCast sensitive-literal scan: passed.
- No lint script is configured in `package.json`.

These checks establish source and staging confidence only. They do not replace the blocked hosted-infrastructure, provider, production-recovery, or formal-approval gates.
The redacted evidence format and validator are documented in `docs/schoolcast-provider-and-recovery-readiness.md`. A passing evidence file is necessary but intentionally cannot authorize production migration, worker activation, or live delivery.

## Source Integration Matrix

| Source | Current integration | Release decision |
|---|---|---|
| CampusCore and Academia identity/scope data | Read-only audience, enrollment, class, subject, assignment, branch, year, and permission resolution | Passed for the staging workflows already exercised |
| Student and guardian records | Read-only audience/contact eligibility and tenant-scoped recipient resolution | Passed for staging; live-channel consent remains pending |
| Attendance | Transactional student-attendance and staff-attendance/QR producers plus authoritative SchoolCast mapping | Synthetic staging cutover and idempotent replay passed |
| GradeBook | Existing GradeBook publication outbox bridged through duplicate-safe SchoolCast domain events | Synthetic staging cutover passed; GradeBook remains independently gated |
| Staff leave | Transactional action producer for submit, update, review, withdraw, and cancel | Synthetic staging cutover and recipient resolution passed |
| Institutional calendar | Transactional create/update/cancel producer per authoritative target branch | Synthetic staging cutover and recipient resolution passed |
| FeeDesk | No producer and no consumer | Explicitly excluded because the source module is unavailable |

Every future producer must commit its source record and a duplicate-safe domain event without waiting for SchoolCast or an external provider. Its cutover must prove tenant, branch, academic-year, event-version, retry, and failure isolation.

## Provider Approval Evidence Required

Live email or WhatsApp remains prohibited until all items are recorded and approved:

- verified sender identity and production ownership;
- approved, versioned templates and variable schemas;
- recipient consent source, notice version, preference, opt-out, and retention policy;
- server-only provider and webhook secrets with rotation ownership;
- webhook signature verification and replay/duplicate evidence;
- provider quotas, rate limits, retry rules, quiet hours, and billing caps;
- delivery-state reconciliation and complaint/bounce/failure handling;
- legal/privacy review and an approved real-recipient pilot cohort;
- monitoring dashboards, alerts, escalation contacts, and provider-disable procedure.

The staging readiness audit found no external provider configuration, approved external template, external consent record, or non-DRY_RUN outbox row. This is the expected safe staging posture.

## Repository-Controlled Operations Completed

- Added a dedicated SchoolCast worker process with one-shot and continuous modes, graceful shutdown, bounded batch/concurrency controls, and safe structured health output.
- Added queue-depth, queue-age, terminal-failure, attachment-backlog, and scanner-readiness health reporting without infrastructure secrets.
- Added permission-scoped, tenant-safe, audited requeue actions for terminal deliveries, failed source events, and GradeBook dead letters.
- Added duplicate-safe transactional producers for the approved source modules and retained FeeDesk as excluded.
- Added bounded attachment-scan concurrency while preserving private quarantine, integrity checks, lease ownership, retries, and fail-closed behavior.
- Added a staging-only distributed host profile, strict private host inventory, per-host preflight, dual monitoring-target renderer, external dead-man heartbeat, and complete rehearsal evidence gate.
- Added the production operations contract and release approval ledger.

These controls prepare deployment; they do not provision hosted infrastructure or constitute production approval.

Current repository-only evidence is recorded in `docs/schoolcast-distributed-staging-readiness.md`. Its validators intentionally report the topology as not provisioned and keep production migration and worker activation unauthorised.

## Hosted Malware Scanner Requirements

The pinned local staging ClamAV service is evidence for application behavior, not production hosting. Production needs an approved scanner reachable through a private authenticated path from a durable worker. It must provide:

- availability and latency objectives;
- fail-closed quarantine when unavailable or timed out;
- signature/version health monitoring;
- suspicious-file isolation and deletion procedures;
- retry limits and manual review escalation;
- audit records that contain safe references, not file contents or credentials;
- alerts for scanner outage, backlog age, repeated failure, and malware detection;
- a documented retention and incident-response procedure.

Do not expose an unauthenticated ClamAV TCP service to the public internet.

## Production Backup and Rollback Checklist

Before migration:

1. Record the exact application commit, Prisma migration head, production project reference, and approved change window.
2. Capture database backup/PITR evidence and complete a restore rehearsal in an isolated target.
3. Export only reproducible storage configuration and retention policy; verify existing storage recovery procedures.
4. Confirm all SchoolCast tenant and channel flags are disabled and no production provider is LIVE.
5. Verify migration SQL is additive and record the forward-fix recovery owner.

Rollback order:

1. Disable `schoolCastEnabled`, email, WhatsApp, and automation flags.
2. Stop the hosted scheduler/worker and revoke or rotate its secret if compromise is suspected.
3. Confirm no new SchoolCast outbox rows are claimed; retain queued and historical rows for reconciliation.
4. Disable external senders/provider credentials at the provider if needed.
5. Revert only to a schema-compatible application build.
6. Restore storage or database only under the approved incident plan; do not drop additive SchoolCast tables after data exists.
7. Re-run authentication, tenant isolation, existing-module regression, and audit checks before reopening traffic.

## Formal Sign-Off

| Approval | Owner | Status | Evidence reference |
|---|---|---|---|
| Operational | To be designated | Pending | Not supplied |
| Technical | To be designated | Pending | Not supplied |
| Security/privacy | To be designated | Pending | Not supplied |
| Business/provider billing | To be designated | Pending | Not supplied |

## Deployment Rule

No production migration, provider provisioning, storage mutation, source cutover, feature enablement, commit publication, or deployment is authorised by this evidence. Deployment preparation may resume only after the blocked gates above have concrete operator/vendor evidence and formal approval.
