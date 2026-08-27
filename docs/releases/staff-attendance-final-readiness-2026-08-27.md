# Staff Attendance Final Release Readiness Package

## Release Decision

- Evidence date: 2026-08-27
- Scope: Staff Attendance navigation, personal Attendance QR, continuous supervised scanner, register scope, and release controls
- Code state: release candidate
- Database state: all 32 committed migrations applied on the configured primary database; verified read-only with Prisma
- Production write mutation in this pass: none; a read-only logical backup and isolated restore rehearsal completed successfully
- Commit, push, environment change, and deployment in this pass: none
- Final readiness: **blocked on supervised physical Android/iOS/PWA camera certification, or an explicit release-owner acceptance of that documented device limitation**

The authenticated database and browser gates passed in an isolated loopback-only PostgreSQL 17 environment. The embedded visual browser was unavailable, so no screenshot-based or embedded-browser visual QA is claimed.

## Gate Summary

| Gate | Result | Evidence |
| --- | --- | --- |
| Production target identification | Pass, read-only | Environment target classified without printing credentials; Prisma reported 32 migrations and an up-to-date schema |
| Migration history on isolated PostgreSQL 17 | Pass | All 32 committed migrations applied in order |
| Prisma schema drift | Pass after mapping correction | Prisma migrate diff reported no difference |
| DB-backed service role/scope matrix | Pass | Principal, Office Staff, Teacher, Staff, second tenant, second branch, and sibling institution fixtures |
| Authenticated browser matrix | Pass | Chrome 151 engine, desktop and 390 x 844 mobile emulation, 24 checks |
| Embedded screenshot/visual QA | Not performed | Embedded browser sandbox was unavailable |
| Android Chrome HTTPS camera | Blocked | ADB found no attached or authorised Android device |
| iPhone/iPad Safari HTTPS camera | Blocked | No iOS device bridge or Safari inspection path was available |
| Installed PWA camera | Blocked | Requires the physical Android/iOS devices |
| Fresh production backup/restore evidence | Pass | Protected `public`-schema logical backup and network-isolated PostgreSQL 17 restore completed on 2026-08-27; all 32 migrations, 132 public tables, 475 foreign keys, indexes, and constraints passed validation |

## Migration Review And Sequence

No new migration is introduced by this Staff Attendance update. The current branch contains 32 committed migrations, and read-only production Prisma migrate status reported the configured database as up to date.

The complete history was applied to a clean disposable PostgreSQL 17 database. A schema comparison initially identified only six foreign-key name differences caused by PostgreSQL's 63-character identifier truncation in the attendance-continuity migration. Explicit Prisma relation map values were aligned with the already-created database constraint names. This is a schema-client mapping correction, not a database mutation. A second drift comparison returned no difference.

## Fresh Recovery Evidence

- Evidence reference: `jinacampus-main-backup-20260827T100610Z.dump.sha256.json`
- Scope: read-only PostgreSQL `public` schema logical backup
- Backup completed: 2026-08-27 10:07:00 UTC
- Isolated restore completed: 2026-08-27 10:07:13 UTC
- Restore environment: pinned PostgreSQL 17 container with networking disabled
- Validation: 32 completed migrations, zero failed migrations, 132 public tables, 475 foreign keys, zero invalid indexes, and zero unvalidated constraints
- Storage objects: not included and not changed by this source-only release
- Handling: backup and manifest remain outside the repository under restrictive filesystem ACLs; no credential or connection string is recorded here

Controlled final sequence:

1. Record a fresh production backup and complete the approved restore/readiness check.
2. Verify the target project reference and database host without printing the URL or credentials.
3. Run npx prisma migrate status through DIRECT_URL.
4. Stop if any migration is unexpectedly pending. Review and approve it separately before execution.
5. If status remains up to date, do not run a no-op migration as a substitute for approval evidence.
6. Validate production environment variable names and feature/permission configuration without reading secret values.
7. Review and stage only the intended source and documentation files.
8. Obtain separate code publication and deployment approval.
9. Deploy the reviewed build.
10. Run the post-deployment smoke checklist in this document.

## Isolated Database QA

Environment:

- PostgreSQL 17 disposable container
- Loopback binding only
- Synthetic QA database and non-production credentials
- Two synthetic tenants
- Primary institution with two branches
- Sibling institution in the same tenant
- Principal, Office Staff, Teacher, and Staff accounts
- Synthetic staff profiles, policies, schedules, credentials, attendance, audit, and outbox data

Service checks passed:

| Area | Result |
| --- | --- |
| QR check-in and check-out | Pass |
| Idempotent retry | Pass |
| Third/duplicate attendance rejection | Pass |
| Wrong-branch QR rejection | Pass |
| Cross-tenant QR rejection | Pass |
| Invalid QR rejection | Pass |
| Teacher and Staff scanner denial | Pass |
| Office Staff cross-branch denial | Pass |
| Office Staff credential-management denial | Pass |
| Same-tenant cross-institution scanner denial | Pass |
| Manual attendance approval | Pass |
| Own correction request scope | Pass |
| Staff self-service record scope | Pass |
| Personal Attendance QR polling scope | Pass |
| Cross-tenant record denial | Pass |
| Audit and notification-outbox creation | Pass |
| Sensitive audit-output scan | Pass |

## Authenticated Browser QA

The browser run used the local application against the disposable database. Raw QR values existed only in process memory for immediate submission, travelled through an opaque `FormData` Server Action argument, and were not printed, committed, or included in documentation.

Passed checks:

- Invalid password returned the safe login message.
- Principal opened Staff QR Cards and the supervised scanner.
- Principal was denied staff self-card access.
- Principal could use the authorised second branch in the active institution.
- Same-tenant sibling-institution direct access was denied.
- Teacher and Staff were denied supervised-scanner access.
- Teacher and Staff could view only their own Attendance QR and attendance state.
- Personal Attendance QR pages exposed no print or download controls.
- Office Staff was denied credential management and unauthorised branch access.
- Office Staff opened the scanner at 390 x 844 without page-level horizontal overflow.
- Manual fallback recorded browser check-in and check-out through the same server validation path.
- The scanner automatically rearmed between attendance submissions.
- Wrong-branch and cross-tenant QR payloads were rejected safely.
- The personal QR view reflected the completed attendance state.
- Cross-tenant direct route access was denied.
- No hydration, uncaught runtime, Prisma client, token-hash, or password-hash browser error was accepted by the runner.

Headless Chromium exposed a documented fail-safe camera state and retained manual fallback. This validates error handling only; it does not certify a physical camera or QR decode path.

## Confirmed Issues Resolved

1. **Automatic camera remained Idle in React development Strict Mode.**
   The first effect cleanup cancelled the auto-start timer while a one-shot ref prevented the second effect pass. The brittle ref gate was removed so the active effect schedules camera startup and still cancels cleanly on teardown.

2. **Staff Attendance branch options were not explicitly institution-scoped.**
   Register, report, scanner, and QR branch queries now constrain results to the active institution in addition to tenant and accessible branch IDs. Direct forbidden register URLs render the existing safe permission state.

3. **Prisma reported naming-only drift for long attendance-continuity foreign keys.**
   Relation mappings now use the exact PostgreSQL-truncated constraint names. No table, column, index, or constraint was changed.

4. **Next.js development tracing exposed raw supervised QR action arguments.**
   The sensitive scan submission now crosses the Server Action boundary as `FormData` and is reconstructed for the existing Zod schema on the server. The repeated authenticated browser run passed all 24 checks, and the new server trace rendered the scan argument as `{}` without raw QR or token content.

## Physical Device Certification

No physical-device pass is claimed.

| Required check | Android Chrome | iPhone Safari | iPad Safari | Installed PWA |
| --- | --- | --- | --- | --- |
| Approved HTTPS load and login | Blocked | Blocked | Blocked | Blocked |
| First camera permission | Blocked | Blocked | Blocked | Blocked |
| Previously granted permission | Blocked | Blocked | Blocked | Blocked |
| Automatic camera activation | Blocked | Blocked | Blocked | Blocked |
| Preferred front camera and switching | Blocked | Blocked | Blocked | Blocked |
| Live QR detection | Blocked | Blocked | Blocked | Blocked |
| Check-in and check-out | Blocked | Blocked | Blocked | Blocked |
| Consecutive scan rearm | Blocked | Blocked | Blocked | Blocked |
| QR held in frame | Blocked | Blocked | Blocked | Blocked |
| Permission denied and retry | Blocked | Blocked | Blocked | Blocked |
| Camera unavailable and recovery | Blocked | Blocked | Blocked | Blocked |
| Background/resume and route leave | Blocked | Blocked | Blocked | Blocked |
| Logout and camera cleanup | Blocked | Blocked | Blocked | Blocked |

Execution prerequisites:

- Attach and authorise a physical Android device so it appears in adb devices.
- Provide a supervised iPhone and iPad Safari test path.
- Use the approved HTTPS deployment; do not use a LAN HTTP address.
- Test normal browser mode before installed PWA mode.
- Use synthetic or explicitly approved attendance records and QR cards.
- Do not retain screenshots containing QR payloads, credentials, private URLs, or personal data.

## Production Environment Checklist

Verify presence, environment scope, and consistency without printing values:

- DATABASE_URL uses the approved pooled runtime connection.
- DIRECT_URL uses the approved direct migration connection.
- APP_URL is the approved HTTPS origin.
- WEBAUTHN_ORIGIN and WEBAUTHN_RP_ID match the deployed origin where passkeys are enabled.
- SESSION_SECRET and PASSWORD_PEPPER are populated server-side.
- SESSION_COOKIE_NAME and SESSION_TTL_DAYS match the approved session policy.
- SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY remain server-only where private identity-card storage is enabled.
- STAFF_PROFILE_PHOTOS_BUCKET and STAFF_PROFILE_PHOTO_MAX_BYTES match the approved private bucket.
- Development demo seed and credential-reset switches remain disabled.
- No QR payload, password, token hash, bearer token, or private database URL is client-exposed.

Required response headers:

- Permissions-Policy permits camera for self and disables microphone.
- Content security and frame policy do not place the scanner in an unapproved iframe.
- HTTPS remains enforced at the deployment edge.

## Feature And Permission Configuration

The target institution must have the Attendance module and required features enabled server-side. Relevant entitlement keys are:

- module
- student_attendance
- staff_attendance
- marking
- correction
- qr
- reports
- exception_management
- calendar_leave_integration
- settings
- approval_audit

Role permissions remain independent from institution entitlements:

- Principal may manage credentials, scan, review the register, correct, report, and approve according to assigned permissions.
- Office Staff may scan and operate branch attendance only where explicitly permitted.
- Teacher and Staff may view only their own Attendance QR/history and request permitted corrections.
- Teacher and Staff do not receive supervised scanner or credential-management permission by default.
- Navigation filtering is usability only; every query and mutation must continue to enforce permission, tenant, institution, branch, and entitlement scope on the server.

## Rollback Procedure

Application rollback:

1. Keep the additive production schema in place.
2. Roll back to the previous verified application deployment.
3. Confirm login, dashboard, StaffBoard, Academia, and attendance routes.
4. Disable the affected Attendance entitlement for a target institution if containment is required.
5. Do not restore legacy staff self-scan permission as part of an application rollback.

Database recovery:

1. No database rollback is expected for this source-only update.
2. If an unexpected pending migration appears, stop and obtain separate migration approval.
3. A destructive production restore requires separate explicit authorisation.
4. Restore first to an isolated PostgreSQL 17 target and verify checksum, migration ledger, constraints, indexes, tenant counts, and critical workflow records.
5. Record the backup reference, restore evidence, recovery point, and responsible operator.

Operational containment:

- Revoke or expire active supervised scan sessions if scanner behavior is unsafe.
- Disable QR Attendance entitlement for the affected institution without deleting attendance history.
- Preserve audit logs, attendance events, credentials, and records.
- Never expose or rotate raw Attendance QR values as a rollback shortcut.

## Post-Deployment Smoke Checklist

Unauthenticated:

- Login route loads over HTTPS.
- Administrator login route loads.
- Protected attendance routes redirect safely.
- Health endpoint reports the expected application/database state without secrets.

Principal:

- Login reaches the Principal dashboard.
- Staff QR Cards opens only with credential-management permission.
- Supervised scanner opens and shows a visible camera or safe recovery state.
- Register and reports show only active-institution branches.
- A sibling-institution or inaccessible branch URL returns the permission state.

Office Staff:

- Login reaches the approved workspace.
- Scanner opens only where scan permission and QR entitlement are active.
- Credential management is denied.
- Cross-branch direct access is denied.

Teacher and Staff:

- Role-aware login reaches the approved attendance/teaching workspace.
- Supervised scanner is denied.
- Personal Attendance QR shows only the signed-in staff record.
- Print and download are unavailable.
- Attendance History is self-scoped.

Attendance:

- Check-in succeeds once.
- Check-out succeeds once.
- Scanner rearms for the next QR.
- Duplicate, wrong-branch, invalid, and cross-tenant QR submissions fail safely.
- Result card shows staff identity, employee code, branch, status, and action without raw QR content.
- Audit and attendance-event records are created.

Runtime:

- No P2021/P2022 schema errors.
- No hydration mismatch.
- No unhandled browser exception.
- No database connection-pool exhaustion.
- No token hash, raw QR, password hash, database URL, or stack trace in user-facing output.

## Separate Approval Gates

The following remain independent:

1. Fresh production backup and recovery evidence.
2. Production migration approval, only if a migration is actually pending.
3. Production environment/configuration change approval.
4. Release commit and remote push approval.
5. Production deployment approval.
6. Physical-device camera certification acceptance.

Passing the isolated database and browser matrix does not authorise any production action. Production deployment should remain paused until the physical-device result and fresh recovery evidence are recorded or an authorised release owner explicitly accepts the device limitation as a documented release exception.
