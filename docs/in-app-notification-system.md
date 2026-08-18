# JinaCampus In-App Notification System

## Status

Implementation date: 2026-08-18

The provider-independent in-app notification core is implemented in the application and Prisma schema. Its additive migration is 20260818210000_add_in_app_notification_core.

The migration was applied to the approved main database on 2026-08-18 after a protected logical backup and isolated restore rehearsal. Post-migration verification confirmed the migration ledger, tenant settings columns, six support tables, indexes, foreign keys, RLS state, notification permissions, and feature defaults. Existing production notification feature state was preserved; realtime and browser-push delivery remain disabled.

## Product Boundary

This system is the authenticated JinaCampus inbox for operational events. It is not SchoolCast and does not send WhatsApp, email, SMS, browser push, or native push messages.

Current capabilities:

- Bell with unread count and recent items
- Notification centre with search and filters
- Read, unread, mark-all-read, archive, dismiss, and acknowledgement lifecycle
- Safe internal deep links
- Priority, category, source-module, schedule, expiry, and mandatory controls
- User preferences and institution policy
- Versioned institution or tenant templates
- Tenant-safe aggregate management report
- Transactional outbox, idempotency, bounded fan-out, retry, terminal failure, and audit records
- Staff Leave event integration through the shared outbox

## Architecture

PostgreSQL is the source of truth. Producers write a validated outbox event in the same application transaction as the source workflow where practical. The processor resolves tenant-owned scope and eligible recipients on the server, creates one immutable notification content record, creates recipient state rows in bounded batches, and records a safe audit event.

The browser never supplies tenantId, branchId, academicYearId, actor identity, role, publication status, or delivery status. The authenticated session and server-side database relationships resolve those values.

Polling is the baseline delivery mechanism:

- The navigation bell polls every 45 seconds while the document is visible.
- It refreshes on focus, route changes, visibility changes, and local notification lifecycle events.
- Realtime and browser push feature flags default to disabled.

Scheduled events are processed by the authenticated server-only endpoint POST /api/cron/in-app-notifications. It fails closed unless CRON_SECRET is configured and the bearer value passes a timing-safe comparison.

## Data Model

The existing in_app_notifications table remains the content record and retains legacy Staff Leave columns for migration and rollback safety. The normalized records are:

- InAppNotificationRecipient: per-user delivery and lifecycle state
- InAppNotificationAudienceRule: immutable audience evidence
- InAppNotificationTemplate: versioned tenant or institution template
- InAppNotificationPreference: user category preference
- InAppNotificationSetting: tenant, institution, or branch generation policy
- InAppNotificationOutbox: idempotent asynchronous event ledger

Every module-owned record is tenant-scoped. Institution, branch, and academic-year fields are included where operationally relevant. Unique indexes protect notification and outbox idempotency and one recipient row per notification/user pair.

The migration backfills existing Staff Leave notification rows and creates their recipient records. It does not delete legacy notification content. It also idempotently repairs the previously unmigrated INSTITUTION variants required by the current RoleScope and RoleAssignmentScope Prisma enums.

## Routes

Authenticated pages:

- /notifications
- /notifications/[notificationId]
- /notifications/preferences
- /notifications/manage

Authenticated user APIs:

- GET /api/notifications
- POST /api/notifications/mark-all-read
- PATCH /api/notifications/[notificationId]/read
- PATCH /api/notifications/[notificationId]/unread
- PATCH /api/notifications/[notificationId]/archive
- PATCH /api/notifications/[notificationId]/dismiss
- POST /api/notifications/[notificationId]/acknowledge
- GET/PATCH /api/notifications/preferences
- GET /api/notifications/unread-count

Governance APIs:

- POST /api/notifications
- GET/POST /api/notifications/templates
- PATCH /api/notifications/templates/[templateId]
- GET/PATCH /api/notifications/settings
- GET /api/notifications/reports
- POST /api/notifications/[notificationId]/cancel
- POST /api/notifications/outbox/retry

Mutation routes enforce same-origin requests and validate unknown request bodies with strict Zod schemas.

## Permissions

School users receive only their own centre and preferences:

- notifications.access
- notifications.view_own
- notifications.mark_read
- notifications.mark_unread
- notifications.archive_own
- notifications.acknowledge
- notifications.preference.manage_own

Principals and compatible legacy school-governance aliases receive explicit create, publish, schedule, cancel, critical, template, settings, report, administration, and retry permissions. Platform Administrator authentication remains separate and receives no tenant permissions through the legacy ADMINISTRATOR school-role alias.

Institution- or tenant-wide publication requires broad server-side role scope and access to every relevant active branch. Teacher, Staff, and Office Staff roles cannot gain publication or settings authority from frontend visibility.

## Security Rules

- Recipient queries always include tenantId and the authenticated userId.
- Management queries are constrained to the authenticated tenant and, for institution-scoped principals, their institution.
- User and role audiences are rechecked against active tenant role assignments and branch/institution scope.
- External, protocol-relative, backslash, and non-allow-listed links are rejected.
- Notification text is plain, length-bounded content; HTML markup is removed.
- Required-acknowledgement items cannot be archived or dismissed before acknowledgement.
- Mandatory categories cannot be disabled through user preferences.
- Outbox errors redact passwords, tokens, secrets, authorization values, cookies, and database URLs.
- Raw provider secrets, passwords, tokens, stack traces, and database errors are not exposed in responses or audit metadata.
- New notification support tables have RLS enabled with no browser-direct policies; application access remains through server-side Prisma and RBAC.
- Critical lifecycle and governance actions are audited.

## Feature Controls

Tenant settings provide fail-safe controls for the core, scheduling, acknowledgements, realtime, and browser push. Realtime and browser push default to disabled. GradeBook-sourced events also require the existing GradeBook tenant flag.

Institution policy can disable generation for its scope and define default priority, mandatory categories, time zone, quiet hours, and retention days. Disabling generation cancels pending processing for that feature scope without deleting historical records.

## Preferences and Current Delivery Semantics

Preferences support category enablement, minimum priority, quiet hours, time zone, and immediate/daily/weekly digest selection. Mandatory account, security, and system notifications remain enabled.

The current release always presents eligible records in the in-app centre when processed. Quiet-hour and digest values are retained for a future active-alert or digest worker; the UI does not falsely claim that a digest was sent.

## Template Governance

Templates are tenant- or institution-scoped and versioned. Updating a template creates a new version and retires the prior active version. Required variables must be declared, all placeholders must be syntactically valid, and deep-link templates must resolve to allow-listed internal routes.

The internal queueTemplatedInAppNotificationEvent contract resolves the active institution template first, then the tenant template, validates variables, links the exact template version, and queues the event with an idempotency key.

## Integration

Staff Leave is the first active producer. Submission, modification, clarification, approval/rejection, withdrawal, and approved-leave cancellation queue tenant- and branch-scoped in-app events inside the existing transactional workflow. Existing attendance WhatsApp notification infrastructure remains independent and is not changed or represented as in-app delivery.

## Operations and Deferred Work

Completed database-backed release gates:

1. Protected backup and isolated restore rehearsal passed. Secret-free evidence: `jinacampus-main-backup-20260818T140042Z.dump.sha256.json`.
2. `prisma migrate deploy` applied `20260818210000_add_in_app_notification_core`; migration status reports all 25 migrations applied.
3. Legacy backfill, indexes, foreign keys, RLS state, notification permissions, feature defaults, and migration history passed catalog verification.
4. Authenticated Chrome browser QA passed for Principal, Office Staff, Teacher, and Staff on an isolated synthetic database. A separate isolated restore of the approved production baseline was upgraded through the committed migration before this role-matrix run.
5. Cross-tenant explicit-user publication, unauthorised management, cross-user access, direct-route, and client-supplied tenant-scope attempts were denied server-side.
6. Publication idempotency, outbox completion, acknowledgement/read/unread/archive lifecycle, preference updates, aggregate reporting, and audit records passed.
7. Public browser/API output and server logs contained no password hash, token hash, database URL, Prisma internal error, stack trace, or HTTP 500 response.

The current processor supports immediate and due-item bounded processing. Active digest scheduling, quiet-hour suppression, realtime transport, browser push, and hard-retention deletion are intentionally outside this release.

Deferred:

- Email, WhatsApp, SMS, native push, and browser push delivery
- Realtime transport
- Active quiet-hour suppression and daily/weekly digest workers
- Hard-delete retention cleanup pending an approved records-retention policy
- Producers beyond the currently integrated Staff Leave workflow
- Parent and student portal delivery until those account roles and portal policies are approved

These deferred capabilities must not be shown as operational or reported as delivered.