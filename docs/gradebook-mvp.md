# JinaCampus GradeBook MVP

## Status

Implementation-ready application code is complete locally as of 11 August 2026 for the approved GradeBook developer handoff. The earlier assessment-ledger foundation migration (`20260810213000_add_gradebook_foundation`) remains the deployed pilot baseline. The expanded additive migration (`20260811201500_expand_gradebook_phase_0_1`) has been generated and validated locally but has **not** been applied to staging or production in this implementation task.

Controlled-release evidence, blockers, staging procedure, and recovery steps are maintained in `docs/gradebook-controlled-release.md`.

Every new GradeBook subfeature flag defaults to disabled. Existing institutions therefore retain their current behavior until an authorised JinaCampus Platform Administrator enables an approved pilot scope after migration and QA.

## Product Boundary

GradeBook owns:

- Versioned assessment schemes, terms, exam types, grade scales, and calculation rules.
- Examination class-section, subject, component, schedule, and teacher-assignment scope.
- Roster snapshots, marks-entry batches, immutable revisions, review, approval, and locking.
- Validated CSV/XLSX marks imports stored in private object storage.
- Deterministic result runs, subject/overall outcomes, adjustments, and correction requests.
- Subject/class-teacher/Principal remarks and co-scholastic evaluations.
- Attendance-summary snapshots used by report cards.
- Versioned report-card templates, immutable card snapshots, private PDFs, and publication records.
- Approved-result analytics and student academic history.

GradeBook references, without duplicating ownership of:

- CampusCore tenants, institutions, branches, academic years, users, roles, permissions, settings, and audits.
- Academia classes, sections, class-sections, subjects, students, enrollments, and class-subject teacher mappings.
- Student attendance records used only for explicit attendance-summary snapshots.

GradeBook never creates or mutates Student or Enrollment records. It does not change attendance, leave, fee, payroll, or promotion data.

## Rollout Controls

The Administrator Portal controls the master `gradebookEnabled` flag and these disabled-by-default subfeatures:

| Flag | Scope |
|---|---|
| `gradebookConfigurationEnabled` | Schemes, terms, exam types, grade scales, and calculation rules |
| `gradebookMarksEntryEnabled` | Exams, assignments, marks batches, review, and approval |
| `gradebookImportEnabled` | Private CSV/XLSX import validation and application |
| `gradebookResultCalculationEnabled` | Deterministic result snapshots and approvals |
| `gradebookCoScholasticEnabled` | Co-scholastic schemes, entries, and remarks |
| `gradebookReportCardsEnabled` | Templates, attendance snapshots, and private PDF generation |
| `gradebookPublicationEnabled` | Prepared, published, and revoked result versions |
| `gradebookAnalyticsEnabled` | Approved-result analytics and academic history |
| `gradebookPortalResultsEnabled` | Reserved for approved student/guardian portal access; no portal is exposed in this release |

School users cannot enable GradeBook or any subfeature.

## Access Model

| Capability | Principal | Teacher | Office Staff | Staff | Platform Administrator |
|---|---:|---:|---:|---:|---:|
| Configure GradeBook | Yes | No | No | No | Feature flags only |
| Create/schedule/activate exams | Yes | View assigned scope | No | No | No tenant access |
| Assign teachers | Yes | No | No | No | No tenant access |
| Enter/submit marks | Yes | Exact assigned scope | No | No | No tenant access |
| Verify/approve/lock marks | Yes | No by default | No | No | No tenant access |
| Calculate/approve results | Yes, with segregation rules | View assigned scope | No | No | No tenant access |
| Generate/approve/publish report cards | Yes, with segregation rules | View authorised cards | No | No | No tenant access |
| View analytics/history | Institution scope | Assigned class/subject/student scope | No | No | No tenant access |

Platform Administrators are separate identities stored outside tenant user roles. Their GradeBook responsibility is limited to pilot feature controls; they do not receive routine school academic access.

Teacher permission grants never provide broad data access. Marks and result services additionally require an active, time-valid teacher assignment matching the exact exam, class-section, subject, and optional component. Inaccessible records return safe not-found responses.

## Core Workflows

### Configuration

1. Principal creates draft schemes, terms, exam types, grade scales, and calculation rules.
2. Grade scales must cover 0-100 continuously with no overlaps or gaps at the configured precision.
3. Terms reject ambiguous date overlap unless explicitly allowed.
4. Configuration versions are hashed and activated explicitly; existing result runs retain their frozen version references.

### Examination Setup

1. Principal selects a term/type, class-sections, subjects, and components.
2. Components validate maximum marks, pass marks, and weightage totals.
3. Schedules reject conflicting class-section or room time windows.
4. Teacher assignments validate active tenant, branch access, Teacher role, source class-subject mapping, and override reasons.
5. Readiness requires active configuration, subjects/components, assignments, and schedules when the exam type requires them.
6. Activation creates roster-snapshot marks batches; later roster changes cannot silently alter an in-progress batch.

### Marks and Imports

1. Teacher opens only an exact assigned batch during its configured entry window.
2. Numeric marks use Prisma Decimal and cannot exceed component maximums.
3. Special statuses require permission and a reason where policy requires it.
4. Each save uses optimistic batch versions and writes immutable row revisions.
5. Batches move through draft, submitted, returned, verified, approved, and locked states using explicit transition rules.
6. CSV/XLSX imports are uploaded to private storage, parsed into staged rows, validated, and applied transactionally to an eligible batch. Invalid rows remain reviewable and do not partially mutate marks.

### Results and Corrections

1. Calculation requires approved or locked primary marks batches.
2. The pure result engine uses Prisma Decimal, explicit rounding modes, frozen configuration, and canonical hashes.
3. Idempotency keys prevent duplicate runs for unchanged inputs.
4. Result approval is independent from calculation where segregation of duties applies.
5. Approved data is never edited in place. Adjustments and correction requests create auditable replacement versions that supersede, rather than erase, prior results.

### Report Cards and Publication

1. An active versioned template and approved result run are required.
2. Optional attendance ranges create tenant-, branch-, year-, enrollment-, and period-scoped summary snapshots.
3. Report-card snapshot JSON is immutable and each generated PDF is stored under a private tenant-scoped object key.
4. Downloads use short-lived signed URLs after session, scope, feature, and permission checks.
5. Publication creates recipient-scoped records from approved cards. Publication and revocation are versioned and audited.

### Enrichment and Analytics

- Institution-defined co-scholastic areas and indicators are versioned before use.
- Subject, class-teacher, and Principal remarks use server-validated scope and permissions.
- Analytics read approved result snapshots only; they do not recompute or mutate official outcomes.
- Academic history links back to immutable result and report-card versions.

## Routes

| Area | Routes |
|---|---|
| Dashboard/configuration | `/gradebook`, `/gradebook/setup`, `/gradebook/schemes`, `/gradebook/terms`, `/gradebook/exam-types`, `/gradebook/grade-scales` |
| Examinations | `/gradebook/exams`, `/gradebook/exams/create`, `/gradebook/exams/[examId]`, `/gradebook/exams/[examId]/schedule`, `/gradebook/exams/[examId]/assignments` |
| Marks | `/gradebook/marks`, `/gradebook/marks/[batchId]`, `/gradebook/submissions`, `/gradebook/verification`, `/gradebook/approvals`, `/gradebook/imports` |
| Results | `/gradebook/results`, `/gradebook/results/[runId]`, `/gradebook/corrections`, `/gradebook/enrichment` |
| Report cards | `/gradebook/report-cards`, `/gradebook/publications` |
| Analysis/history | `/gradebook/analytics`, `/gradebook/history` |
| Legacy compatibility | `/gradebook/assessments/[assessmentId]`, `/gradebook/reports` |

Import and private report-card download Route Handlers live under `/api/gradebook` and return JSON or controlled file responses only.

## Storage Configuration

The GradeBook bucket must be private. Required server-only environment variables:

```env
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
GRADEBOOK_STORAGE_BUCKET=gradebook-private
GRADEBOOK_IMPORT_MAX_BYTES=10000000
GRADEBOOK_REPORT_CARD_MAX_BYTES=5000000
```

Never expose the service-role key through `NEXT_PUBLIC_` or mobile environment variables. Stored object keys include tenant, branch, academic year, and job/card identifiers; APIs never accept those scope identifiers from clients.

## Data and Security Rules

- Every new tenant-owned model includes `tenantId`; operational records also include `branchId` and `academicYearId` where applicable.
- Unique constraints prevent duplicate configuration codes, exam scopes, batch marks, result rows, imports, report-card versions, and publications.
- Protected queries derive tenant, institution, branch, academic year, user, and permissions from the session.
- Zod schemas are strict and reject client-owned scope, actor, role, status, and permission fields.
- Critical writes use Prisma transactions, optimistic versions, audit logs, and domain-event outbox records.
- Sensitive credentials, password hashes, tokens, raw storage secrets, and internal Prisma errors are never returned.
- GradeBook tables have RLS enabled as defense in depth; application session scope and RBAC remain authoritative.
- Permanent tenant deletion includes every GradeBook dependency and clears nullable supersession links before transactionally deleting records.

## Migrations

1. `20260810213000_add_gradebook_foundation` - previously applied pilot assessment ledger.
2. `20260811201500_expand_gradebook_phase_0_1` - additive configuration, exam, marks workflow, import, result, correction, enrichment, report-card, publication, analytics, permission, and subfeature-flag foundation.

The second migration must be applied with `npx prisma migrate deploy` only against an approved deployment database. It is not applied by this local implementation task.

## Rollout and Rollback

1. Apply the expanded migration to an approved staging database.
2. Keep all master/subfeature flags off.
3. Enable one disposable or approved pilot institution through the Administrator Portal.
4. Run Principal configuration/exam/marks/result/report-card/publication QA.
5. Run assigned and unassigned Teacher QA plus Office Staff, Staff, cross-branch, cross-year, and cross-tenant denials.
6. Verify CampusCore, Academia, attendance, promotion, StaffBoard, leave, calendar, and QR regressions.
7. Verify private import/report-card storage and audit/event records.
8. Deploy only after checks and browser QA pass.

Rollback starts by disabling GradeBook and every subfeature. Revert application code if needed, but retain additive tables and historical academic data. Do not run destructive down migrations after marks exist without an approved retention plan.

## Automated Verification

Focused tests cover:

- Decimal raw and weighted calculations, special statuses, and deterministic output.
- Legal/illegal state transitions.
- Strict rejection of client-owned scope/status fields.
- Exam and grade-scale validation.
- Server-derived request context and unauthorised branch denial.
- Platform/school role separation and Teacher least privilege.
- Default-off flags, RLS statements, private storage, and additive migration behavior.
- Complete GradeBook dependency ordering during permanent school deletion.

## Remaining Release Gates

- Apply `20260811201500_expand_gradebook_phase_0_1` to approved staging.
- Run DB-backed role-matrix and two-tenant/two-branch/two-year negative QA.
- Verify private CSV/XLSX import, signed report-card download, and audit/outbox records against Supabase.
- Verify representative CBSE, CISCE/ICSE, and State Board configuration fixtures with academic stakeholders.
- Embed a Unicode font before certifying PDFs for names/scripts outside WinAnsi; the current standard PDF font is a pilot limitation.
- Complete load/concurrency testing for large rosters and imports.
- Stabilize the GradeBook pilot before beginning full SchoolCast MVP.

Parent/student accounts, `/portal/results`, transcripts, hall tickets, board-specific statutory layouts, GradeBook notifications, and GradeBook-driven promotion eligibility remain deferred until separately approved. The reserved portal feature flag stays off and no unsupported portal UI is exposed.
