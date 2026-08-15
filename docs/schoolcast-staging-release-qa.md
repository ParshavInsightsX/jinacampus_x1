# SchoolCast Staging Release QA

## Status

**Staging validation passed for the synthetic IN_APP/DRY_RUN pilot on 14 August 2026 and was revalidated on 15 August 2026. Production release remains blocked.**

This validation used the approved isolated Supabase staging project. It did not connect to or mutate the production project, enable a production feature flag, call an email or WhatsApp provider, send to a real recipient, commit or push source code, or deploy the application.

## Backup and Migration

- Created a PostgreSQL 17 custom-format pre-migration backup with a SHA-256 manifest.
- Verified the archive with `pg_restore --list`.
- Restored the archive into an isolated PostgreSQL 17 container and verified migration history and synthetic tenants.
- Reran the guarded rehearsal on 15 August 2026 with measured evidence: 61.872-second backup, 10.436-second restore validation, 73.314-second total, 23 completed migrations, 116 public tables, 409 foreign keys, and zero failed migrations, invalid indexes, or unvalidated constraints. This remains staging restore-mechanics evidence, not production RPO/RTO certification.
- Applied additive migration `20260814120000_add_schoolcast_mvp_foundation` to staging only.
- Prisma reports all 23 committed migrations applied.
- Catalog audit passed for 18 SchoolCast tables, 73 foreign keys, 83 permissions, valid indexes, and validated constraints.
- Row-level security is enabled on all 18 new SchoolCast tables as database defense in depth.
- Prisma metadata now maps the existing PostgreSQL-truncated names and database defaults; the full guarded staging comparison reports no schema difference.

Finalization revalidation confirmed all 23 migrations, 115 application tables, 409 foreign keys, 480 valid indexes, zero invalid indexes, and zero unvalidated constraints.

## Synthetic Pilot Configuration

Only `jinacampus-demo` is enabled for SchoolCast in staging. Every other tenant, including the synthetic control tenant, remains disabled.

| Control | Staging value |
|---|---|
| Master SchoolCast flag | Enabled for the synthetic pilot only |
| In-application notifications | Enabled |
| Notices and broadcasts | Enabled |
| Homework and classwork | Enabled |
| Approval workflow | Enabled |
| Analytics | Enabled |
| Email | Disabled |
| WhatsApp | Disabled |
| Source-module automation | Disabled |
| Teacher direct publish | Disabled |
| Delivery mode | `DRY_RUN` |
| External providers | Disabled; no secret references |

Staging preparation creates or refreshes only synthetic browser-QA credentials and revokes only those synthetic sessions. Credentials are loaded from a protected environment file and are never printed or committed.

## Private Storage and Malware Scanning

- Reproducibly provisioned private bucket `schoolcast-private` in staging.
- Verified browser-direct object access is denied.
- Verified tenant-safe quarantine and safe-object paths.
- Verified PDF upload, ClamAV scan, quarantine-to-safe promotion, authorised signed download, and deletion.
- Verified exact EICAR content embedded in a structurally valid XLSX is rejected and removed.
- Verified a signed URL works before expiry and fails after expiry.
- Verified unsupported MIME types are rejected.
- Verified Staff and feature-disabled cross-tenant access are denied.
- Verified upload, scan, signed-access, deletion, and QA cleanup audit events.
- Cleaned stale non-rejected synthetic probe artifacts; active QA attachment evidence now contains rejected-malware records only.

The scanner uses the pinned official ClamAV container in staging. Production storage and malware-scanner infrastructure remain unconfigured and unapproved.

## Functional and Security Ledger

The DB-backed staging ledger passed:

- Principal and assigned Teacher dashboard access;
- Office Staff dashboard denial and Staff communication-create denial;
- disabled-tenant denial;
- cross-tenant direct-record safe not-found behavior;
- assigned Teacher Homework/Classwork create and cancel;
- unassigned subject, cross-branch, and cross-academic-year denial;
- self-approval denial and second-Principal approval;
- IN_APP publication, audience isolation, and duplicate publication prevention;
- inbox read and acknowledgement idempotency;
- scheduling, cancellation, archival, and rejection lifecycles;
- DRY_RUN worker claim, retry-resume, sent, and expiry transitions;
- template-variable schema validation;
- critical audit-ledger coverage.

External provider request count was zero.

## Authenticated Browser QA

| Identity | Result | Evidence |
|---|---|---|
| Principal | Pass | Dashboard, communications, approval queue, published detail, archive control, delivery operations, settings |
| Assigned Teacher | Pass | Permission-filtered SchoolCast dashboard and assigned Class 1-A / English Homework form |
| Teacher restricted route | Pass | Direct settings access returned a safe denied state without sensitive output |
| Staff | Pass | Management dashboard returned safe 404; own inbox/preferences loaded with IN_APP enabled and WhatsApp disabled |
| Office Staff | Pass | Management dashboard returned safe 404; own inbox/preferences loaded |
| Disabled control Principal | Pass | SchoolCast absent from navigation; direct dashboard and inbox access denied |
| Mobile responsive | Pass | Assigned Teacher workspace verified at 390 x 844 with mobile navigation and no browser errors |

A staging runtime issue was found during concurrent sessions: the protected URL constrained Prisma to one connection. The SchoolCast staging dev wrapper now overrides only its child process to `connection_limit=5` and `pool_timeout=30`. The protected URL, migration URL, and production settings are unchanged. Repeated browser checks produced no new pool timeout.

The installed in-app browser connector could not start because sandbox-policy metadata was unavailable. QA used the approved `agent-browser` fallback. Temporary browser credential profiles and sessions were deleted after testing.

## Bugs Fixed During Staging QA

1. Added final-state communication archival service/action/UI behavior with permission, scope, transaction, and audit enforcement.
2. Prevented stale attachment scanner workers from writing failure audit events after losing a lease.
3. Added synthetic role credentials only to staging QA preparation for repeatable authenticated role testing.
4. Increased only the staging dev-server Prisma pool from one to five bounded connections.
5. Added scoped cleanup for stale synthetic storage-probe rows and strengthened failed-probe cleanup.
6. Added executable inbox read and acknowledgement idempotency assertions.
7. Replaced non-atomic delivery, scheduled-publication, and attachment-scan claims with bounded PostgreSQL `SKIP LOCKED` claims.
8. Added stale delivery-lease recovery, lock-owner finalization, item-level worker failure recovery, and safe worker-error audits.
9. Added feature, channel, delivery-mode, and provider-readiness gates to delivery claims so disabled tenants and unavailable providers fail closed.
10. Added scheduler advisory locking and claim-version checks so stale workers cannot publish or overwrite a newer claim.

## Source-Module Cutover Certification

The approved producer set passed DB-backed synthetic staging QA:

- one student-attendance event;
- one staff-attendance event;
- one staff-leave event;
- one institutional-calendar event;
- one GradeBook publication event through the bridge;
- five published SchoolCast communications;
- 17 tenant-scoped recipient snapshots;
- seven in-application notifications;
- zero email or WhatsApp outbox rows and zero provider requests;
- zero replay claims after the completed events were submitted again.

The QA temporarily enabled source automation only for jinacampus-demo, restored it to disabled in finally, and removed temporary communications, events, and source fixtures. FeeDesk was not exercised and remains explicitly excluded because the source module is unavailable.

## Worker and Scanner Certification Rerun

The bounded synthetic staging load profile passed on 14 August 2026:

- 500 regular DRY_RUN messages;
- 5 stale SENDING leases with interrupted attempts;
- 25 pre-existing RETRYING rows;
- 5 concurrent workers with per-worker concurrency 5;
- 100.183 seconds measured processing time and 5.04 messages/second reference throughput;
- 5 leases recovered and 505 simulated attempts completed;
- zero worker errors, zero duplicate replay attempts, and zero provider calls;
- feature-disable claim blocking passed.

Scanner recovery QA also passed. With ClamAV intentionally unavailable, the file remained quarantined and received a safe retryable failure. After the pinned scanner restarted, the retry marked the clean file SAFE, promoted it, audited the transition, and completed cleanup.

This is staging reference evidence, not production-scale certification. The higher 10-worker profile saturated the small hosted staging connection pool and made no forward progress; the supported staging profile is therefore capped at 5 workers with concurrency 5. Production capacity still requires an approved traffic target, hosted topology, provider quotas, monitoring, and safety margin.

The machine-readable readiness audit confirmed one enabled synthetic tenant, IN_APP/DRY_RUN only, source automation disabled, retained load/storage/source-cutover evidence, complete producer coverage for the approved source set, no external provider configuration, no approved external template, no external consent record, and no non-DRY_RUN outbox row.

## Commands

Key commands included:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\backup-schoolcast-staging.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\schoolcast-staging.ps1 -Command Catalog
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\schoolcast-staging.ps1 -Command Prepare
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\schoolcast-staging.ps1 -Command Inspect
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\schoolcast-staging.ps1 -Command FunctionalQa
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\schoolcast-staging.ps1 -Command LoadQa
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\schoolcast-staging.ps1 -Command ScannerRecoveryQa
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\schoolcast-staging.ps1 -Command SourceCatalog
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\schoolcast-staging.ps1 -Command SourceQa
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\schoolcast-staging.ps1 -Command ReadinessAudit
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\schoolcast-staging.ps1 -Command StorageProbe
npm run dev:schoolcast:staging
npm run typecheck
```

Browser QA used temporary isolated `agent-browser` sessions against the staging-bound local server. Secrets, passwords, database URLs, provider credentials, raw recipient contacts, and signed URLs were not recorded.


For this unreleased branch, both `npm run dev` and `npm run dev:schoolcast:staging` use the protected SchoolCast staging launcher. The internal `npm run dev:raw` command bypasses the target guard and must not be run with the repository `.env`, which currently targets the production database where the unreleased SchoolCast migration is intentionally absent. Do not apply the migration to production merely to make local development work.

## Remaining Production Gates

SchoolCast is not production-ready. The following remain mandatory:

- production-scale worker and queue concurrency, crash recovery, retry, dead-letter, load, monitoring, and alert certification;
- production source-cutover monitoring and failure drills for the staging-certified Attendance, GradeBook, staff-leave, and calendar producers; FeeDesk remains excluded until its source module exists;
- production backup/restore evidence and separately approved production migration plan;
- production private storage, malware scanner, retention, and worker infrastructure;
- approved email and WhatsApp senders, templates, consent, billing, rate limits, legal/privacy review, webhooks, and real-recipient pilots;
- full load/security/rollback rehearsal and institutional operational sign-off;
- source commit/review, deployment approval, post-deployment smoke testing, and monitored tenant-level rollout.

See `docs/schoolcast-production-release-gates.md` for the current gate matrix, source-integration decision, provider evidence requirements, production rollback checklist, and pending formal approvals.

Production flags and all external-provider channels must remain disabled until those gates are formally approved.
