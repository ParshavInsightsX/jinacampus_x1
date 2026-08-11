# JinaCampus GradeBook MVP

## Status

Development foundation and the controlled staging pilot were verified and deployed on 10 August 2026. The additive migration is applied to the approved staging database, GradeBook is enabled for `jinacampus-demo`, and authenticated Principal, Teacher, and cross-tenant browser QA passed before and after deployment. GradeBook remains disabled by default for other institutions; broad rollout and pilot stabilization remain pending.

## Product Boundary

GradeBook is an assessment and marks ledger. It owns:

- Class-section subject and subject-teacher assignments.
- Assessments and their Open, Published, or Cancelled lifecycle.
- Enrollment-linked result entries.
- Published assessment summaries.

It reuses, without duplicating:

- CampusCore tenant, institution, branch, academic-year, user, role, permission, feature-setting, and audit records.
- Academia class, section, class-section, subject, student, and enrollment records.

GradeBook does not change attendance, student lifecycle, enrollment history, or promotion decisions. Full examination scheduling, weighted terms, grading scales, report cards, transcripts, parent/student portals, and notification delivery are deferred.

## Access Model

| Capability | Principal | Teacher | Office Staff | Staff |
|---|---:|---:|---:|---:|
| View GradeBook | Yes | Assigned scope | No | No |
| Configure class subjects | Yes | No | No | No |
| Create/cancel assessments | Yes | No | No | No |
| Enter marks | Yes | Assigned scope | No | No |
| Publish/reopen results | Yes | No | No | No |
| View published reports | Yes | Assigned scope | No | No |

Teacher scope is resolved server-side. A Teacher must be the class teacher or assigned subject teacher for the assessment. An inaccessible assessment returns the same safe not-found behavior as a missing record.

## Data Model

`ClassSectionSubject` links an existing class-section and subject, with an optional Teacher user. `GradebookAssessment` owns assessment metadata and publication state. `GradebookMark` links an assessment to an active Enrollment and repeats the server-derived Student identifier for scoped reporting and integrity checks.

All three models include `tenantId`, `branchId`, and `academicYearId`, indexed for operational queries. Unique constraints prevent duplicate class subjects, assessment codes within a class subject, and results for the same assessment/enrollment.

The migration is additive:

`prisma/migrations/20260810213000_add_gradebook_foundation/migration.sql`

It creates the models and permissions, adds `TenantSettings.gradebookEnabled` with a `false` default, assigns role defaults, and enables RLS without public policies. Server-side Prisma access, session context, and RBAC remain authoritative.

## Workflows

### Setup

1. An Administrator enables GradeBook for an approved tenant.
2. A Principal assigns existing Academia subjects to active class-sections.
3. The Principal may assign an active, branch-authorised Teacher.

### Assessment and Marks

1. A Principal creates an assessment for an active class subject.
2. The marks page loads only active enrollments from that class-section.
3. An authorised user records Graded, Absent, or Exempt results.
4. GradeBook derives student identity from Enrollment and rejects client-owned scope.
5. Marks entry and publication serialize on the assessment state so publishing cannot race a late save.

### Publication

Publication requires one result for every active enrollment. Published results become read-only. A Principal must supply an audited reason to reopen them. An open assessment may be cancelled with an audited reason; published assessments must be reopened first.

## Audit and Security

- Class-subject assignment/update, assessment creation, marks changes, publication, reopen, and cancellation are audited.
- Marks audit records retain before/after result values for correction traceability.
- Passwords, session tokens, QR payloads, and credential material never enter GradeBook responses or audit metadata.
- Inputs do not accept tenant, branch, academic year, student, actor, role, permission, or publication status claims.
- Queries require active session context, branch access, academic-year scope, tenant flag, and explicit permission.
- Administrator school deletion removes GradeBook marks, assessments, and assignments in dependency-safe order.

## Routes

- `/gradebook` - setup and assessment workspace.
- `/gradebook/assessments/[assessmentId]` - roster marks ledger and lifecycle controls.
- `/gradebook/reports` - published assessment summaries and links to read-only ledgers.

## Rollout Plan

1. Run Prisma format, validate, and generate.
2. Apply the additive migration to an approved non-production database before deploying application code.
3. Keep every tenant flag disabled.
4. Run Principal and Teacher DB-backed browser QA plus Office Staff/Staff/cross-branch/cross-tenant denials.
5. Run regression smoke across existing CampusCore, Academia, promotion, attendance, StaffBoard, leave, calendar, and QR workflows.
6. Enable one approved pilot tenant from the Administrator Portal.
7. Deploy, run post-deployment smoke, and monitor application/database errors.
8. Expand only after pilot stabilization and explicit approval.

## Rollback

Disable `gradebookEnabled` first. This immediately removes GradeBook navigation and rejects direct GradeBook access. If required, revert the application release while retaining the additive tables and column. Do not run a destructive down migration after schools have entered marks. Any later schema removal or data archival requires a separate, approved retention plan.

## QA Checklist

- Principal can assign an active subject and branch-authorised Teacher.
- Duplicate assignment and invalid Teacher fail safely.
- Principal can create an in-year assessment; duplicate code and out-of-year date fail safely.
- Teacher sees only assigned class or subject assessments.
- Teacher cannot publish, cancel, configure subjects, or access unassigned assessments.
- Marks reject inactive/wrong-class/cross-tenant enrollments, duplicates, and values above maximum.
- Publishing fails with an incomplete roster and succeeds after all results exist.
- Published results are read-only; audited reopen restores editing.
- Cancellation retains history and requires a reason.
- Office Staff and Staff receive safe denial.
- Feature-disabled tenants have no GradeBook navigation and direct routes fail safely.
- Permanent school deletion handles GradeBook dependencies.
- Existing module smoke checks remain green.

## Staging Verification - 10 August 2026

| Check | Result | Evidence |
|---|---|---|
| Additive migration | Pass | `prisma migrate deploy` applied `20260810213000_add_gradebook_foundation`; `prisma migrate status` reports all 20 migrations applied. |
| Pilot feature flag | Pass | Enabled only for the approved `jinacampus-demo` pilot institution through the audited platform service. |
| Principal workflow | Pass | Assigned a subject and branch-authorised Teacher, created and cancelled an assessment, reviewed Teacher-entered marks, published the complete assessment, and opened the published report summary. |
| Teacher scope | Pass | Assigned assessment was visible and editable; setup, lifecycle controls, and an unassigned assessment remained unavailable through safe server-side denial. |
| Cross-tenant isolation | Pass | A disposable second-tenant Principal could not resolve the pilot assessment and received the same safe response as a missing record. |
| Existing-module browser smoke | Pass | Dashboard, Academia, and StaffBoard routes remained usable for the pilot Principal. |
| Protected school baseline | Pass | The non-pilot RDA institution was not mutated and its GradeBook flag remained disabled. |
| Automated release gates | Pass | Prisma format/validate/generate, typecheck, 106 test files with 880 tests, production build, and `git diff --check` passed. |
| Production deployment | Pass | The verified preview was promoted to the canonical production domain; health/database connectivity and authenticated Principal, Teacher, and cross-tenant smoke checks passed. |

Temporary QA identities used generated credentials kept outside Git. Their sessions were revoked, their JinaCampus users were deactivated, the disposable cross-tenant tenant was deleted, and the local secret state was removed after post-deployment smoke. No password, token, tenant identifier, or private database URL is recorded here.

## Remaining Gates

- Complete Office Staff, Staff, cross-branch, reopen, and broad existing-module regression QA before any rollout beyond the pilot.
- Stabilize GradeBook before beginning complete SchoolCast MVP development.
