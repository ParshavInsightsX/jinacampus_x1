# Hybrid Staff Attendance Rebuild

## Status

- Status date: 2026-08-26
- Delivery state: supervised operator scanning, personal Staff Cards, and selected approval controls implemented locally; shared/self-scan retired
- Production state: not enabled and not migrated by this task
- Database evidence: the additive migrations completed successfully against a disposable PostgreSQL 17 database with no schema drift; the disposable database was removed
- Browser evidence: earlier hybrid-flow QA is historical; authenticated DB-backed card, print, operator, and denial QA for this update remains pending
- Physical-device evidence: approved-HTTPS Android Chrome and iOS Safari scanner QA remains pending

No password, raw QR credential, token hash, private URL, connection string, or production record is documented here.

## Product Model

Staff Attendance is a StaffBoard bounded context. It uses one event-led model for supervised QR attendance and controlled manual exceptions:

1. An authorised operator opens a branch-bound scanner session.
2. The operator scans the staff member's opaque Staff QR Card.
3. The server resolves tenant, institution, branch, operator, staff identity, credential, schedule, policy, calendar, and leave state.
4. A server-timestamped attendance event is appended inside a transaction.
5. The daily Attendance Register projection is recalculated from the event outcome.
6. An audit record and transactional outbox record are written without blocking attendance on external communication systems.

The daily projection is a read model, not a replacement for the immutable event history. Corrections create separate adjustment and correction records; they do not rewrite or delete the original attendance event.

## School Terminology

User-facing labels use consistent school terminology:

- Staff Attendance
- Attendance Register
- Mark Attendance
- Check-In and Check-Out
- Present, Absent, On Leave, Late Arrival, Early Departure, Half Day
- Paid Holiday, Weekly Off, Official Duty, Incomplete Attendance
- Attendance Correction
- Daily Attendance and Monthly Attendance Report
- Staff QR Card and Supervised Scanner
- Pending Review, Approved, Rejected, and Locked

Internal enum and permission identifiers remain stable where changing them would break existing integrations or migration history. UI formatters translate those identifiers into the school-facing labels above.

## Attendance Methods

| Method | Configuration | State |
| --- | --- | --- |
| Supervised Staff QR Card | `SUPERVISED_QR` | Primary default; operator scans a permanent opaque credential |
| Legacy hybrid setting | `HYBRID` | Retired; migration converts it to `SUPERVISED_QR` |
| Manual only | `MANUAL_ONLY` | Controlled fallback; QR credential/session operations fail closed |
| Manual attendance | Separate setting and permission | Reason required; submitted through maker-checker approval |
| Staff self-scan QR | Retired | Service entry point fails closed and role assignments are removed |
| Dynamic/rotating QR | Separate future phase | Not operational |
| Offline sync/provider ingestion/facial verification | Separate future phases | Not operational |

Changing capture mode or disabling QR is enforced in server services. Navigation visibility is only a convenience and is not the security boundary.

## Routes

| Route | School-facing purpose | Server control |
| --- | --- | --- |
| `/staffboard/attendance` | Daily Attendance Register and controlled Manual Attendance | Attendance entitlement, branch scope, view/manual/request permissions |
| `/staffboard/attendance/scan` | Operator-only supervised Staff QR Card scanner | Scan permission, capture setting, entitlement, branch, and session validation |
| `/staffboard/attendance/credentials` | Issue, preview, print, reissue, revoke, and review Staff QR Cards | Principal-family role, credential-management permission, and QR entitlement |
| `/staffboard/attendance/adjustments` | Review Attendance Corrections | Adjustment-approval permission and branch scope |
| `/staffboard/attendance/card` | My Staff Card, digital view only | Own-card permission, linked staff profile, branch and institution scope |
| `/staffboard/attendance/me` | My Attendance and correction requests | Own-attendance permissions and staff linkage |
| `/staffboard/attendance/reports` | Daily and Monthly Attendance Reports | Report permission and scoped filters |
| `/staffboard/attendance/qr` | Compatibility redirect only | Routes managers to card management and staff to their own card |

## Security and Data Integrity

- Every protected service authenticates the actor and derives tenant/user context from the session.
- Branch IDs are accepted only as scoped selections and must belong to `accessibleBranchIds`; tenant, actor, role, staff identity, and attendance status are never trusted from the client.
- Staff identity remains a `StaffProfile` and is not dependent on login-account availability.
- Effective-dated `StaffBranchAssignment` records enforce branch eligibility.
- Newly issued Staff QR credentials use a server-derived opaque secret with no personal data; only its SHA-256 hash is stored. Legacy random credentials remain scan-valid.
- The payload is rendered only inside an authorised card QR symbol and is never added to logs, audit metadata, browser persistence, or readable card text.
- Reissue supersedes existing active credentials; revoke and expiry fail immediately.
- Scanner sessions are bound to tenant, institution, branch, operator, mode, and expiry.
- A tenant-scoped `clientRequestId` uniqueness rule makes retried scan submissions idempotent.
- A PostgreSQL transaction-scoped advisory lock serialises competing scans for the same staff member and attendance date.
- Server time and branch timezone determine attendance date and punctuality.
- Approved leave and institutional-calendar records are checked before conflicting attendance changes.
- The legacy direct-correction action validates input, authenticates, and then fails closed with `ATTENDANCE_CORRECTION_APPROVAL_REQUIRED`.
- An adjustment requester cannot approve their own request.
- Raw QR values, token hashes, passwords, and provider secrets are excluded from UI, action responses, outbox payloads, and audit metadata.

## Permissions

The rebuild adds stable permission keys for:

- supervised scanning
- Staff QR Card management
- manual attendance
- correction requests
- correction approval
- future attendance-period locking

Principal receives management permissions. Office Staff receives branch-scoped operator/manual/request permissions. Teacher and Staff receive own correction-request access where their role assignment permits it. All checks remain permission-based and server-side.

The attendance-period-lock permission is reserved but no lock action is exposed in this release phase. This avoids presenting an incomplete control before automatic day finalisation, unresolved-item preview, override governance, and DB-backed locking tests are complete.

## Policy and Schedule Model

The schema includes versioned, effective-dated staff attendance policies, schedules, and staff schedule assignments. The migration creates a compatibility policy and schedule from each branch's existing Attendance Settings and links existing staff assignments. Each daily projection stores its policy/schedule references and calculation version so historical attendance is not silently reinterpreted.

Advanced policy/schedule administration and automated policy-version publication are not exposed yet. Existing settings continue to provide operational compatibility; a dedicated version-publishing workflow must be completed before schools can manage multiple shifts or historical policy changes.

## Correction Workflow

1. An authorised staff member or operator submits an Attendance Correction with a category and clear reason.
2. The current record is retained as a before snapshot and marked Pending Review.
3. A different authorised approver reviews the request.
4. Rejection records the reviewer, comment, timestamp, audit event, and outbox event.
5. Approval appends a correction/status event, recalculates the daily projection, stores the after snapshot, and records the approver.
6. Leave-managed, calendar-managed, and locked records fail closed where the requested operation is not allowed.

Manual Attendance uses the same approval path, so fallback entry cannot silently bypass the event ledger.

## UI and Accessibility

The Staff Attendance workspace uses restrained 50%-tinted glass surfaces with controlled blur, solid readable foregrounds, soft shadows, and 8 px operational radii. It does not use nested decorative cards or transparency that reduces contrast.

- Mobile views use action-first cards instead of squeezed desktop tables.
- Desktop retains scan-friendly and report-friendly tables.
- Buttons and form controls use at least 44 px targets.
- Labels remain visible and keyboard controls retain focus states.
- Pending, success, warning, empty, denied, duplicate, expired, and scanner-error states use plain language.
- Tables use responsive containment and attendance cards below the desktop breakpoint.
- The scanner keeps manual fallback available and does not persist the scanned QR value.

## Migration

Additive migrations:

- `20260820182500_extend_staff_attendance_status`
- `20260820183000_rebuild_staff_attendance_hybrid`

The migrations preserve existing attendance rows, backfill branch assignments, create compatibility policies/schedules, attach calculation metadata, create ledger events for legacy records, seed permissions, and add tenant-scoped indexes and constraints. They do not drop existing Staff Attendance data.

No approved staging or production database migration was performed in this task. Apply the committed migration history only through `prisma migrate deploy` after target verification, backup/recovery evidence, and explicit database approval.

## Verification Completed

- All 28 committed Prisma migrations applied to a disposable PostgreSQL 17 database, including the two additive Hybrid Staff Attendance migrations.
- `prisma migrate status` reported the disposable database up to date, and schema comparison reported zero drift.
- Synthetic fixtures covered two tenants, two branches in the primary tenant, Principal, Office Staff, Teacher, Staff, staff profiles, branch assignments, active subscription entitlements, policies, schedules, QR credentials, and attendance records.
- The DB-backed service matrix passed supervised QR check-in/check-out, idempotent retry, duplicate rejection, manual maker-checker approval, own correction, self-history scope, wrong-branch denial, cross-tenant denial, invalid QR denial, audit logging, outbox creation, and sensitive-output checks.
- Authenticated Chromium browser QA passed all 43 assertions at desktop and mobile widths. It covered valid and invalid login, authorized routes, direct-route denials, wrong-branch denial, self-service attendance, reports, responsive containment, and browser runtime output.
- Visual inspection passed for the Principal desktop register, Office Staff mobile scanner, Teacher mobile My Attendance view, and wrong-branch denial state.
- Focused Hybrid Staff Attendance projection and security suite: 6 tests passed after the fixes.

### Confirmed Issues Fixed During QA

- Staff and Teacher users could request a correction for another staff member's record in their branch. Cross-staff requests now require `staffboard.attendance.correct`; own-record requests remain available through the request permission.
- PostgreSQL advisory-lock execution used a result-returning Prisma API even though `pg_advisory_xact_lock` returns `void`. It now uses `$executeRaw`, preserving transaction serialization without result deserialization.
- Wrong-branch register access and Teacher/Staff report access reached the generic 500 boundary. Both now render the explicit safe permission state before protected queries run.
- Next.js 16.2.12 Turbopack development mode returned framework 404 responses for registered nested attendance routes in this workspace. The local `npm run dev` command now uses the webpack dev compiler; the production build command is unchanged.

## Remaining Release Gates

The following are not represented as complete:

- Revoked-card, scan-session expiry, and concurrent competing-scan certification at expected production load.
- Real-device Android Chrome and iOS Safari camera QA over an approved HTTPS URL.
- Browser compatibility checks beyond the local Chromium desktop/mobile emulation pass.
- Automatic daily finalisation and reconciliation jobs.
- Attendance-period preview, locking, privileged override, and locked-period browser QA.
- Advanced multi-shift policy/schedule publishing UI.
- Large-report asynchronous export processing.
- Rate-limit and invalid-credential monitoring certification.
- Backup/restore evidence covering the new attendance entities in any future deployment target.

## Recommended Next Task

Apply the additive migrations to an approved shared non-production deployment environment only after target and recovery verification, then repeat the authenticated role matrix there. Run approved-HTTPS Android Chrome and iOS Safari scanner QA with physical devices before requesting any further deployment progression. Automatic finalisation, period locking, advanced policy publishing, asynchronous large exports, and operational rate-limit monitoring remain later controlled phases.
