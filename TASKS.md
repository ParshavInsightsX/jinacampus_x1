# TASKS.md — JinaCampus First Development Task Plan

## Operating Rule
Codex must follow these tasks in order unless the user explicitly changes priority.

Do not jump to later modules before completing the foundation tasks they depend on.

Each completed task must include:

- Files changed
- Key decisions made
- Commands run
- Test/check result
- Known follow-ups

## Phase 0 — Repository Discovery and Setup

### 0.1 Inspect Existing Repository
- [ ] Identify package manager.
- [ ] Identify Next.js version and App Router structure.
- [ ] Identify TypeScript config.
- [ ] Identify Prisma setup.
- [ ] Identify auth setup, if any.
- [ ] Identify existing UI/component system.
- [ ] Identify test/lint/typecheck/build commands.

Acceptance criteria:

- Codex reports actual repo structure before changing files.
- Codex does not overwrite existing architecture blindly.

### 0.2 Create/Confirm Base Folder Structure
Create or align to this structure:

```txt
src/app
src/components
src/components/ui
src/modules/campus-core
src/modules/academia
src/modules/staffboard-lite
src/lib/auth
src/lib/rbac
src/lib/tenant
src/lib/audit
src/lib/db
src/lib/errors
src/lib/pagination
src/lib/dates
prisma
```

Acceptance criteria:

- Module boundaries are clear.
- Shared utilities are not duplicated inside modules.

## Phase 1 — CampusCore Foundation

### 1.1 Prisma CampusCore Schema
Create/extend Prisma schema for:

- [ ] `Tenant`
- [ ] `Institution`
- [ ] `Branch`
- [ ] `AcademicYear`
- [ ] `User`
- [ ] `Role`
- [ ] `Permission`
- [ ] `RolePermission`
- [ ] `UserRoleAssignment`
- [ ] `UserBranchAccess`
- [ ] `TenantSettings`
- [ ] `AttendanceSetting`
- [ ] `AuditLog`

Acceptance criteria:

- Every tenant-owned table includes `tenantId`.
- Branch-level records include `branchId` where required.
- Academic-year records are properly scoped.
- Indexes and unique constraints exist.
- No single-school assumptions.

### 1.2 CampusCore Enums
Add enums for lifecycle/status fields, including where applicable:

- [ ] Tenant status
- [ ] User status
- [ ] Academic year status
- [ ] Branch status

Acceptance criteria:

- Status fields do not rely on loose strings.

### 1.3 Permission Seed Plan
Create seed constants for permissions:

- [ ] CampusCore permissions
- [ ] Academia permissions
- [ ] StaffBoard Lite permissions

Acceptance criteria:

- Permission strings are centralized.
- Permission names match `PRD.md`.

### 1.4 Canonical Role Seed Plan
Create explicit mappings for the approved five-role model:

- [x] `ADMINISTRATOR` as a separately provisioned JinaCampus platform operator
- [x] Separate platform administrator identity, credential, session cookie, profile, password flow, and retained audit log from every school tenant.
- [x] Replace dependency-blocked school deletion with exact-confirmation transactional tenant teardown and retained platform audit.
- [x] `PRINCIPAL`
- [x] `OFFICE_STAFF`
- [x] `TEACHER`
- [x] `STAFF`
- [x] Preserve old role codes only as migration aliases for existing assignments
- [x] Exclude legacy aliases and deferred parent/student roles from new tenant seeds

Acceptance criteria:

- Roles are tenant-scoped where appropriate.
- Role-permission mappings are explicit.
- Principals can assign only Office Staff, Teacher, and Staff.
- School user-management screens do not expose platform or legacy role aliases.
- One user can hold multiple assignments without needing duplicate login accounts.

### 1.5 Tenant Context Resolver
Implement tenant context utilities:

- [ ] Resolve current user
- [ ] Resolve tenant context
- [ ] Resolve active branch, if selected
- [ ] Resolve active academic year
- [ ] Prevent trusting client-supplied tenant claims

Acceptance criteria:

- Protected services receive verified tenant context.
- Branch access is validated where required.

### 1.6 RBAC Guard
Implement permission guard:

```ts
requirePermission({
  userId,
  tenantId,
  branchId,
  permission,
})
```

Acceptance criteria:

- Denies unauthenticated users.
- Denies missing permissions.
- Denies wrong tenant.
- Denies wrong branch where applicable.

### 1.7 Audit Logger
Implement audit utility:

```ts
writeAuditLog({
  tenantId,
  branchId,
  academicYearId,
  actorUserId,
  action,
  entityType,
  entityId,
  beforeJson,
  afterJson,
  metadataJson,
})
```

Acceptance criteria:

- Can be called inside Prisma transactions.
- Supports before/after snapshots.
- Does not break app flow on optional metadata absence.

### 1.8 CampusCore Zod Schemas
Create schemas for:

- [ ] Tenant create/update
- [ ] Institution create/update
- [ ] Branch create/update
- [ ] Academic year create/update
- [ ] User create/update
- [ ] Role create/update
- [ ] Role assignment
- [ ] Attendance settings update

Acceptance criteria:

- No unvalidated inputs reach services.

### 1.9 CampusCore Services
Create services for:

- [ ] Institutions
- [ ] Branches
- [ ] Academic years
- [ ] Users
- [ ] Roles/permissions
- [ ] Settings
- [ ] Audit log queries

Acceptance criteria:

- All services are tenant-scoped.
- All protected services check permissions.
- Critical mutations write audit logs.

### 1.10 CampusCore UI Routes
Build initial pages:

- [ ] `/dashboard`
- [ ] `/campus-core/institutions`
- [ ] `/campus-core/branches`
- [ ] `/campus-core/academic-years`
- [ ] `/campus-core/users`
- [ ] `/campus-core/roles`
- [ ] `/campus-core/settings`
- [ ] `/campus-core/audit-logs`

Acceptance criteria:

- Pages have loading/empty/error states.
- Tables have pagination or clear TODO where not yet implemented.
- Navigation is role-aware where practical.

## Phase 2 — Academia Foundation

### 2.1 Academia Prisma Schema
Create/extend models for:

- [ ] `Class`
- [ ] `Section`
- [ ] `ClassSection`
- [ ] `Subject`
- [ ] `Student`
- [ ] `Guardian`
- [ ] `StudentGuardianLink`
- [ ] `Enrollment`
- [ ] `StudentAttendanceRecord`
- [ ] Attendance notification foundation models

Acceptance criteria:

- Academic records include `tenantId`.
- Branch-scoped records include `branchId`.
- Enrollments include `academicYearId`.
- Attendance uniqueness prevents duplicates.

### 2.2 Academia Enums
Add enums for:

- [ ] Student status
- [ ] Enrollment status
- [ ] Guardian relation
- [ ] Student attendance status
- [ ] Attendance session type

Acceptance criteria:

- MVP uses `FULL_DAY` but future values are safe.

### 2.3 Academia Zod Schemas
Create schemas for:

- [ ] Class create/update
- [ ] Section create/update
- [ ] Class-section create/update
- [ ] Subject create/update
- [ ] Student create/update
- [ ] Guardian create/update
- [ ] Guardian link
- [ ] Enrollment create/update

Acceptance criteria:

- Admission number validation exists.
- Student registration validates admission date, full name, date of birth, parent names, Aadhaar input, religion, caste, category, nationality, city, and state.
- Aadhaar and bank account inputs are converted to masked-only stored references; plaintext sensitive values are not persisted.
- Guardian link validation prevents invalid relation data.

### 2.4 Academia Services
Create services for:

- [ ] Classes
- [ ] Sections
- [ ] Class sections
- [ ] Subjects
- [ ] Students
- [ ] Guardians
- [ ] Enrollments

Acceptance criteria:

- All services are tenant-scoped.
- Enrollment operations are academic-year-aware.
- Critical changes are audited.

### 2.5 Academia UI Routes
Build initial pages:

- [ ] `/academia/classes`
- [ ] `/academia/sections`
- [ ] `/academia/class-sections`
- [ ] `/academia/subjects`
- [ ] `/academia/students`
- [ ] `/academia/guardians`
- [ ] `/academia/enrollments`

Acceptance criteria:

- Operational CRUD pages exist.
- Tables support search/filter where useful.
- Forms validate client and server-side.
- Student create/edit/profile pages are sectioned like a school admission sheet and never render full Aadhaar or bank account numbers.

## Phase 3 — Student Attendance

### 3.1 Attendance Submission Schema
Create Zod schemas:

- [ ] `submitStudentAttendanceSchema`
- [ ] `correctStudentAttendanceSchema`
- [ ] `lockStudentAttendanceSchema`
- [ ] `studentAttendanceReportFilterSchema`

Acceptance criteria:

- Invalid statuses are rejected.
- Empty attendance submissions are rejected.
- Correction requires reason.

### 3.2 Active Enrolled Student Query
Implement query for active students in a class-section on a selected date.

Acceptance criteria:

- Excludes inactive/withdrawn students.
- Handles mid-year admissions.
- Tenant, branch, and academic year scoped.

### 3.3 Submit Daily Full-Day Attendance
Implement transactional service:

- [ ] Validate teacher/admin permission
- [ ] Verify class-section access
- [ ] Load active enrollments
- [ ] Upsert attendance records safely
- [ ] Prevent duplicate records
- [ ] Queue attendance notification outbox rows when enabled and consented
- [ ] Write audit logs

Acceptance criteria:

- Teacher can mark only assigned class-section.
- Admin can mark branch-scoped class-section.
- Submission is atomic.
- Attendance notification outbox rows are queued for eligible statuses according to settings and consent.

### 3.4 Attendance Auto-Locking
Implement lock behavior based on `AttendanceSetting`.

Acceptance criteria:

- Teacher edits are blocked after cutoff.
- Admin/principal correction remains possible with reason.

### 3.5 Attendance Correction
Implement admin/principal correction flow.

Acceptance criteria:

- Correction requires permission.
- Correction requires reason.
- Before/after status is audited.

### 3.6 Student Attendance UI
Build:

- [ ] `/academia/attendance`
- [ ] Class-section selector
- [ ] Date selector
- [ ] Active student list
- [ ] Mark all present
- [ ] Individual status changes
- [ ] Remarks field
- [ ] Submit action
- [ ] Locked/correction state

Acceptance criteria:

- Teacher workflow is fast.
- Default action supports mark-all-present.
- Locked records are clear to user.

### 3.7 Student Attendance Reports
Build:

- [ ] Daily class attendance
- [ ] Class-wise report
- [ ] Student-wise history
- [ ] Monthly percentage
- [ ] Absent list
- [ ] Late list
- [ ] Classes not marked

Acceptance criteria:

- Reports are tenant/branch/academic-year scoped.
- Reports are table-first and paginated where needed.

## Phase 4 — StaffBoard Lite Foundation

### 4.1 StaffBoard Lite Prisma Schema
Create/extend models for:

- [ ] `StaffProfile`
- [ ] `StaffAttendanceRecord`
- [ ] `StaffAttendanceQrToken`

Acceptance criteria:

- Staff profile includes `tenantId` and `branchId`.
- Employee code is unique within tenant.
- Attendance record is unique per staff/date/branch.
- QR token stores hash, not raw token.

### 4.2 StaffBoard Lite Enums
Add enums for:

- [ ] Staff type
- [ ] Employment status
- [ ] Staff attendance status
- [ ] Staff attendance source
- [ ] Staff QR purpose

Acceptance criteria:

- Categories match PRD exactly.

### 4.3 Staff Zod Schemas
Create schemas for:

- [ ] Staff profile create/update
- [ ] Staff profile filters
- [ ] Staff attendance report filters

Acceptance criteria:

- Employee code required.
- Staff category required.
- Branch required.

### 4.4 Staff Services
Create services for:

- [ ] Staff create/update
- [ ] Staff list/detail
- [ ] Staff category filter

Acceptance criteria:

- Services are tenant and branch scoped.
- Critical changes are audited.

### 4.5 Staff UI Routes
Build:

- [ ] `/staffboard/staff`
- [ ] Staff list
- [ ] Staff create/edit form
- [ ] Category filter
- [ ] Status filter

Acceptance criteria:

- Staff admin workflow is usable.
- Page includes loading/empty/error states.

## Phase 5 — QR Staff Attendance

### 5.1 QR Generation Service
Implement QR token generation.

Acceptance criteria:

- Requires `staffboard.attendance.qr.generate`.
- Requires a Principal or permissioned Office Staff QR Operator role on the server.
- Token is random and secure.
- Token hash is stored.
- Raw token is returned only once for QR rendering.
- Token has `validFrom` and `validUntil`.
- Token uses the fixed five-hour validity window.
- Token is tenant and branch scoped.

### 5.2 QR Display UI
Build:

- [ ] `/staffboard/attendance/qr`
- [ ] Branch selector if user has multiple branch access
- [ ] Purpose selector: check-in/check-out
- [ ] Auto-refresh QR
- [ ] Countdown timer
- [ ] Today summary cards

Acceptance criteria:

- Expired QR is not shown as active.
- UI makes scan purpose clear.
- UI shows generated time, expiry time, status, remaining validity, and an explicit deactivate action.

### 5.3 QR Scan Service
Implement scan validation.

Acceptance criteria:

- Requires authenticated staff.
- Requires `staffboard.attendance.self_scan`.
- Rejects invalid token.
- Rejects expired token.
- Rejects wrong tenant.
- Rejects wrong branch.
- Prevents duplicate check-in misuse.
- Supports check-out.
- Writes audit logs.

### 5.4 Check-in/Check-out Calculation
Implement status calculation from attendance settings.

Acceptance criteria:

- Check-in before late time = present candidate.
- Check-in after late time = late.
- Check-out calculates working minutes.
- Early checkout can become half-day based on minimum minutes.
- Missing scan can remain `NOT_MARKED` until absent-marking job/report logic.

### 5.5 Manual Staff Attendance Correction
Implement correction flow.

Acceptance criteria:

- Requires `staffboard.attendance.correct`.
- Requires reason.
- Stores old/new values in audit log.
- Does not allow staff to directly edit system-generated QR records.

### 5.6 Staff Scan UI
Build:

- [ ] `/staffboard/attendance/scan`
- [ ] Camera QR scanner or input fallback
- [ ] Scan success state
- [ ] Scan error state
- [ ] Current attendance status
- [ ] Check-in/check-out times

Acceptance criteria:

- Mobile-friendly.
- Clear error messages for expired/wrong QR.

### 5.7 Staff Attendance Admin UI
Build:

- [ ] `/staffboard/attendance`
- [ ] Date filter
- [ ] Branch filter
- [ ] Staff category filter
- [ ] Status filter
- [ ] Attendance table
- [ ] Manual correction dialog

Acceptance criteria:

- Admin can review daily staff attendance.
- Manual correction is audited.

### 5.8 Staff Attendance Reports
Build:

- [ ] Daily staff attendance
- [ ] Teacher attendance report
- [ ] Non-teaching staff report
- [ ] Late arrival report
- [ ] Half-day report
- [ ] Monthly summary
- [ ] Manual correction report

Acceptance criteria:

- Reports are tenant/branch/date scoped.
- Tables are paginated where needed.

## Phase 6 — Dashboards and Polish

### 6.1 Dashboard Query Services
Create query services for dashboard cards.

CampusCore:

- [ ] Total branches
- [ ] Active academic year
- [ ] Total users
- [ ] Active roles

Academia:

- [ ] Total students
- [ ] Active enrollments
- [ ] Students present today
- [ ] Students absent today
- [ ] Classes not marked today

StaffBoard Lite:

- [ ] Total staff
- [ ] Staff checked in today
- [ ] Staff late today
- [ ] Staff absent today
- [ ] Staff half-day today

Acceptance criteria:

- Queries are tenant-scoped.
- Branch filters are applied for branch users.

### 6.2 Dashboard UI
Build dashboard cards.

Acceptance criteria:

- Cards are role-aware.
- Empty state appears for new tenant.
- No expensive unbounded queries.

### 6.3 Navigation Polish
Finalize sidebar and topbar.

Acceptance criteria:

- Navigation respects module scope.
- Shows only accessible areas where practical.
- Tenant/branch/academic year context visible.

### 6.4 Error Handling Polish
Add consistent handling for:

- [ ] Auth errors
- [ ] Permission errors
- [ ] Validation errors
- [ ] Not found errors
- [ ] Tenant mismatch errors
- [ ] QR expired errors

Acceptance criteria:

- Users see readable errors.
- Sensitive internals are not exposed.

## Phase 7 — Testing and Hardening

### 7.1 Tenant Isolation Tests
Test that users cannot access records from another tenant.

- [ ] CampusCore
- [ ] Academia
- [ ] StaffBoard Lite

### 7.2 RBAC Tests
Test permission denial and permission success for critical actions.

- [ ] User management
- [ ] Student attendance mark
- [ ] Student attendance correction
- [ ] QR generation
- [ ] QR scan
- [ ] Staff attendance correction

### 7.3 Attendance Tests
Test:

- [ ] Duplicate student attendance prevention
- [ ] Teacher assigned class access
- [ ] Attendance lock cutoff
- [ ] Correction reason required
- [ ] Attendance notification outbox queueing and non-blocking failure behavior

### 7.4 QR Security Tests
Test:

- [ ] Expired QR rejected
- [ ] Wrong branch rejected
- [ ] Invalid token rejected
- [ ] Duplicate check-in prevented
- [ ] Check-out without check-in handled safely
- [ ] Token hash is stored, not raw token

### 7.5 Final Quality Gate
Run available commands:

- [ ] lint
- [ ] typecheck
- [ ] test
- [ ] build

Acceptance criteria:

- Codex reports exact commands and outputs.
- If a command is unavailable, Codex states that clearly.
- Known risks are documented.

## Phase 8 — Mobile Readiness and Browser QA

### 8.1 Mobile UI Foundation and Audit
Prepare the existing Next.js app for mobile-first responsive usage.

Acceptance criteria:

- App shell, dashboard, attendance, QR, report, and form surfaces are mobile-friendly.
- Tables scroll or adapt safely.
- Protected routes remain protected.
- Tenant isolation, RBAC, and QR token safety are preserved.

### 8.2 Mobile Browser QA Pass
Run responsive browser QA without adding a new browser framework unless explicitly approved.

Acceptance criteria:

- Mobile QA checklist exists.
- 360 px, 390 px, 414 px, 768 px, and desktop widths are covered by tooling or manual checklist.
- No raw QR token or token hash is exposed.
- Deferred items remain clear.

## Phase 9 — Base Application Polish & Usability Hardening

Strategic decision: before starting the next product MVP module such as FeeDesk, GradeBook, or SchoolCast, JinaCampus must complete this base polish phase.

Reason: the current MVP foundation is technically strong, but the product experience must become smoother, easier to use, mobile-friendly, demo-ready, and production-ready before adding new business modules.

Standard Phase 9 checks:

- `npx prisma format`
- `npx prisma validate`
- `npx prisma generate`
- `npm run typecheck`
- `npm test`
- `npm run build`
- `git diff --check`
- `npm pkg get scripts.lint`

Note: `package.json` currently has no lint script; `npm pkg get scripts.lint` returns `{}`.

Global Phase 9 acceptance criteria:

- Protected routes remain protected.
- Tenant isolation is preserved.
- RBAC is preserved.
- Audit logging is not bypassed for critical mutations.
- No token hash or raw QR token is exposed.
- Existing tests and build pass.
- No FeeDesk, GradeBook, SchoolCast, native mobile app, camera scanner, payroll, biometric attendance, exports, or charts are added unless explicitly requested.

### 9.1 Core Edit Flows
Goal: add practical edit/update UI flows for core records.

Scope:

- Classes
- Sections
- Subjects
- Students
- Guardians
- Enrollments
- Staff Profiles

Out of scope:

- FeeDesk, GradeBook, SchoolCast, payroll, leave management, native mobile app, and new backend modules.
- Any update path that weakens tenant isolation, RBAC, or audit behavior.

Acceptance criteria:

- Edit routes or approved edit UI patterns exist for supported core records.
- Existing Zod schemas, services, and actions are reused where available.
- List pages link only to implemented edit flows.
- Tenant, branch, academic-year, and permission checks remain server-enforced.
- Safe validation and error messages are shown.

Checks to run: Standard Phase 9 checks.

### 9.2 Form UX Polish
Goal: make create/edit forms easier for school staff.

Scope:

- Field-level validation messages
- Required field indicators
- Clear save/cancel actions
- Loading and disabled submit states
- Safe success/error messages
- Mobile-friendly form layouts

Out of scope:

- New product modules, complex form builders, and unnecessary dependencies.

Acceptance criteria:

- Important forms clearly show required fields and validation feedback.
- Save/cancel actions are easy to find on mobile and desktop.
- Submit buttons handle loading and disabled states.
- Server-side validation remains authoritative.

Checks to run: Standard Phase 9 checks.

### 9.3 Empty / Loading / Error State Polish
Goal: make every important page understandable even when there is no data or something fails.

Scope:

- No students
- No staff
- No class sections
- No enrollments
- No attendance records
- No reports
- No QR generated
- Dashboard empty states

Out of scope:

- Fake production data and hidden authorization bypasses.

Acceptance criteria:

- Empty states explain what is missing and the next safe action.
- Loading states are visible where useful.
- Error states are safe, human-readable, and non-leaky.
- Sensitive details such as tenant IDs, Prisma errors, token hash, and raw QR tokens are not exposed.

Checks to run: Standard Phase 9 checks.

### 9.4 Table and Filter Polish
Goal: make list/report pages easier to scan and operate.

Scope:

- Search/filter consistency
- Status badges
- Pagination labels
- Responsive table wrappers
- Action buttons
- Mobile card fallback where appropriate

Out of scope:

- Exports, charts, complex analytics, and new reporting modules.

Acceptance criteria:

- Lists and reports are readable on mobile and desktop.
- Filters are consistent and stack safely on small screens.
- Pagination labels are clear.
- Row actions are easy to tap and permission-aware.

Checks to run: Standard Phase 9 checks.

### 9.5 Role-Based Navigation Polish
Goal: make navigation simpler for different user types.

Target roles:

- Principal/Admin
- Teacher
- Staff

Suggested experience:

Principal/Admin:

- Dashboard
- Students
- Student Attendance
- Staff Attendance
- Reports
- Settings

Teacher:

- Dashboard
- Mark Student Attendance
- Student Attendance Reports
- Scan QR

Staff:

- Dashboard
- Scan QR
- My Attendance Status

Out of scope:

- A large new navigation/RBAC framework unless existing conventions require it.
- Links to inaccessible or unbuilt modules.

Acceptance criteria:

- Navigation labels are school-friendly.
- Links point only to real routes.
- Permission filtering is preserved where implemented.
- Route-level RBAC remains authoritative.

Checks to run: Standard Phase 9 checks.

### 9.6 Dashboard UX Polish
Goal: make dashboard feel like the control center.

Scope:

- Role-aware quick actions
- Today summary
- Better grouping
- Mobile card layout
- Branch/year context
- Useful empty states

Out of scope:

- Complex analytics, charts, exports, or InsightBoard-style dashboards.

Acceptance criteria:

- Dashboard cards are readable and responsive.
- Quick actions are useful for the current role.
- Empty data does not look broken.
- Dashboard queries remain tenant-safe and permission-aware.

Checks to run: Standard Phase 9 checks.

### 9.7 Authenticated Mobile QA
Goal: run mobile/device QA after local DB is reachable and seeded.

Scope:

- 360 px phone
- 390 px phone
- 414 px phone
- 768 px tablet
- Desktop

Priority routes:

- `/dashboard`
- `/academia/attendance/mark`
- `/academia/attendance/reports`
- `/staffboard/attendance/scan`
- `/staffboard/attendance/qr`
- `/staffboard/attendance`
- `/staffboard/attendance/reports`

Out of scope:

- Native mobile app, camera scanner, offline service worker, and browser/e2e framework unless explicitly approved.

Acceptance criteria:

- Admin/principal, teacher, and staff experiences are checked with seeded users where available.
- No horizontal overflow at 360 px.
- Primary actions are visible and tappable.
- Protected routes remain protected.
- No token hash, raw QR token, or tenant leakage appears in UI text.
- Findings and remaining risks are documented in `docs/mobile-qa-checklist.md`.

Checks to run: `npm run typecheck`, `npm test`, `npm run build`, `git diff --check`, and `npm pkg get scripts.lint`; run Prisma checks only if code or schema changes require them.

### 9.8 Demo Seed Data
Goal: create or improve a safe demo seed dataset for QA and demos.

Seed should include:

- One tenant
- One institution
- One branch
- One academic year
- Admin user
- Principal user
- Teacher user
- Staff user
- Classes
- Sections
- Class sections
- Students
- Guardians
- Staff profiles
- Sample attendance records

Out of scope:

- Real student/staff data.
- Production credentials.
- Large fixture systems unrelated to demo and QA needs.

Acceptance criteria:

- Seed data is safe, fake, repeatable, and demo-ready.
- Seeded users cover admin/principal, teacher, and staff flows.
- Teacher attendance and staff QR scan can be exercised locally.
- Seed does not weaken auth, RBAC, tenant isolation, or audit behavior.

Checks to run: Standard Phase 9 checks, plus the existing seed flow.

### 9.9 Final Base MVP Smoke Checklist
Goal: verify the complete base app before starting the next module.

Checklist:

- Login works.
- Dashboard loads.
- Create/edit student works.
- Create/edit staff works.
- Student attendance submit works.
- Student attendance reports load.
- Staff QR generation works.
- Staff scan works.
- Staff correction works.
- Staff reports load.
- Mobile layout works.
- Protected routes redirect.
- No token hash is exposed.
- No tenant leakage occurs.
- Safe error messages are shown.

Out of scope:

- New product modules, exports, charts, native mobile app, camera scanner, payroll, leave management, and biometric attendance.

Acceptance criteria:

- Smoke checklist is completed and documented.
- All checks pass or blockers are recorded with exact error text.
- FeeDesk, GradeBook, and SchoolCast remain unstarted until this phase is complete.

Checks to run: Standard Phase 9 checks.

## Phase 10.7 — WhatsApp Attendance Notification Foundation

Goal: add a lightweight SchoolCast Lite notification foundation for attendance-only WhatsApp notifications without starting the full SchoolCast module.

Scope:

- Student daily attendance guardian WhatsApp alert foundation.
- Staff monthly attendance WhatsApp summary foundation.
- Tenant-safe notification outbox.
- WhatsApp provider abstraction with dry-run default.
- Delivery log and webhook status foundation.
- Consent and communication preference model.
- Attendance settings controls for notification behavior.

Out of scope:

- Full SchoolCast.
- Marketing broadcasts.
- Fee reminders.
- Result announcements.
- Circulars.
- Chatbot.
- Parent/student apps.
- Push notifications.
- Native mobile work.
- Real WhatsApp sending without approved provider credentials and secret storage.

Acceptance criteria:

- Notification models are tenant-scoped and indexed.
- Notification templates are seeded for demo tenant.
- Demo notification settings and communication preferences are disabled by default.
- Student attendance submission queues notifications only when enabled, consented, and eligible by status.
- Notification queue failures do not block attendance submission.
- Staff monthly summaries can be queued by a job helper when enabled and consented.
- Outbox processing supports dry-run provider behavior.
- WhatsApp webhook status handling verifies configured secrets and records safe delivery state.
- Admin/principal have notification governance permissions.
- Teacher/staff do not gain notification governance permissions.
- Payloads do not include password hashes, token hashes, QR tokens, tenant IDs, actor IDs, remarks, medical details, or provider secrets.
- Full SchoolCast remains deferred.

Checks to run: `npx prisma format`, `npx prisma validate`, `npx prisma generate`, `npm run typecheck`, `npm test`, `npm run build`, `git diff --check`, and `npm pkg get scripts.lint`; run DB migration/seed smoke when PostgreSQL is reachable.

## Phase 10.8 — Five-Role Governance and Fast Login

Goal: reduce role sprawl and give staff/teachers a secure fast-login path without weakening tenant or permission enforcement.

Implementation:

- [x] Canonical Administrator, Principal, Office Staff, Teacher, and Staff roles
- [x] Legacy school-role compatibility aliases hidden from new assignments
- [x] Principal assignment boundary limited to Office Staff, Teacher, and Staff
- [x] One human/one user model with additive server-side permission merging
- [x] School ID plus employee-code/email identity resolution
- [x] Passkey-first login with permanent password fallback
- [x] Current-password verification for passkey enrollment/removal
- [x] Forced temporary-password change before protected workflows or passkey enrollment
- [x] Teacher assigned-class scoping and Staff own-attendance permission
- [x] Tenant-scoped, expiring, replay-resistant WebAuthn challenge persistence
- [x] Retired public phone-OTP login and public OTP reset routes; recovery is administrator-assisted
- [x] Prisma schema, migration, source tests, full tests, and build
- [x] Apply migration to the isolated local QA database
- [x] Run local HTTPS Chrome passkey registration/login/replay/password-fallback QA
- [x] Consolidate Office Staff, Teacher, and Staff account creation under Staff Profiles
- [x] Preserve StaffProfile/User linkage through login disable/reactivation
- [x] Deactivate linked login and revoke sessions with non-active employment
- [x] Add tenant-safe personal attendance dashboard and corrected Office Staff navigation
- [x] Add `/attendance-login` passkey-first path with password fallback
- [x] Add permission-derived `/account/workspaces` manual selection
- [x] Add tenant-scoped `/campus-core/readiness` setup checks
- [x] Add focused lifecycle, navigation, workspace, and readiness tests
- [ ] Apply migration to the intended database through the approved deployment process
- [ ] Configure exact production `WEBAUTHN_ORIGIN` and `WEBAUTHN_RP_ID`
- [ ] Run HTTPS passkey registration/login QA on supported pilot devices
- [x] Run DB-backed browser QA for the consolidated staff lifecycle and readiness gate
- [ ] Run physical Android Chrome and iOS Safari attendance-login/passkey QA

Acceptance criteria:

- Client input cannot select or grant a role.
- Cross-tenant role assignments do not affect login routing or permissions.
- Password login remains available after passkey enrollment.
- Biometric data, passwords, challenges, and credential internals are not exposed.
- Administrator remains an operator-only role and Principal remains school-scoped.

## Phase 10.9 - Institution Boundary and Academia Setup Repair

Goal: make core academic configuration and student class readiness operational
without expanding the Base MVP module scope.

Implementation:

- [x] Restrict new institution provisioning to the Administrator Portal.
- [x] Scope school institution/profile reads and mutations through assigned branches.
- [x] Add one guided Academic Setup workflow for Classes, Sections, Class Sections, and Subjects.
- [x] Add audited Class, Section, Subject, and Class Section create actions.
- [x] Add Class Section edit and lifecycle handling.
- [x] Hide technical Guardian, Enrollment, Class, Section, Class Section, and Subject menus where embedded workflows replace them.
- [x] Create and link the primary Guardian during student registration.
- [x] Support optional initial class assignment during student registration.
- [x] Add server-derived Assign Class workflow to the student profile.
- [x] Keep Subjects as simple CRUD for future academic modules.
- [x] Add focused source and service regression tests.
- [x] Run DB-backed Principal Academic Setup create browser QA.
- [x] Run DB-backed Academic Setup update/deactivate browser QA.
- [x] Run embedded Student, primary Guardian, and initial Enrollment browser QA.
- [x] Run Teacher assigned-class attendance browser QA.
- [x] Run second-institution and wrong-branch negative browser QA.

Acceptance criteria:

- Principal cannot provision a new institution from the school workspace.
- Principal institution, branch, and academic-year operations stay within assigned institution scope.
- Academic Setup creates valid active records for the selected branch and year.
- Student registration writes Student, Guardian, link, and optional Enrollment atomically.
- Assign Class does not accept tenant, branch, or academic-year identifiers from the client.
- Teacher attendance continues to expose only assigned class-sections and active enrolled students.

## Phase 10.10 - Student Bulk Records and Admission Documents

Goal: support large school roster onboarding and secure student admission records without weakening Academia tenancy or RBAC.

Implementation:

- [x] Branch-scoped Excel and Google Sheets-compatible CSV templates.
- [x] Server-side spreadsheet parsing with row/field preview errors.
- [x] Atomic, batched persistence for up to 5,000 validated student rows while reporting invalid rows separately.
- [x] Seven-field minimum import template with flexible common school header aliases.
- [x] Blank optional cells normalize to null-compatible values and incomplete profiles remain visible for later completion.
- [x] Duplicate admission, roll-number, class-capacity, and guardian-contact checks.
- [x] Mask Aadhaar and bank-account values before persistence and export.
- [x] Branch-scoped audited Excel/CSV exports with formula-injection protection.
- [x] Private Supabase Storage metadata model and additive Prisma migration.
- [x] Admission-form photograph, Transfer Certificate, Birth Certificate, and additional document inputs.
- [x] Student-profile document upload, short-lived access, and audited deletion.
- [x] File size, signature, MIME, filename, tenant, branch, and permission enforcement.
- [x] Focused parser, storage, schema, security, and UI source tests.
- [x] Apply the migration to the approved deployment database.
- [x] Configure server-only Supabase Storage variables in Vercel.
- [x] Run DB-backed cross-tenant/branch import, export, and document browser QA.

Acceptance criteria:

- Client input cannot select tenant, actor, or database branch IDs inside spreadsheet rows.
- Invalid file/header errors block the import; row-level errors skip only affected rows and do not prevent validated rows from importing.
- No full Aadhaar, bank account, storage path, checksum, or private key appears in exports or normal UI.
- Student documents remain private and require branch-scoped `academia.student.update` access.
- Existing single-student registration behavior remains available.

## Phase 10.11 - Administrator Institution Branding Upload

Goal: let the separate JinaCampus Administrator Portal manage institution logo files while presenting school identity consistently in authenticated application chrome.

Implementation:

- [x] Platform-administrator-only institution logo upload action.
- [x] Tenant/institution relationship validation before storage writes.
- [x] JPEG, PNG, and WebP signature validation with a bounded file size.
- [x] Dedicated public-read Supabase branding bucket with server-only upload credentials.
- [x] Opaque object names that do not expose tenant or institution IDs.
- [x] Atomic institution URL/object-key update with platform audit logging and upload rollback.
- [x] Administrator school edit/detail logo preview and replacement controls.
- [x] Institution logo and highlighted Display Name in desktop/mobile authenticated chrome.
- [x] Initials fallback for missing or invalid logo images.
- [x] Focused storage, authority, scoping, security, and shell source tests.
- [x] Configure branding storage variables in the approved deployment environment.
- [x] Run DB-backed Supabase upload, replacement, and cross-tenant browser QA.

Acceptance criteria:

- School users cannot access the Administrator Portal upload action.
- Client input cannot bypass the tenant/institution relationship check.
- SVG, PDF, arbitrary, empty, and oversized files are rejected safely.
- Public logo URLs contain no tenant, institution, actor, credential, or token identifiers.
- The institution Display Name remains visible when the image is missing or cannot load.
- Successful replacements are platform-audited without storage keys or sensitive credentials.

## Phase 10.12 - Staff Leave Application and Management

Goal: add a tenant-safe staff leave workflow to StaffBoard Lite without expanding into payroll or full HR management.

Implementation:

- [x] Tenant- and branch-scoped leave policy, type, approver, balance, application, action, document, and in-system notification models.
- [x] Self-service applications for linked Teacher, Staff, and Office Staff profiles.
- [x] Server-calculated working dates, half days, overlap checks, notice rules, consecutive-day limits, and balance enforcement.
- [x] Pending, clarification-required, approved, rejected, withdrawn, and cancelled workflows with remarks and action history.
- [x] Principal or designated-approver governance with branch-scoped permission enforcement.
- [x] Required supporting-document enforcement with private Supabase Storage and short-lived access URLs.
- [x] Transactional approved-leave synchronization to staff attendance and protection against QR/manual attendance conflicts.
- [x] In-system notifications and disabled-by-default, consent-controlled WhatsApp outbox events.
- [x] Branch settings for leave policy, leave types, designated approvers, and staff balances.
- [x] Leave navigation and responsive applicant, reviewer, detail, document, and settings screens.
- [x] Audit events for application, review, cancellation, policy, type, approver, balance, and document changes.
- [x] Focused calculation, validation, RBAC, notification-payload, security, navigation, and tenant-deletion tests.
- [x] Apply the additive leave schema and foreign-key index migrations to the approved database.
- [x] Configure the private staff leave document bucket variables in deployment environments.
- [x] Run DB-backed Principal/approver and Teacher/Staff browser QA, including attendance conflict and cross-branch denial.

Acceptance criteria:

- Client input cannot select tenant, branch, staff identity, role, total leave days, balance usage, or attendance status.
- A Principal can approve according to branch policy; a non-principal approver must have both permission and an active branch designation.
- Approval is atomic across application status, balance usage, attendance synchronization, action history, notifications, and audit logging.
- Approved leave cannot overwrite real QR activity or non-placeholder attendance.
- Staff can access only their own applications and private documents; reviewers remain branch-scoped.
- WhatsApp delivery is never implied unless consent, settings, an approved template, and outbox processing are configured.
- Payroll, salary calculation, email invitation, native mobile leave, and broad HR automation remain out of scope.

## Phase 10.13 - Academic and Institutional Calendar

Goal: configure audited school holidays and non-working days while keeping student and staff attendance calculations accurate.

Implementation:

- [x] Tenant-, institution-, branch-, and academic-year-scoped calendar entries with date ranges and explicit audiences.
- [x] Principal calendar-governance permission with Teacher and Staff denial by default.
- [x] Responsive calendar create, edit, soft-cancel, history, and all-branch access controls.
- [x] Overlap, academic-year boundary, existing student attendance, staff leave, and real staff attendance conflict protection.
- [x] Student attendance marking/correction blocking and classes-not-marked dashboard/report exclusion on holidays.
- [x] Paid `HOLIDAY` staff attendance synchronization for teaching and non-teaching audiences.
- [x] QR, manual correction, and leave approval safeguards for calendar-managed staff records.
- [x] Holiday exclusion from staff leave working-day calculations.
- [x] Staff-profile reconciliation when eligible staff are created or their operational scope changes.
- [x] Calendar create, update, and cancellation audit events with safe metadata.
- [x] Additive Prisma migration, hosted-database RLS enablement, focused tests, and operator documentation.
- [x] Apply the additive calendar migration to the approved deployment database.
- [x] Run DB-backed Principal create/update/cancel, Teacher/Staff denial, student attendance, staff QR, leave, dashboard, and report browser QA.

Acceptance criteria:

- Client input cannot select tenant, actor, staff identity, attendance status, or audit authority.
- Institution-wide entries require access to every active institution branch; branch entries remain branch-scoped.
- Student holidays create no attendance rows and do not reduce attendance percentages or create false not-marked results.
- Applicable staff receive one paid holiday record per date without overwriting real attendance or approved leave.
- Calendar changes retain history through soft cancellation and write tenant-safe audit logs.
- Payroll remains out of scope; future salary calculations must treat `HOLIDAY` as paid non-working time.

## Phase 10.14 - QR Attendance Operator Console and PWA Installation

Goal: harden attendance QR operations and provide a supported mobile-web installation path without adding offline attendance behavior.

Implementation:

- [x] Dedicated QR Attendance Console at `/staffboard/attendance/qr` using existing StaffBoard attendance services.
- [x] Combined server-side role and permission boundary for Principal and Office Staff QR Operator access.
- [x] Fixed five-hour validity with client validity overrides rejected.
- [x] Explicit active, deactivated, and expired lifecycle state with one active token per branch and purpose.
- [x] Atomic regeneration revocation, manual deactivation, lazy expiry reconciliation, and authoritative expiry rejection.
- [x] Audit events for generation, regeneration, deactivation, expiry reconciliation, and successful QR use.
- [x] Current status, generated time, expiry time, validity duration, and remaining countdown in the console.
- [x] Authenticated mobile navigation install control using the browser prompt when available.
- [x] Safari-specific Add to Home Screen guidance and safe fallback guidance for other browsers.
- [x] Existing manifest, icons, HTTPS camera policy, responsive navigation, and secure login preserved.
- [x] Focused QR lifecycle, RBAC, action, UI, schema, and PWA source tests.

Acceptance criteria:

- Teacher, Staff, and other non-operator school roles cannot generate or deactivate QR codes even if UI visibility is bypassed.
- A regenerated or manually deactivated token is rejected by the scan service.
- Expiry never depends on the browser countdown; `validUntil` is enforced server-side.
- No raw QR token or token hash is stored in lifecycle fields or written to audit metadata.
- PWA installation is progressive: unsupported prompts show truthful browser-specific guidance rather than a false success state.
- Installed PWA attendance remains online-only and requires the same authenticated server checks as browser use.
- Additive migration and physical-device HTTPS install/camera QA must pass before release deployment.

## Phase 10.15 - Class-wise Student Promotion

Goal: record reviewed student outcomes and create next-year enrollments without overwriting academic history.

Implementation:

- [x] Dedicated `academia.promotion.manage` permission granted to Principal and legacy school-governance aliases by default.
- [x] Class-wise source roster with individual and bulk student selection.
- [x] Promoted, Not Promoted, Repeat Same Class, Transferred, School Left, Result Pending, and Promotion Withheld outcomes.
- [x] Explicit current/target academic years, source/target class-sections, effective date, remarks, and result-publication attestation.
- [x] Review and confirmation summary before any mutation.
- [x] One transaction for batch ledger, selected and excluded decisions, target enrollments, source lifecycle updates, and audit logging.
- [x] Existing target-year enrollment, duplicate decision, class capacity, year order, and repeat-class validation.
- [x] Soft full-batch reversal that cancels target enrollments and restores prior lifecycle state when no later attendance or manual changes exist.
- [x] Responsive promotion workspace, recent batch history, and permission-aware navigation.
- [x] Focused schema, tenant boundary, transaction, audit, reversal, and UI/navigation tests.
- [ ] Apply the additive student-promotion migration to the approved deployment database.
- [ ] Run DB-backed Principal promotion/reversal and Teacher/Staff denial browser QA.

Acceptance criteria:

- Client input cannot select tenant, branch, actor, role, source enrollment status, or target enrollment status.
- Only active source-class enrollments are eligible and every omitted roster student is recorded as excluded.
- Promoted and repeating students receive one active target-year enrollment; transferred and school-left students do not.
- Source enrollments, attendance, future result/fee history, and class history are never deleted or moved between academic years.
- Reversal never deletes history and is blocked after target attendance or later lifecycle changes.
- Result publication is an explicit audited attestation until the approved GradeBook module provides a machine-verifiable result state.
- New admissions and imports remain separate from promotion.

## Phase 11 - GradeBook MVP

Goal: introduce a tenant-safe assessment and marks ledger without duplicating Academia data or disrupting existing school workflows.

### 11.1 Controlled Foundation

- [x] Define GradeBook ownership and CampusCore/Academia integration boundaries.
- [x] Add additive class-subject, assessment, and marks models with tenant, branch, and academic-year scoping.
- [x] Add a disabled-by-default `TenantSettings.gradebookEnabled` rollout flag.
- [x] Restrict feature enablement to the separate Administrator Portal and include the flag in platform audit history.
- [x] Add GradeBook permissions and Principal/Teacher defaults without granting Office Staff or Staff access.
- [x] Add strict Zod schemas that reject client-owned scope and duplicate enrollment results.
- [x] Add transactional services for assignment, assessment creation, marks entry, publication, reopen, and cancellation.
- [x] Add assigned-class/subject Teacher restrictions and safe not-found behavior.
- [x] Add responsive GradeBook workspace, roster marks editor, lifecycle controls, and published summaries.
- [x] Add permission- and feature-aware desktop/mobile navigation.
- [x] Extend permanent school deletion ordering for GradeBook records.
- [x] Add focused schema, RBAC, tenant-boundary, publication, audit, navigation, and migration tests.

### 11.2 Release Gates

- [x] Apply `20260810213000_add_gradebook_foundation` to an approved non-production database with `prisma migrate deploy`.
- [ ] Apply `20260811201500_expand_gradebook_phase_0_1` to an approved staging database with `prisma migrate deploy`.
- [ ] Run DB-backed Principal class-subject, assessment, marks, publish, reopen, cancel, and report browser QA.
- [ ] Run DB-backed Principal configuration, examination readiness, schedule, assignment, import, result, correction, report-card, and publication QA.
- [x] Run Teacher assigned-class/subject access and unassigned-class denial QA.
- [ ] Run Office Staff, Staff, cross-branch, cross-year, and cross-tenant denial QA for the expanded workflows.
- [ ] Verify existing CampusCore, Academia, student promotion, student attendance, StaffBoard, leave, calendar, and QR smoke flows.
- [ ] Enable the expanded GradeBook only for one approved staging/pilot tenant after migration and storage verification.
- [ ] Deploy the expanded GradeBook through the approved release process and complete post-deployment smoke/observability review.
- [ ] Verify private marks-import storage, signed report-card downloads, and audit/outbox records.
- [ ] Stabilize the expanded pilot and approve GradeBook for broad tenant enablement.
- [x] Record the controlled-release gate matrix, migration safety audit, staging procedure, and recovery strategy in `docs/gradebook-controlled-release.md`.

### 11.3 Approved Expanded MVP Handoff

- [x] Add disabled-by-default subfeature rollout controls.
- [x] Add versioned schemes, terms, exam types, grade scales, and calculation rules.
- [x] Add examination class-section/subject/component scope, schedules, readiness, and teacher assignments.
- [x] Add roster-snapshot marks batches, optimistic versions, revisions, and submit/verify/approve/lock workflows.
- [x] Add private CSV/XLSX marks-import staging, validation, apply, and cancellation.
- [x] Add deterministic Decimal result runs, independent approval, adjustments, and correction versions.
- [x] Add co-scholastic evaluation, subject/class-teacher/Principal remarks, and attendance snapshots.
- [x] Add versioned report-card templates, immutable snapshots, private PDFs, approval, and controlled publication.
- [x] Add approved-result analytics and academic history.
- [x] Extend tenant deletion, navigation, environment validation, safe errors, documentation, and focused tests.

### 11.4 Deferred GradeBook Scope

- Parent/student account portals and `/portal/results` until account roles and portal policy are approved.
- Transcripts, hall tickets, and board-specific statutory report-card layouts.
- GradeBook notification delivery through SchoolCast.
- Subject teacher workload/timetable automation outside examination assignment.
- GradeBook-driven promotion eligibility and automatic lifecycle mutation.
- Broad production rollout before staging migration, role-matrix QA, storage QA, load testing, and pilot stabilization.

### 11.5 SchoolCast Gate

- [ ] Do not begin complete SchoolCast MVP implementation until every GradeBook release gate above is complete and the deployed pilot is stable.
- [ ] After GradeBook stabilization, begin SchoolCast discovery with its own PRD, ownership boundaries, consent/delivery policy, feature flag, migrations, and rollout gates.

Acceptance criteria:

- Existing tenants see no GradeBook UI or behavior until explicitly enabled.
- Existing production data and workflows remain unchanged by the additive migration.
- School users cannot self-enable the module or bypass GradeBook permissions.
- Teachers never gain broad class access through navigation alone.
- Published result history remains traceable and cannot be silently overwritten.
- Rollback disables the flag and reverts application code while retaining additive GradeBook tables until a separately approved data-retention decision.

## Final Delivery Checklist

- [ ] CampusCore schema complete
- [ ] Academia schema complete
- [ ] StaffBoard Lite schema complete
- [ ] RBAC utility implemented
- [ ] Tenant context implemented
- [ ] Audit logger implemented
- [ ] Zod schemas created
- [ ] Core services created
- [ ] Student attendance workflow implemented
- [ ] QR staff attendance workflow implemented
- [ ] Attendance notification foundation implemented
- [ ] Basic reports implemented
- [ ] Dashboard cards implemented
- [ ] Tests/checks completed or documented
