# JinaCampus Full SchoolCast MVP

## Status

The Full SchoolCast application foundation and school-owned communication workflows are implemented as of 14 August 2026. The module remains **disabled by default and not released to production**.

Controlled staging validation is complete for one synthetic tenant using IN_APP delivery and DRY_RUN mode. The additive migration, private bucket, ClamAV scanner, authenticated role/scope QA, communication lifecycles, and staging worker transitions passed in the approved isolated staging project. See `docs/schoolcast-staging-release-qa.md` for the evidence ledger.

No production database, storage, feature flag, provider, source-module cutover, deployment, or real recipient was changed. The code remains fail-closed for every non-pilot tenant. Bounded synthetic worker concurrency and scanner-outage recovery now pass in staging, but production release still requires hosted worker capacity/observability, source-contract QA, provider and consent approval, production scanner infrastructure, backup/rollback evidence, and formal sign-off.

## Product Boundary

SchoolCast owns:

- versioned notices, circulars, broadcasts, emergency messages, and communication history;
- Everyday Homework and Classwork communication;
- approval, scheduling, publication, cancellation, and acknowledgement workflows;
- audience rules, immutable recipient snapshots, and per-channel eligibility evidence;
- recipient preferences and consent evidence;
- private attachments and short-lived authorised access;
- external-delivery outbox, attempts, provider events, retries, and operational views;
- in-application notification inbox, read state, and acknowledgement;
- source-event references used by separately approved automations.

SchoolCast references, but does not own or mutate:

- CampusCore tenants, institutions, branches, academic years, users, roles, settings, branding, time zones, and audit logs;
- Academia classes, sections, subjects, assignments, students, guardians, contacts, and enrollments;
- student/staff attendance records;
- GradeBook marks, results, publications, and report-card objects;
- FeeDesk financial records;
- staff leave records;
- institutional calendar records.

External provider calls never occur inside a source-module business transaction. Source modules must commit their business record and domain event first; a SchoolCast worker may process an approved event contract later.

## Supported Channels

| Channel | Local implementation | Release posture |
|---|---|---|
| In-application | Inbox, read, acknowledgement, deep link, recipient snapshot | Pilot first |
| Email | Resend adapter, idempotency header, timeout, signed Svix webhook, sent/delivered/opened/bounced/complained/failed mapping | DRY_RUN/TEST until approved |
| WhatsApp | Meta Cloud template adapter, timeout, signed webhook, sent/delivered/read/failed mapping | DRY_RUN/TEST until approved |

SMS, push, two-way chat, chatbot, social feed, surveys, and marketing automation are not part of this MVP.

## Rollout Controls

The separate Administrator Portal controls the master flag and subfeatures. School users cannot enable them.

| Setting | Default | Purpose |
|---|---:|---|
| `schoolCastEnabled` | `false` | Master route, navigation, and service gate |
| `schoolCastInAppEnabled` | `false` | In-application delivery and inbox |
| `schoolCastNoticesEnabled` | `false` | Notices, circulars, broadcasts, emergency communication |
| `schoolCastHomeworkEnabled` | `false` | Homework/Classwork workflow |
| `schoolCastApprovalsEnabled` | `false` | Approval lifecycle |
| `schoolCastEmailEnabled` | `false` | Email eligibility and delivery |
| `schoolCastWhatsAppEnabled` | `false` | WhatsApp eligibility and delivery |
| `schoolCastAutomationEnabled` | `false` | Trusted source-event automation gate |
| `schoolCastAnalyticsEnabled` | `false` | Delivery analytics |
| `schoolCastDeliveryMode` | `DRY_RUN` | `DRY_RUN`, `TEST`, or controlled `LIVE` |
| `schoolCastTeacherDirectPublish` | `false` | Allows assigned teachers to publish Homework/Classwork without approval |

The Administrator Portal refuses `LIVE` unless every enabled external channel has a default provider in `READY` and `LIVE` state. That readiness check does not replace provider, legal, consent, billing, webhook, or pilot approval.

## Access Model

| Capability | Principal | Teacher | Office Staff | Staff | Platform Administrator |
|---|---:|---:|---:|---:|---:|
| View SchoolCast dashboard/history | Institution scope | Assigned/own scope | Inbox only by default | Inbox only | No tenant content access |
| Create notices/broadcasts | Yes | No by default | No | No | No |
| Review/approve/publish communications | Yes | No | No | No | No |
| Create Homework/Classwork | Yes | Exact active assignment | No | No | No |
| View/update own preferences and consent | Yes | Yes | Yes | Yes | No |
| Manage templates/settings | Yes, without provider secrets | No | No | No | Pilot controls only |
| Manage provider secrets or enable live | No | No | No | No | Deployment/operator process |

Every service still checks authenticated tenant context, accessible branch, active academic year where relevant, permission, and record scope. Navigation visibility is only a usability layer.

## Core Communication Workflow

1. An authorised user creates a communication with server-resolved scope, audience rules, and selected channels.
2. Content is stored as an immutable version with a canonical hash. Unsafe HTML/script content is rejected and rendered text is escaped.
3. Audience preview resolves active users, staff, students, and linked guardians from source modules within tenant/branch/year scope.
4. Submission either creates a pending approval or marks the version approved according to the tenant policy.
5. Scheduling stores UTC execution time plus the institution time-zone identifier.
6. Publication atomically claims the communication, blocks unsafe attachments, re-resolves recipients, freezes recipient/channel eligibility, creates in-app rows, and queues external outbox rows.
7. Deterministic idempotency keys and unique constraints make repeated publication duplicate-safe.
8. The delivery worker claims queued rows with a lease, calls the configured adapter outside the publication transaction, records attempts/events, and schedules bounded exponential retries.
9. Signed provider webhooks reconcile delivery evidence without trusting provider payloads before signature verification.
10. Cancellation stops unsent queued/retrying rows and retains immutable history.

## Everyday Homework and Classwork

The dedicated workflow supports:

- HOMEWORK or CLASSWORK type;
- exact branch, academic year, class-section, and subject;
- active teacher assignment checks on the server;
- assignment date, completion due time, instructions, remarks, and supported attachments;
- approval flow or separately enabled direct teacher publication;
- parent/guardian audience resolution from active enrollments and links;
- in-app, email, and WhatsApp channel eligibility according to flags, preferences, consent, contacts, templates, and provider readiness;
- cancellation, resend with reason, delivery history, and audit events.

SchoolCast does not create students, guardians, enrollments, subjects, classes, or teacher assignments.

## Audience, Consent, and Privacy

- Client input cannot supply tenant ID, actor ID, permission, role, recipient contact, delivery status, or provider mode.
- Final audience and channel eligibility are resolved server-side and stored as immutable evidence.
- External channels require an address, enabled preference, enabled purpose preference, and current consent or an explicitly configured not-required policy.
- In-application delivery requires a linked JinaCampus user.
- Contacts are masked and hashed in recipient snapshots. Live/test external addresses are encrypted with AES-256-GCM before queueing.
- Audit metadata stores masked or hashed operational identifiers, not raw contact data or message secrets.
- Consent withdrawal and opt-out suppress future eligible deliveries; they do not erase historical evidence.

## Private Attachments

Supported file signatures are PDF, JPEG, PNG, WebP, DOCX, and XLSX. The extension and browser MIME value are not trusted.

Required behavior:

- private Supabase bucket;
- server-only upload/download/delete operations;
- tenant/branch/communication or Homework-version object paths;
- configured size cap up to 20 MB;
- database hash, media metadata, and scan state;
- publication blocked while any current attachment is not `SAFE`;
- short-lived signed download generated only after session, scope, feature, and permission checks;
- audited upload, scan result, signed access, and deletion.

The approved staging environment uses a pinned official ClamAV container and passed clean-file promotion plus exact EICAR rejection. Production malware-scanner infrastructure remains unconfigured and unapproved; attachments still fail closed unless a certified scanner marks them `SAFE`.

## Server-Only Environment

```env
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
SCHOOLCAST_DATA_ENCRYPTION_KEY=
SCHOOLCAST_STORAGE_BUCKET=schoolcast-private
SCHOOLCAST_ATTACHMENT_MAX_BYTES=10000000
SCHOOLCAST_SIGNED_URL_TTL_SECONDS=60
SCHOOLCAST_WORKER_SECRET=
SCHOOLCAST_WORKER_ENABLED=false
SCHOOLCAST_WORKER_DEPLOYMENT_ENVIRONMENT=LOCAL
SCHOOLCAST_WORKER_DATABASE_PROJECT_REF=
SCHOOLCAST_WORKER_REPLICA_ID=
SCHOOLCAST_EXTERNAL_HEARTBEAT_URL=
SCHOOLCAST_EXTERNAL_HEARTBEAT_TIMEOUT_MS=3000
SCHOOLCAST_WORKER_RUN_MODE=ONCE
SCHOOLCAST_WORKER_HEALTH_PORT=9464
SCHOOLCAST_WORKER_HEARTBEAT_TIMEOUT_SECONDS=300
SCHOOLCAST_RESEND_API_KEY=
SCHOOLCAST_RESEND_WEBHOOK_SECRET=
SCHOOLCAST_META_ACCESS_TOKEN=
SCHOOLCAST_META_WEBHOOK_SECRET=
```

Provider configurations store references such as `env:SCHOOLCAST_RESEND_API_KEY`, never raw secrets. None of these values may use a `NEXT_PUBLIC_`, `EXPO_PUBLIC_`, or client bundle prefix.

A hosted worker cannot start unless its database project reference matches `DATABASE_URL`, its replica ID is `worker-a` or `worker-b`, and it has a secure external heartbeat URL. The heartbeat URL is also a server-only secret and must not appear in logs, metrics labels, release evidence, or source control.

## Providers and Webhooks

### Email

- Resend is the approved adapter implemented for this MVP.
- The adapter sends with an idempotency key and a 12-second request timeout.
- `/api/webhooks/resend` reads the raw body, verifies `svix-id`, `svix-timestamp`, and `svix-signature`, and then maps supported events.
- The unique provider event key prevents duplicate callback rows.
- Unsupported events are acknowledged as ignored and do not invent a delivery state.

### WhatsApp

- Meta Cloud template messages are the approved adapter implemented for this MVP.
- Live delivery requires an institution-approved sender identity, phone number ID, template mapping, consent, billing, and rate/cost approval.
- `/api/webhooks/whatsapp` verifies the raw body with the Meta app secret before resolving a delivery attempt.
- Provider message IDs are stored on delivery attempts; audits store their hashes only.

## Workers

`POST /api/cron/schoolcast` requires `Authorization: Bearer <SCHOOLCAST_WORKER_SECRET>` and runs:

1. due scheduled-publication claims and recovery;
2. leased external-delivery processing.

The scheduler worker:

- processes enabled tenants only;
- atomically claims due `SCHEDULED` or stale `PUBLISHING` rows;
- revalidates user, role, branch, academic-year, feature, and publish permission;
- uses at most eight bounded publication attempts;
- records safe failure codes and audits system actions without fabricating an actor.

The delivery worker:

- atomically claims rows with PostgreSQL `SKIP LOCKED` before provider access;
- recovers stale leases and interrupted attempts with bounded retry handling;
- creates one attempt per try;
- uses deterministic request hashes and outbox idempotency keys;
- classifies retryable and permanent failures;
- finalizes only rows still owned by that worker and clears leases after completion/failure;
- stops claims when tenant/channel flags or delivery mode no longer allow delivery;
- requires a READY provider in the exact delivery mode for non-DRY_RUN work;
- keeps raw provider secrets and recipient contacts out of logs.

An approved external scheduler or worker service must invoke the endpoint. No production scheduler was configured in this task.

## Routes

| Area | Route |
|---|---|
| Dashboard | `/schoolcast` |
| Communications | `/schoolcast/communications`, `/schoolcast/communications/new`, `/schoolcast/communications/[communicationId]` |
| Notices | `/schoolcast/notices`, `/schoolcast/notices/new` |
| Broadcasts | `/schoolcast/broadcasts`, `/schoolcast/broadcasts/new` |
| Approvals | `/schoolcast/approvals` |
| Homework/Classwork | `/schoolcast/homework`, `/schoolcast/homework/new`, `/schoolcast/homework/[homeworkItemId]` |
| Delivery operations | `/schoolcast/delivery` |
| Templates | `/schoolcast/templates` |
| Calendar projection | `/schoolcast/calendar` |
| Analytics | `/schoolcast/analytics` |
| Tenant settings | `/schoolcast/settings` |
| Recipient inbox/preferences | `/notifications` |
| Private attachments | `/api/schoolcast/communications/[communicationId]/attachments`, `/api/schoolcast/homework/[homeworkItemId]/attachments` |
| Worker | `/api/cron/schoolcast` |
| Provider callbacks | `/api/webhooks/resend`, `/api/webhooks/whatsapp` |

## Source-Module Integration State

The additive schema includes `SchoolCastDomainEvent`, source entity/version references, and duplicate-safe source communication creation. The automation flag remains off and no source module has been cut over.

Each source integration requires a separately tested contract:

- attendance submitted/corrected and staff summary;
- GradeBook examination/approval/publication/report-card availability;
- staff leave submission/decision/cancellation;
- institution calendar publication/update/cancellation;
- FeeDesk demand/payment/reminder only after FeeDesk exists and is approved.

Cutover must compare old/new counts and idempotency, prove failure isolation, and ensure the source transaction never waits for a provider. Unsupported events must remain unprocessed or explicitly ignored; they must not fabricate source data.

## Migration

`20260814120000_add_schoolcast_mvp_foundation` is additive. It:

- adds SchoolCast enums and tables;
- adds default-off tenant flags and DRY_RUN mode;
- extends existing notification enums and outbox/in-app/preference tables;
- adds indexes, uniqueness constraints, and foreign keys;
- enables row-level security on all 18 new SchoolCast tables as hosted-database defense in depth;
- seeds 83 SchoolCast permissions idempotently and grants only the canonical Principal, Teacher, Office Staff, and Staff subsets;
- leaves provider-secret permissions without a default school-role assignment and does not treat the separate Platform Administrator as a tenant role;
- does not drop a table, column, or enum.

The migration was generated from the preserved pre-SchoolCast Prisma schema snapshot, validated locally, and applied successfully to the approved isolated staging database after a verified backup/restore rehearsal. It has not been applied to production.

## Rollout and Rollback

1. Verify a staging backup/recovery point and exact production-schema baseline.
2. Apply the migration with `npx prisma migrate deploy` to staging only.
3. Configure the private bucket and malware scanner reproducibly.
4. Keep all flags off and run migration/schema/regression checks.
5. Enable one synthetic tenant in IN_APP plus DRY_RUN mode.
6. Complete authenticated role/scope and communication lifecycle browser/API QA.
7. Certify worker concurrency, idempotency, crash recovery, retries, monitoring, and queue controls.
8. Enable email TEST, then an approved limited live pilot.
9. Enable WhatsApp DRY_RUN/TEST, then an approved limited live pilot.
10. Cut source automations over one module at a time after contract QA.

Rollback starts by disabling the master/channel/automation flags and stopping new worker claims. Published communications, snapshots, outbox rows, delivery events, and audits are retained for reconciliation. Revert application code only to a schema-compatible version; do not run a destructive down migration after data exists.

## Verification Completed in This Task

- Approved staging backup, PostgreSQL 17 restore rehearsal, additive migration deployment, migration status, catalog integrity, and SchoolCast schema audit: passed.
- Synthetic pilot isolation, authenticated Principal/Teacher/Staff/Office/control-tenant browser QA, feature-disable behavior, and 390px responsive check: passed.
- Private bucket, clean/malware scan transitions, direct-access denial, signed download/expiry, MIME validation, deletion, and audit QA: passed.
- DB-backed RBAC, cross-tenant, cross-branch, cross-year, unassigned Teacher, approval, publication, duplicate, inbox read/acknowledgement, scheduling, cancellation, archive, rejection, DRY_RUN retry/expiry, and audit ledger: passed.
- Synthetic queue load at 1,000 messages using 5 workers and concurrency 5, including stale-lease recovery, retry resume, feature-disable blocking, and duplicate-safe replay: passed at 5.00 messages/second with zero worker errors and zero provider calls.
- Scanner unavailable/quarantine/retry/recovery behavior: passed with the pinned staging ClamAV service; hosted production scanning remains unconfigured.
- Prisma schema format, validation, and client generation: passed.
- Focused SchoolCast feature-gate, navigation, RBAC, schema, content-safety, masking, idempotency, file-signature, additive-migration, worker, private-storage, signed webhook, and secret-output tests: passed.
- TypeScript strict check: passed.
- Full repository regression suite: 114 files and 940 tests passed.
- Next.js production build: passed, including SchoolCast, notification inbox, attachment, cron-worker, and webhook routes.
- `git diff --check`: passed; the package has no configured lint script.
- Static secret/output scan: passed; no private URLs, credentials, bearer values, database URLs, or public SchoolCast environment variables were found.

## Remaining Release Gates

- Large-audience, webhook-burst, live-provider rate-limit, and approved peak-volume tests beyond the bounded staging reference profile.
- Hosted production worker/queue capacity, observability, dead-letter operations, alerting, crash recovery, and retention certification.
- Production backup/restore evidence, private storage/scanner infrastructure, migration approval, and feature-disable rehearsal.
- Live sender/domain/template/consent/legal/privacy/billing approval and real-recipient provider pilots.
- Dedicated dependency maintenance for the existing `nanoid` advisory reported through `postcss`; no forced dependency upgrade is included in this module task.
- Source-event adapter implementation and failure-isolation certification per source module.
- Calendar-specific reminder rules beyond the current authorised source projection.
- Operational exports, advanced analytics reconciliation, and alerting.
- Full regression, deployment, post-deployment smoke, observability, and formal pilot sign-off.

SchoolCast must not be represented as production-ready or enabled platform-wide until these gates pass.

The authoritative deployment decision and recovery checklist are maintained in `docs/schoolcast-production-release-gates.md`.