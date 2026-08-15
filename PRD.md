# PRD.md — JinaCampus First Development PRD

## 1. Product Overview
JinaCampus is a production-grade, multi-tenant School Management SaaS for Indian schools.

Brand:

> JinaCampus - The Complete School OS, powered by Parshwa Insights

The first development phase creates the foundation for a reliable school operations platform with secure tenant isolation, role-based access, audit logs, student academic records, student attendance, staff profiles, QR-based staff attendance, and a lightweight attendance notification foundation.

## 2. First Development Goal
Build the initial production-ready foundation for:

1. CampusCore
2. Academia
3. StaffBoard Lite

The goal is to deliver a strong modular monolith foundation that can later support GradeBook, FeeDesk, SchoolCast, InsightBoard, CampusFleet, BookNest, AssetRoom, full StaffBoard HR, and mobile apps.

## 3. Non-Goals for First Development
Do not build the following in this phase:

- Fee collection
- Receipts
- Advanced exam scheduling, report-card generation, transcripts, and grading-scale automation beyond the approved GradeBook MVP
- Full SchoolCast communication module, except the approved disabled-by-default attendance notification foundation
- Advanced dashboards
- Payroll
- Payroll-linked leave settlement (staff leave applications and basic balances are approved separately)
- Biometric attendance
- Transport
- Library
- Inventory
- Native mobile apps

## 3.1 Strategic Decision — Base Application Polish Before New Modules
Before starting the next product MVP module such as FeeDesk, GradeBook, or SchoolCast, JinaCampus will complete a Base Application Polish & Usability Hardening phase.

Reason: the current MVP foundation is technically strong, but a school SaaS must feel smooth, reliable, mobile-friendly, and demo-ready before expanding into additional business modules.

### Phase 9 Overview

1. 9.1 Core Edit Flows
2. 9.2 Form UX Polish
3. 9.3 Empty / Loading / Error State Polish
4. 9.4 Table and Filter Polish
5. 9.5 Role-Based Navigation Polish
6. 9.6 Dashboard UX Polish
7. 9.7 Authenticated Mobile QA
8. 9.8 Demo Seed Data
9. 9.9 Final Base MVP Smoke Checklist

### Phase 9 Non-Goals

- FeeDesk
- GradeBook
- SchoolCast
- Native mobile app
- Payroll
- Biometric attendance
- Exports/charts unless explicitly requested

Phase 9 and the approved Base MVP stabilization gates are complete enough for the explicitly approved GradeBook MVP described in section 6.4. FeeDesk remains a separate future module. Full SchoolCast is approved as a separately feature-gated module in section 6.5 and must remain disabled until its release gates pass.

### Phase 9 User Experience Goals

- Smoother create/edit forms with clear validation and actions.
- Clearer role-based navigation for principal/admin, teacher, and staff users.
- Better mobile usage across attendance, QR, reports, and dashboard flows.
- Better empty, loading, and error states across core pages.
- Stronger demo readiness through safe seeded data and smoke checklists.

## 4. Target Users and Roles

JinaCampus uses five canonical operational roles. A human signs in through one
tenant-scoped user account and may hold multiple role assignments; effective
permissions are merged server-side.

### 4.0 JinaCampus Administrator
Manages school tenants, School IDs, platform lifecycle, and platform audit/governance through the separate administrator portal. This operator-only role is provisioned separately and cannot be assigned by a school principal.

### 4.1 Principal
Manages school settings, branches, users, students, staff, attendance, and reports inside authorized tenant and branch scope. A Principal may assign only Office Staff, Teacher, and Staff roles.

### 4.2 Office Staff
Performs explicitly permitted branch operations such as QR generation, attendance correction, and attendance reports. Office Staff receives no user or role governance by default.

### 4.3 Teacher
Views assigned class-sections and students, marks student attendance, and uses self staff-attendance workflows where linked to a staff profile.

### 4.4 Staff
Uses own QR attendance, own attendance status, and account access only unless an additional role grants more permissions.

Parent and student account portals remain deferred. Legacy role codes are migration aliases only and are not new operational roles.

### 4.5 Fast Login

- School users enter School ID plus employee code or email.
- A registered passkey is the preferred fast-login method.
- Employee-code/email and case-sensitive password remains a permanent fallback.
- Passkeys require HTTPS, are tenant-scoped, and never send biometric data to JinaCampus.
- Authorization is always resolved from server-side role and permission assignments; users never select a role to grant themselves access.
- A temporary password marked for change must be replaced before passkey enrollment.

## 5. Core Product Principles

1. Tenant-safe by default
2. Permission-gated by default
3. Audit-ready for sensitive changes
4. Financial-module-ready, but no finance implementation yet
5. Academic-year-aware for academic records
6. Branch-aware for school operations
7. Clean UI for daily school staff usage
8. Extensible module structure
9. Strong server-side validation
10. Production-grade code organization

## 6. Module Requirements

## 6.1 CampusCore
CampusCore is the platform foundation.

### Required Features

- Tenant model
- Institution model
- Branch model
- Academic year model
- Academic and institutional holiday/non-working-day calendar
- User model
- Role model
- Permission model
- Role-permission assignment
- User-role assignment
- User branch access where required
- Tenant settings
- Attendance settings
- Tenant context resolver
- RBAC guard
- Audit logging utility
- App shell with role-aware navigation

### CampusCore Acceptance Criteria

- Every tenant-owned query is scoped by `tenantId`.
- Branch-scoped operations verify `branchId` access.
- Permissions are checked server-side.
- Default roles and permissions can be seeded.
- Audit logs can be created for critical actions.
- Active academic year can be identified per tenant/branch.
- Authorised calendar changes are tenant-, institution-, branch-, and academic-year-scoped and audited.
- App shell can show tenant, branch, and academic year context.

## 6.2 Academia
Academia manages academic setup, student records, enrollment, and student attendance.

### Required Features

- Classes
- Sections
- Class Sections
- Subjects
- Students
- Student admission-sheet registration with scholar/admission number, admission date, full name, DOB, parent names, masked Aadhaar reference, demographic fields, address, and optional masked bank details
- Minimal student roster import using Scholar Number, Student Name, Date of Birth, Current Class, Contact Number, Father's Name, and Mother's Name; additional admission fields remain optional and can be completed later
- Guardians
- Student Guardian Links
- Enrollments
- Class-wise student promotion with selected-student outcomes and historical enrollment preservation
- Daily Full-Day Class-Section Attendance
- Basic attendance reports
- WhatsApp attendance notification outbox foundation for guardian alerts, disabled by default

### Student Attendance Method
The MVP uses Daily Full-Day Class-Section Attendance.

Required attendance capabilities:

1. Class-section selection
2. Active enrolled student list
3. Mark all present
4. Individual status changes
5. Absent, late, half-day, on-leave, excused statuses
6. Teacher submit
7. Admin correction
8. Auto-locking after configured cutoff
9. Parent absence alert event placeholder
10. Audit logs
11. Student-wise and class-wise reports

### Student Attendance Statuses

- `PRESENT`
- `ABSENT`
- `LATE`
- `HALF_DAY`
- `ON_LEAVE`
- `EXCUSED`
- `NOT_MARKED`

### Student Attendance Rules

- One active student enrollment receives one attendance record per school day for `FULL_DAY`.
- Student holidays and non-working days are excluded from attendance marking, working-day totals, percentages, and classes-not-marked reporting.
- Unique key: `tenantId + academicYearId + studentId + attendanceDate + sessionType`.
- Teachers can mark only assigned class-sections.
- Admins can mark any class-section within assigned branch scope.
- After cutoff/lock, correction requires admin/principal permission and reason.
- Absence alert placeholder is created for `ABSENT`, and optionally `LATE` / `HALF_DAY` based on settings.

### Academia Acceptance Criteria

- Student records are tenant-scoped.
- Admission number is unique within tenant.
- Student registration validates required admission-sheet fields server-side.
- Bulk roster import validates its separate seven-field minimum contract server-side, imports valid rows, reports invalid rows separately, and identifies records that still need full admission details.
- Full Aadhaar and bank account numbers are not exposed or stored as plaintext; only masked references and last-four digits are retained until approved encrypted storage exists.
- Enrollments are academic-year-scoped.
- Promotion creates new target-year enrollments only for promoted or repeating students and preserves every source-year enrollment.
- Promotion decisions, excluded students, reversals, actor, scope, and timestamps remain auditable and tenant/branch scoped.
- Active enrolled student list excludes inactive/withdrawn students.
- Attendance submission is transactional.
- Duplicate attendance records are prevented.
- Attendance correction stores before/after values in audit log.

## 6.3 StaffBoard Lite
StaffBoard Lite manages staff profiles, QR-based staff attendance, and the approved staff leave workflow.

### Required Features

1. Staff profiles
2. Staff categories
3. Daily staff attendance using QR scan
4. Check-in/check-out
5. Late, half-day, absent status
6. Manual correction with reason
7. Staff attendance reports
8. Dashboard cards
9. Staff leave applications and supporting documents
10. Branch-configured leave types, balances, and approvers
11. Leave review, clarification, approval, rejection, withdrawal, and cancellation
12. Approved-leave synchronization with staff attendance
13. In-system leave updates and consent-controlled WhatsApp outbox events

### Staff Categories

- `TEACHER`
- `ADMIN`
- `ACCOUNTANT`
- `LIBRARIAN`
- `DRIVER`
- `HELPER`
- `SECURITY`
- `PEON`
- `CLEANING_STAFF`
- `MANAGEMENT`
- `OTHER`

### Staff Attendance Method
The MVP uses QR Scan-based Check-in / Check-out Attendance.

### Staff QR Attendance Flow

```txt
Staff arrives at school
→ Staff opens JinaCampus on mobile
→ Staff scans active QR code displayed at school/gate/office
→ System validates tenant, branch, user, QR token, purpose, and time window
→ Check-in is recorded
→ Late rule is applied automatically
→ Staff scans again at departure
→ Check-out is recorded
→ Working duration is calculated
→ Final status is generated
→ Audit log is created
```

### QR Rules

- QR code is tenant-scoped.
- QR code is branch-scoped.
- QR code is time-bound.
- QR generation is restricted server-side to Principals and permissioned Office Staff QR Operators.
- Every newly generated QR is valid for a fixed 5-hour window (18,000 seconds).
- Regeneration atomically deactivates the prior active code for the same branch and purpose.
- Operators can explicitly deactivate an active code.
- Lifecycle status is `ACTIVE`, `DEACTIVATED`, or `EXPIRED`; acceptance always checks the time window server-side.
- Raw token must not be stored; store token hash.
- Staff must be authenticated before scanning.
- Duplicate check-in must be prevented.
- Expired QR must be rejected.
- Wrong-branch QR must be rejected unless explicitly allowed.
- Generation, regeneration, deactivation, expiry reconciliation, and successful use must be audited without raw QR data.
- Manual correction requires reason and permission.

### Attendance PWA Installation

- Authenticated mobile-web users can access a clear JinaCampus installation control.
- Supported Chromium browsers use the browser-provided install prompt after a direct user action.
- iPhone and iPad users receive Safari Add to Home Screen guidance when no programmable prompt exists.
- Installed use remains online-first and must preserve secure login, responsive permission-aware navigation, camera permission behavior, server-side tenant/RBAC enforcement, and audit logging.
- Offline attendance submission, background synchronization, and cached QR acceptance are not supported.

### Staff Attendance Statuses

- `PRESENT`
- `ABSENT`
- `LATE`
- `HALF_DAY`
- `ON_LEAVE`
- `WEEK_OFF`
- `HOLIDAY`
- `NOT_MARKED`

### Staff Attendance Sources

- `QR_SCAN`
- `MANUAL_ADMIN`
- `IMPORT`
- `BIOMETRIC`

Only `QR_SCAN` and `MANUAL_ADMIN` are implemented in first development. `IMPORT` and `BIOMETRIC` are enum values for future readiness only.

### StaffBoard Lite Acceptance Criteria

- Staff profile is tenant-scoped and branch-scoped.
- Employee code is unique within tenant.
- QR token generation requires permission.
- QR scan requires authenticated staff user.
- QR token expiry is enforced.
- QR token hash is stored, not raw token.
- Check-in/check-out are transactional.
- Late and half-day status are calculated from branch attendance settings.
- Manual correction requires reason and audit log.
- Leave applicants are resolved from the authenticated user's linked staff profile.
- Leave types, approvers, policy, balances, and applications are tenant- and branch-scoped.
- Leave totals, working dates, balance usage, and attendance status are calculated server-side.
- Approval is transactional and rejects overlapping leave, insufficient balance, required-document gaps, and conflicting attendance.
- Approved full-day leave is synchronized as `ON_LEAVE`; approved half-day leave is synchronized as `HALF_DAY`.
- Applicable staff holidays are paid `HOLIDAY` attendance records and cannot be overwritten by QR scans, leave approval, or manual correction.
- Staff can withdraw pending applications; authorized approvers can cancel only future approved leave without attendance activity.
- Every leave state, policy, approver, balance, and document change is audited.
- WhatsApp leave updates are disabled by default and require branch enablement, staff consent, an active template, and notification processing.

## 6.4 GradeBook MVP

GradeBook owns versioned assessment configuration, examinations, scoped marks entry/import, deterministic result calculation, corrections, report cards, controlled publication, approved-result analytics, and academic history. It references, but does not duplicate, CampusCore users/settings or Academia classes, sections, subjects, students, academic years, and enrollments.

### Required Features

1. Platform-controlled, tenant-specific feature enablement.
2. Disabled-by-default subfeature flags for configuration, marks, import, calculation, co-scholastic, report cards, publication, analytics, and reserved portal access.
3. Versioned assessment schemes, terms, exam types, grade scales, and calculation rules.
4. Examination class-section, subject, component, timetable, readiness, and teacher-assignment workflows.
5. Active-enrollment roster snapshots and optimistic-version marks batches.
6. Numeric Decimal marks plus authorised special statuses and immutable revisions.
7. Draft, submit, return, verify, approve, lock, reopen, and cancel state transitions.
8. Private CSV/XLSX marks import with staged validation and transactional apply.
9. Deterministic, hashed, idempotent subject and overall result runs with explicit approval.
10. Audited mark adjustments and correction/replacement versions rather than in-place official-result edits.
11. Subject/class-teacher/Principal remarks, co-scholastic evaluations, and attendance-summary snapshots.
12. Versioned report-card templates, immutable snapshots, private PDF objects, approval, and signed downloads.
13. Prepared/published/revoked recipient publication versions.
14. Approved-result analytics and immutable academic history.
15. Principal governance and exact exam/class-section/subject/component Teacher access.

### Integration Boundaries

- CampusCore owns tenants, branch access, active academic-year context, users, roles, permissions, feature enablement, and audit infrastructure.
- Academia owns classes, sections, class-sections, subjects, students, and enrollments.
- GradeBook never creates or mutates Student or Enrollment records.
- Marks reference the active enrollment and server-derived student identity; client-supplied tenant, branch, academic year, student, actor, role, and permission claims are rejected or ignored.
- Student attendance and GradeBook remain separate records. Attendance does not implicitly create marks, and marks do not alter attendance.
- Attendance enters GradeBook only through an explicit, immutable attendance-summary snapshot for an approved report-card period.
- Student promotion continues to preserve historical enrollments. GradeBook does not automatically promote or change student lifecycle state.
- Platform Administrators control rollout flags but do not receive routine tenant academic access.

### GradeBook Acceptance Criteria

- The module remains inaccessible and absent from navigation while `TenantSettings.gradebookEnabled` is false.
- Enabling the module requires the separate JinaCampus Administrator Portal; school users cannot self-enable it.
- Every query and mutation is tenant-, branch-, and academic-year-scoped and permission checked server-side.
- Teachers can access only exact active assignments for an exam, class-section, subject, and optional component.
- Marks batches retain activation-time roster snapshots and student identity is derived server-side.
- Decimal calculations use frozen configuration, explicit rounding, canonical hashes, and repeatable idempotency keys.
- Grade scales reject overlaps/gaps, component rules reject invalid maxima/pass/weightage, and schedule conflicts fail safely.
- Official results and report cards are immutable versions; approved data changes only through audited correction/replacement workflows.
- Publication is blocked until required results and report cards are approved.
- Imports and report-card documents remain private and are accessed only through authorised server routes and short-lived signed URLs.
- Marks, workflow transitions, assignments, results, corrections, report cards, publications, configuration, and enrichment changes are audited.
- Migration, authenticated role-matrix QA, regression checks, and pilot stabilization pass before broad enablement.
- Parent/student portals, transcripts, hall tickets, board-specific statutory layouts, GradeBook notifications, and automated promotion eligibility remain deferred.

## 6.5 Full SchoolCast MVP

SchoolCast owns governed institutional communication through in-application notifications, email, and WhatsApp. It provides notices, circulars, broadcasts, approvals, scheduling, recipient snapshots, consent and preferences, delivery tracking, acknowledgements, private attachments, and the dedicated Everyday Homework and Classwork workflow.

### Required Features

1. Platform-controlled, tenant-specific feature enablement with every flag disabled by default.
2. In-application inbox, read state, acknowledgement, and safe deep links.
3. Versioned notices, circulars, broadcasts, and emergency communications.
4. Server-resolved audiences with immutable recipient and channel-eligibility snapshots.
5. Approval, rejection, return, scheduling, publication, cancellation, and audit history.
6. Everyday Homework and Classwork for exact assigned class-section and subject scope.
7. Recipient preferences and purpose/channel consent without public account enumeration.
8. Private attachments with signature validation, malware-scan gating, tenant-safe object paths, and short-lived signed access.
9. Email and WhatsApp provider abstractions using server-only secret references and approved provider templates.
10. DRY_RUN-first delivery, deterministic idempotency, leased workers, bounded retries, and duplicate-safe webhook reconciliation.
11. Delivery, failure, read, acknowledgement, provider health, and analytics views using masked operational metadata.
12. Domain-event integration contracts for attendance, GradeBook, FeeDesk, leave, and calendar sources without provider calls inside source transactions.

### Integration Boundaries

- CampusCore owns tenants, institutions, branches, academic years, users, roles, settings, time zones, branding, and audit infrastructure.
- Academia owns classes, sections, subjects, teacher assignments, students, guardians, enrollments, and contact-source records.
- Attendance, GradeBook, FeeDesk, staff leave, and institutional calendar records remain owned by their source modules.
- SchoolCast stores immutable communication, audience, eligibility, attachment, outbox, delivery, consent, and acknowledgement evidence. It does not mutate marks, fees, attendance, leave, identities, or enrollments.
- Source modules commit their business record and domain outbox event first. SchoolCast consumes approved contracts asynchronously and never calls an external provider from a source-module transaction.
- Platform Administrators control pilot flags and provider readiness but do not receive routine tenant communication access.

### SchoolCast Acceptance Criteria

- SchoolCast routes and navigation remain unavailable while `TenantSettings.schoolCastEnabled` is false.
- School users cannot enable SchoolCast, expose provider secrets, or switch a provider to live mode.
- Every query, mutation, file operation, worker claim, webhook mapping, and audit record is tenant-scoped; branch and academic-year scope are enforced when applicable.
- Teachers can create Homework/Classwork only for active assigned class-section and subject scope.
- Communication content, audience rules, channel plans, recipient eligibility, and delivery payloads are versioned or snapshotted before publication.
- Consent withdrawal, channel preferences, unavailable contacts, disabled channels, and provider readiness produce explicit exclusions rather than unsafe fallback delivery.
- In-application delivery is created transactionally; external delivery is queued and processed asynchronously.
- Attachment publication is blocked until every current attachment is marked safe by the approved scanner.
- Email and WhatsApp remain DRY_RUN or TEST until provider credentials, sender identity, templates, consent, legal review, billing, webhooks, and pilot QA are approved.
- Retry and webhook handling are idempotent and do not expose raw contacts, provider secrets, payload tokens, or internal errors.
- Additive migration, private-storage setup, authenticated role/scope QA, worker/load certification, provider contract tests, and rollback rehearsal pass before production enablement.

## 7. Data Model Requirements

Required Prisma models:

### CampusCore

- `Tenant`
- `Institution`
- `Branch`
- `AcademicYear`
- `User`
- `Role`
- `Permission`
- `RolePermission`
- `UserRoleAssignment`
- `UserBranchAccess`
- `TenantSettings`
- `AttendanceSetting`
- `AuditLog`

### Academia

- `Class`
- `Section`
- `ClassSection`
- `Subject`
- `Student`
- `Guardian`
- `StudentGuardianLink`
- `Enrollment`
- `StudentAttendanceRecord`

### GradeBook

- `ClassSectionSubject`
- `GradebookAssessment`
- `GradebookMark`
- `GradebookAssessmentScheme` and `GradebookAssessmentSchemeVersion`
- `GradebookExamTerm`, `GradebookExamType`, and `GradebookExam`
- `GradebookGradeScale`, `GradebookGradeScaleVersion`, and `GradebookGradeRule`
- `GradebookCalculationRuleSet` and `GradebookCalculationRuleSetVersion`
- `GradebookExamClassSection`, `GradebookExamSubject`, and `GradebookExamSubjectComponent`
- `GradebookExamSchedule` and `GradebookTeacherMarkAssignment`
- `GradebookMarkEntryBatch`, `GradebookStudentMark`, `GradebookStudentMarkRevision`, and `GradebookMarkWorkflowEvent`
- `GradebookExamImportJob` and `GradebookExamImportRow`
- `GradebookResultRun`, `GradebookStudentSubjectResult`, and `GradebookStudentOverallResult`
- `GradebookMarkAdjustment` and `GradebookCorrectionRequest`
- `GradebookTeacherRemark`, `GradebookCoScholasticSchemeVersion`, `GradebookCoScholasticArea`, `GradebookCoScholasticIndicator`, and `GradebookCoScholasticEntry`
- `GradebookAttendanceSummarySnapshot`
- `GradebookReportCardTemplate`, `GradebookReportCardTemplateVersion`, and `GradebookReportCard`
- `GradebookResultPublication` and `GradebookStudentResultPublication`
- `GradebookJob` and `GradebookDomainEventOutbox`

### SchoolCast

- `SchoolCastCommunication` and `SchoolCastCommunicationVersion`
- `SchoolCastAudienceRule`, `SchoolCastRecipientSnapshot`, and `SchoolCastRecipientChannelEligibility`
- `SchoolCastChannelPlan`
- `SchoolCastApproval` and `SchoolCastApprovalAction`
- `SchoolCastTemplateVersion`
- `SchoolCastProviderConfiguration`
- `SchoolCastConsentRecord` and generalized `CommunicationPreference`
- `SchoolCastAttachment`
- `SchoolCastHomeworkItem` and `SchoolCastHomeworkVersion`
- `SchoolCastAcknowledgement` and generalized `InAppNotification`
- generalized `NotificationOutbox`
- `SchoolCastDeliveryAttempt` and `SchoolCastDeliveryEvent`
- `SchoolCastDomainEvent`
### StaffBoard Lite

- `StaffProfile`
- `StaffAttendanceRecord`
- `StaffAttendanceQrToken`
- `StaffLeaveSetting`
- `StaffLeaveType`
- `StaffLeaveApprover`
- `StaffLeaveBalance`
- `StaffLeaveApplication`
- `StaffLeaveApplicationAction`
- `StaffLeaveDocument`
- `InAppNotification`

### Optional Foundation

- `CommunicationPreference`
- `NotificationTemplate`
- `NotificationOutbox`
- `NotificationDeliveryLog`
- `WhatsAppIntegrationSetting`

The original attendance notification foundation remains backward compatible and is generalized by the separately feature-gated Full SchoolCast module.

## 8. Permission Requirements

### CampusCore Permissions

- `campuscore.tenant.view`
- `campuscore.institution.manage`
- `campuscore.branch.manage`
- `campuscore.academic_year.manage`
- `campuscore.calendar.manage`
- `campuscore.user.view`
- `campuscore.user.create`
- `campuscore.user.update`
- `campuscore.role.view`
- `campuscore.role.manage`
- `campuscore.audit.view`
- `campuscore.settings.manage`

### Academia Permissions

- `academia.class.manage`
- `academia.section.manage`
- `academia.subject.manage`
- `academia.student.view`
- `academia.student.create`
- `academia.student.update`
- `academia.guardian.manage`
- `academia.enrollment.manage`
- `academia.attendance.view`
- `academia.attendance.mark`
- `academia.attendance.update`
- `academia.attendance.correct`
- `academia.attendance.lock`
- `academia.attendance.report`

### GradeBook Permissions

- `gradebook.view`
- `gradebook.setup.manage`
- `gradebook.assessment.manage`
- `gradebook.marks.enter`
- `gradebook.publish`
- `gradebook.report`

### SchoolCast Permissions

- `schoolcast.dashboard.view`
- `schoolcast.communication.*` for create/edit/submit/review/approve/publish/schedule/cancel/history actions
- `schoolcast.audience.*` for preview and server-resolved targeting
- `schoolcast.homework.*` for assigned Homework/Classwork workflows
- `schoolcast.inbox.*`, `schoolcast.preference.*`, and `schoolcast.consent.*` for recipient access
- `schoolcast.attachment.*` for private media and documents
- `schoolcast.template.*`, `schoolcast.provider.*`, and `schoolcast.settings.*` for governed configuration
- `schoolcast.outbox.*` and `schoolcast.delivery.*` for authorised operations
- `schoolcast.automation.*`, `schoolcast.analytics.*`, and `schoolcast.audit.*` for controlled integrations and reporting
### StaffBoard Lite Permissions

- `staffboard.staff.view`
- `staffboard.staff.create`
- `staffboard.staff.update`
- `staffboard.attendance.qr.generate`
- `staffboard.attendance.self_scan`
- `staffboard.attendance.self_view`
- `staffboard.attendance.view`
- `staffboard.attendance.correct`
- `staffboard.attendance.report`
- `staffboard.leave.self_apply`
- `staffboard.leave.self_view`
- `staffboard.leave.view`
- `staffboard.leave.approve`
- `staffboard.leave.settings.manage`
- `staffboard.leave.balance.manage`

### Notification Foundation Permissions

- `notifications.settings.manage`
- `notifications.outbox.view`
- `notifications.outbox.process`
- `notifications.whatsapp.manage`

## 9. UI Route Requirements

### CampusCore Routes

- `/dashboard`
- `/attendance-login`
- `/account/workspaces`
- `/campus-core/institutions`
- `/campus-core/branches`
- `/campus-core/academic-years`
- `/campus-core/calendar`
- `/campus-core/users`
- `/campus-core/roles`
- `/campus-core/settings`
- `/campus-core/readiness`
- `/campus-core/audit-logs`

### Academia Routes

- `/academia/classes`
- `/academia/sections`
- `/academia/class-sections`
- `/academia/subjects`
- `/academia/students`
- `/academia/guardians`
- `/academia/enrollments`
- `/academia/attendance`
- `/academia/attendance/reports`

### SchoolCast Routes

- `/schoolcast`
- `/schoolcast/communications`
- `/schoolcast/notices`
- `/schoolcast/broadcasts`
- `/schoolcast/approvals`
- `/schoolcast/homework`
- `/schoolcast/delivery`
- `/schoolcast/templates`
- `/schoolcast/calendar`
- `/schoolcast/analytics`
- `/schoolcast/settings`
- `/notifications`
### StaffBoard Lite Routes

- `/staffboard/staff`
- `/staffboard/categories`
- `/staffboard/attendance`
- `/staffboard/attendance/qr`
- `/staffboard/attendance/scan`
- `/staffboard/attendance/me`
- `/staffboard/attendance/reports`
- `/staffboard/leave`
- `/staffboard/leave/apply`
- `/staffboard/leave/review`
- `/staffboard/leave/[applicationId]`
- `/staffboard/leave/[applicationId]/edit`
- `/staffboard/leave/settings`

## 10. Reporting Requirements

### Student Attendance Reports

- Daily class attendance
- Class-wise attendance report
- Student-wise attendance history
- Monthly attendance percentage
- Absent students list
- Late students list
- Classes not marked report

### Staff Attendance Reports

- Daily staff attendance
- Teacher attendance report
- Non-teaching staff attendance report
- Late arrival report
- Half-day report
- Monthly staff attendance summary
- Manual correction report

Reports can be table-first in first development. Export may be deferred unless simple CSV export is low-risk.

## 11. Dashboard Card Requirements

### CampusCore Cards

- Total branches
- Active academic year
- Total users
- Active roles

### Academia Cards

- Total students
- Active enrollments
- Students present today
- Students absent today
- Classes not marked today

### StaffBoard Lite Cards

- Total staff
- Staff checked in today
- Staff late today
- Staff absent today
- Staff half-day today

## 12. Non-Functional Requirements

### Security

- Server-side authorization for all protected actions
- Tenant-safe queries
- Branch access checks
- Zod input validation
- Secure QR token handling
- Audit logs for sensitive mutations

### Performance

- Index common tenant/branch/date/status filters
- Avoid unbounded lists
- Use pagination for tables
- Avoid N+1 queries for attendance lists

### Reliability

- Transactional attendance submission
- Transactional QR scan handling
- Notification queue failures must not block attendance submission
- Idempotent handling where practical
- Clear error messages

### Maintainability

- Modular folder structure
- Clear service layer
- No business logic inside UI components
- Typed errors or structured service results

## 13. Definition of Done
A feature is done only when:

1. Data model is tenant-safe.
2. Input is validated with Zod.
3. Permissions are checked server-side.
4. Critical mutations are audited.
5. UI handles loading, empty, error, and success states.
6. Tests are added or clearly proposed.
7. Lint/typecheck/build are run if available.
8. Known limitations are documented.
