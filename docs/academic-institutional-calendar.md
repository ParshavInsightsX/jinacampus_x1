# Academic and Institutional Calendar

## Purpose

The CampusCore calendar configures institution holidays and non-working days without creating false student absences or reducing staff attendance benefits. Calendar authority is server-side and remains tenant, institution, branch, and academic-year scoped.

Route: `/campus-core/calendar`

Permission: `campuscore.calendar.manage`

The default Principal role receives this permission. Teacher and Staff roles do not. Navigation filtering is for usability only; every query and mutation still validates the authenticated tenant context, branch access, academic year, and permission.

## Calendar Model

Each entry contains:

- institution and optional branch scope
- academic year
- `HOLIDAY` or `NON_WORKING_DAY`
- inclusive start and end dates
- name and optional description
- one or more audiences: Students, Teaching Staff, Non-teaching Staff
- `ACTIVE` or `CANCELLED` lifecycle state
- creator/updater identifiers and timestamps
- cancellation reason and timestamp when cancelled

An empty branch means every active branch in the institution. Creating, updating, or cancelling an all-branch entry requires the actor to have access to every active branch in that institution.

## Validation and Conflict Rules

- Client-supplied tenant, actor, staff identity, role, permission, and attendance status fields are rejected.
- Dates must be inside the selected academic year.
- Active entries cannot overlap when institution, branch scope, date range, and at least one audience overlap.
- A student-audience entry cannot be added over existing student attendance.
- A staff-audience entry cannot be added over pending, clarification-required, or approved leave.
- Real staff attendance, QR activity, corrected records, and leave-managed rows are never overwritten.
- Existing safe `ABSENT`, `NOT_MARKED`, or calendar `HOLIDAY` placeholders may be converted to a calendar-managed paid holiday.

Calendar deletion is implemented as audited soft cancellation. Generated staff holiday rows are released to `NOT_MARKED`; an authorised user must review historical attendance if a past holiday is cancelled.

## Student Attendance

Student holidays do not generate `StudentAttendanceRecord` rows. They are therefore excluded from marked-day denominators and attendance percentages.

On an applicable date:

- daily attendance marking and correction are blocked safely
- the marking screen explains that attendance is not required
- class-section not-marked reports return no false pending rows
- dashboard eligible-class and marking-rate calculations exclude the holiday scope

Existing student attendance blocks a retroactive calendar change to avoid silently rewriting history.

## Staff Attendance and Leave

Applicable active staff receive one `StaffAttendanceRecord` per holiday date with:

- status `HOLIDAY`
- the relevant academic year and branch
- a link to the calendar entry
- no check-in, check-out, or working-minute values

Teaching and non-teaching audiences are evaluated independently. New staff profiles are reconciled with applicable calendar entries from their joining date. Relevant future records are reconciled when branch, staff type, joining date, or employment status changes.

Calendar-managed rows cannot be overwritten by QR scanning or manual attendance correction. Approved leave excludes calendar holidays from leave-day and balance calculations, and leave approval does not replace paid holiday rows.

Existing staff attendance reports already treat `HOLIDAY` as a non-working day. Payroll and salary calculation remain out of scope; any future payroll implementation must treat calendar `HOLIDAY` rows as paid non-working time.

## Audit and Data Protection

Create, update, and cancellation actions write:

- tenant, branch where applicable, and academic-year context
- actor user
- entity ID and action
- before/after snapshots
- safe synchronization counts and cancellation metadata
- timestamp through the shared audit logger

The audit payload does not contain passwords, session secrets, QR tokens, token hashes, or client authority claims.

The database migration enables row-level security on the new hosted PostgreSQL table. Application authorization remains mandatory and is not delegated to UI visibility or RLS alone.

## Deployment

Migration:

`prisma/migrations/20260809120000_add_academic_calendar/migration.sql`

Apply it through the approved deployment process before enabling the route in a deployed environment:

```powershell
npx prisma migrate deploy
npx prisma generate
```

Do not run a destructive reset against pilot or production data.

### Deployment verification - 10 August 2026

- `prisma migrate deploy` applied `20260809120000_add_academic_calendar` to the approved deployment database; all 17 migrations are applied.
- DB-backed browser QA used a temporary, isolated schema in the same managed PostgreSQL database because the public school record did not contain suitable disposable attendance fixtures.
- The isolated schema received the production migration chain and synthetic demo fixtures, and was removed after QA. No synthetic tenant, attendance, leave, QR, or calendar record was written to the public schema.
- Principal branch-scoped create, read, update, and soft cancellation passed. An inaccessible branch and institution-wide scope were both denied server-side.
- Teacher and Staff calendar governance access returned the shared safe error state and exposed no management form.
- Student marking was blocked on the active holiday; dashboard classes-not-marked was zero; student reports returned no false pending class-section.
- Staff QR generation passed, a valid scan was rejected as attendance-not-required on the paid holiday, and My Attendance displayed the holiday state.
- A two-date staff leave application spanning one holiday calculated one working leave day. Principal approval preserved the holiday row and created `ON_LEAVE` only for the working date.
- Staff reports showed holiday and leave states. Calendar cancellation released calendar-managed rows to `NOT_MARKED`, retained the working-date leave row, and restored student marking.
- Exactly one create, update, and cancellation audit event was written. Audit assertions found no password, password hash, token hash, QR payload, or session-secret fields.

Production deployment smoke:

- The verified working tree was deployed to the linked Vercel production project and aliased to the public JinaCampus URL.
- `/api/health` returned HTTP 200 with the deployment database connected. The school and Administrator login surfaces returned HTTP 200.
- An unauthenticated request to `/campus-core/calendar` returned a temporary redirect to the public sign-in surface and did not render calendar content.
- Vercel reported no runtime errors for the health, login, Administrator login, or calendar smoke routes after deployment.
- No authenticated mutation smoke was run against the public tenant because it has no approved disposable academic fixtures. The isolated deployment-database browser pass above remains the authenticated release evidence.

## DB-Backed QA Checklist

- Principal can create a branch holiday and an authorised all-branch holiday.
- A partial-branch actor can view an applicable institution-wide entry but cannot modify it.
- Teacher and Staff users cannot access calendar governance.
- Cross-tenant institution, branch, academic-year, and entry IDs return safe denial/not-found responses.
- Overlapping audience/date scope is rejected.
- Dates outside the academic year are rejected.
- Student attendance submission/correction is blocked on a student holiday.
- Holiday classes do not appear as not marked and do not lower percentages.
- Teaching and non-teaching staff receive only their applicable paid holiday rows.
- QR scan, manual correction, and leave approval cannot overwrite a calendar-managed row.
- Leave totals exclude applicable holiday dates.
- Update re-synchronizes safe generated rows without duplicates.
- Cancellation preserves history and releases generated rows safely.
- Create, update, and cancellation audit records contain no sensitive data.

## Deferred Work

- recurring holiday rules and external calendar imports
- public holiday catalogue suggestions by state or board
- parent/student portal calendar views
- payroll and salary integration
- calendar notifications and reminders
- native mobile calendar management
