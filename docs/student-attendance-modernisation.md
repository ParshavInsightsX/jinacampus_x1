# Student Attendance Modernisation

## Status

Implementation date: 2026-08-24

Current status: Phase 1 is implemented. Isolated PostgreSQL 17 migration, role, scope, desktop, and mobile-viewport QA passed. The approved additive migration was subsequently applied to the primary Supabase database after a protected backup and isolated restore rehearsal, and a controlled synthetic Principal marking/correction smoke passed through the local application. Source publication and Vercel deployment were not performed. Physical Android and iOS browser QA remains pending.

## Implemented Scope

The attendance-marking route now uses an online, session-based workflow designed for short, repeatable classroom operation:

1. Select the class-section and attendance date.
2. Open or resume the attendance session.
3. Mark student exceptions as `Absent` or `Leave`.
4. Select **Mark Remaining Present** to mark only unmarked students.
5. Review the live totals and finish attendance.

Teachers see only the three approved daily choices: `Present`, `Absent`, and `Leave`. Existing historical `Late` and `Half Day` records remain intact and appear as present on this simplified marking surface. Existing reports and corrections continue to use the legacy attendance projection.

## User Experience

- Mobile-first student cards replace the dense marking table.
- Search supports student name, scholar number, and roll number.
- Filters cover All, Unmarked, Absent, and Leave.
- Each change shows Saving, Saved, or Not saved state.
- The progress summary updates immediately after a selection.
- **Mark Remaining Present** never overwrites an existing exception.
- The most recent eligible bulk action can be undone through a server-validated operation.
- **Finish Attendance** requires explicit confirmation and rejects incomplete sessions.
- Completed and locked sessions are read-only for normal marking.
- Users with both the correction permission and institution entitlement can open a reason-required correction control; the server derives the compatibility attendance record instead of accepting its ID from the browser.
- Sticky actions account for mobile safe areas and retain 44-pixel touch targets.

## Data Model

The additive migration introduces:

- `StudentAttendanceSession`: one full-day session per tenant, academic year, class-section, and date.
- `StudentAttendanceSessionRoster`: a frozen roster snapshot for the session.
- `StudentAttendanceSessionEntry`: the current captured status and record version for each roster member.
- `StudentAttendanceMutation`: an immutable idempotency and change ledger for individual, bulk, and undo operations.

The existing `StudentAttendanceRecord` remains the operational compatibility projection. Session mutations update that projection transactionally so existing dashboards, reports, notification workflows, and attendance locks continue to operate without a destructive migration.

## Security And Integrity

Every operation resolves the tenant, institution, branch, academic year, actor, role permissions, and class assignment from the authenticated server context. Browser input cannot supply those security claims.

Server-side controls include:

- Attendance subscription entitlement checks.
- Explicit read/write permission checks.
- Teacher class-assignment enforcement, with separately permitted correction access.
- Active branch and academic-year validation.
- Holiday and non-working-day checks.
- Attendance cutoff and lock checks.
- Tenant-scoped database reads and writes.
- Serializable transactions for multi-step mutations.
- Client mutation IDs for retry-safe idempotency.
- Entry and session versions for conflict detection.
- Frozen roster membership validation.
- Audit events for open, save, bulk mark, undo, completion, and authorised correction.
- No client-provided attendance projection IDs, tenant IDs, branch IDs, user IDs, or roles.

## Isolated Database And Browser QA

QA date: 2026-08-24

The approved target was a disposable PostgreSQL 17 database bound to loopback only. Generated QA credentials stayed in ignored local files and no deployment database, production tenant, or real user record was accessed.

Migration verification:

- Applied the 28 pre-existing migrations first, confirmed `20260824120000_modernize_student_attendance_phase_1` was the only pending migration, and then applied it.
- Found and corrected migration drift in the new tables: Prisma-managed UUID defaults were not represented correctly and 20 foreign-key names did not match the Prisma schema.
- Recreated the disposable database and reran the complete migration history after the correction.
- `prisma migrate status` reported the schema current and `prisma migrate diff` reported no difference.
- Verified four new tables with row-level security enabled, 20 foreign keys, 12 unique constraints or unique indexes, and 21 indexes.

Synthetic fixtures covered two tenants, two branches in the primary tenant, current and previous academic years, Principal, assigned Teacher, unassigned Teacher, independent-tenant Principal, class teacher assignment, classes, sections, students, and active enrollments.

| Scenario | Result | Evidence |
| --- | --- | --- |
| Principal, desktop 1280x900 | Pass | Opened a current-year class, marked one student Absent, marked the remainder Present, and completed attendance. |
| Assigned Teacher, mobile 390x844 | Pass | Saw only the assigned current-year class, marked one student Leave, marked the remainder Present, completed attendance, and retained 44-pixel visible actions without horizontal overflow. |
| Unassigned Teacher, mobile 360x800 | Pass | Received a safe no-classes state and no student roster was exposed. |
| Cross-branch | Pass | Direct service access to the other branch was denied; an inaccessible branch cookie was ignored and only the assigned main-branch class remained visible. |
| Cross-year | Pass | Direct service access to the previous-year class was denied and that class was absent from the assigned Teacher selector. |
| Cross-tenant | Pass | Direct service access was denied; an independently authenticated Principal saw only the second tenant's class and students. |
| Audit and projection | Pass | Six compatibility attendance records, six immutable mutations, and eight attendance audit events were written; forbidden scope attempts created no sessions. |
| Safe browser output | Pass | No browser errors or credential, hash, database URL, Prisma, stack, or internal-path output was detected. |

Automated screenshots were visually reviewed for the Principal desktop flow and both Teacher mobile states. Physical Android Chrome and iOS Safari testing was not part of this isolated browser run and remains a separate device gate.

## Production Migration And Controlled Smoke QA

QA date: 2026-08-24

The approved primary Supabase database was verified before every migration and QA helper. A protected read-only `public`-schema backup passed an isolated, network-disabled PostgreSQL 17 restore rehearsal before the production migration. Secret-free recovery evidence: `jinacampus-main-backup-20260824T080740Z.dump.sha256.json`; SHA-256 `fcec8d264ddb4aad7541bfdd9332cfbf58b422654f73b69ba0d71d1a1368beb8`.

Migration evidence:

- Applied only `20260824120000_modernize_student_attendance_phase_1`.
- Migration SQL SHA-256: `e85ccc84eb2efedff9e4b246cae1ffc55915af9e24addb7cc62ba6ee3f5965ab`.
- Post-migration status reported all 29 committed migrations applied.
- Verified four new tables, four enums, 20 foreign keys, 21 indexes, row-level security on each new table, no invalid indexes, and no failed migration record.

Controlled browser smoke used a temporary, synthetic Principal account in the JinaCampus institution only. No RDA school record was selected or changed.

| Scenario | Result | Evidence |
| --- | --- | --- |
| Principal marking | Pass | Opened one active synthetic class on `2027-04-01`, marked the remaining student Present, and completed the session. |
| Required correction reason | Pass | An empty reason was rejected with a clear accessible validation message before any server mutation. |
| Principal correction | Pass | Corrected the synthetic record to Excused; the compatibility record and modern session projection synchronized. |
| Audit and idempotency ledger | Pass | Exactly one committed `ADMIN_CORRECTION` mutation and one `academia.student_attendance.corrected` audit event were recorded. |
| Hosted-database transaction | Pass after focused repair | The first correction exposed Prisma's default interactive-transaction timeout. The correction transaction now uses the established 10-second acquisition and 60-second execution limits; focused service/UI tests passed. |
| Tenant boundary | Pass | No cross-tenant record or audit mutation occurred, and RDA had zero attendance records on the synthetic QA date. |
| Clean browser profile | Pass | Chrome ran with extensions disabled; no runtime errors, injected form attributes, horizontal overflow, or sensitive output appeared. |
| Temporary-account cleanup | Pass | The QA account was deactivated, role and branch access disabled, sessions revoked, credential replaced with an unusable random hash, and cleanup audited. |

Browser evidence is retained only in the ignored local QA directory. No password, session token, database URL, internal identifier, or private backup path is included in this document or its screenshots.

## Remaining Release Requirements

1. Review and publish the focused attendance source changes through the approved release process.
2. Deploy the reviewed application version and rerun a short authenticated marking/correction smoke against the deployed route.
3. Verify the mobile workflow on supported physical Android and iOS browsers.
4. Continue monitoring hosted-database latency and attendance audit integrity after deployment.

## Deferred Phases

The following items are intentionally not part of the Phase 1 implementation:

- IndexedDB offline capture and queued synchronization.
- Service-worker attendance synchronization.
- Cross-device offline conflict resolution UX.
- Student profile-photo capture or attendance photo storage.
- Approved student-leave prefill and leave-verification flags until a governed student-leave source exists.
- Advanced review, approval, reopening, and period-lock governance.
- Automatic attendance finalisation.
- Asynchronous large attendance exports.

These require separate architecture, privacy, retention, browser/device, and operational release gates. The online workflow must remain available and reliable independently of those future phases.
