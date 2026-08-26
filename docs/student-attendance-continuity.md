# Student Attendance Continuity and Duty Assignment

Status: isolated PostgreSQL 17 migration and authenticated browser QA passed; production migration and physical-device QA pending
Last reviewed: 2026-08-25

## Purpose

Student Attendance must continue when the assigned Class Teacher is unavailable. JinaCampus now separates temporary attendance responsibility from the permanent Class Teacher role while preserving one official attendance session per class-section, date, and session type.

The recommended operational order remains:

1. Class Teacher
2. Co-Class Teacher
3. Assigned Substitute Teacher
4. First-period or current-period Teacher
5. Branch Attendance Operator or Office Staff
6. Principal or another separately authorised school leader
7. Privileged correction after the normal attendance window

The current phase implements explicit, authorised assignment of priorities 2-5 and a reason-controlled Principal override. Automatic leave/timetable nomination and escalation are deferred until their source data and scheduler are approved.

## Delivered Workflow

Authorised Principal and Office Staff users can open `/academia/attendance/coverage` for the active branch and academic year. The workspace provides date-specific class coverage, completion state, current responsibility, and a bounded duty-assignment form.

Each assignment records:

- Tenant, institution, branch, academic year, class-section, date, and full-day session scope.
- Assigned staff member and assignment type.
- Assigning actor, reason code, reason text, source, priority, start time, and expiry time.
- Acknowledgement, activation, completion, decline, revocation, and expiry lifecycle data.
- Optional linkage to the single official attendance session.

The assigned staff member receives an in-app notification and must acknowledge a pending duty before the attendance roster becomes available. They may decline with a reason. Coverage managers may revoke or replace a live assignment with a recorded reason.

## Attendance Responsibility

The official attendance session stores:

- `responsibleUserId`
- `responsibilitySource`
- `originalClassTeacherUserId`
- `delegatedByUserId`
- `delegationReason`
- `responsibilityTransferredAt`

The existing unique session key prevents a substitute from creating a second register. Every mutation rechecks the authenticated actor against the stored responsibility. A transfer uses optimistic session versioning, preserves the frozen roster and saved entries, and writes an audit event.

A Principal may take over only with `academia.attendance.update` and a meaningful reason. Office Staff do not receive blanket roster access: they must hold the Attendance entitlement, marking permission, active branch access, and a usable class/date assignment.

## Privacy and Security

- Tenant, institution, branch, academic year, actor, roles, and permissions come from the server session.
- Strict Zod schemas reject client-provided tenant IDs, branch IDs, academic-year IDs, user identity, role, and assignment status.
- Candidate users must be active, have current branch access, hold an eligible school role, and have an active linked StaffProfile.
- A duty grants attendance-roster access only for its class, date, session, and validity window.
- Pending, declined, revoked, expired, and completed duties cannot authorise marking.
- The attendance UI uses the existing frozen minimal roster; it does not expose guardian, fee, marks, medical, caste, religion, or unrelated class data.
- Teacher absence never marks students absent. Without verified attendance, the class remains pending.
- Completed and locked attendance still requires the existing correction permission and auditable correction workflow.

## Audit and Notification Records

The implementation records assignment, reassignment, acknowledgement, decline, revocation, expiry, responsibility transfer, and delegated completion. Audit context includes tenant, institution through the scoped entity, branch, academic year, class-section, date, actor, assigned user, reason, source, validity window, session linkage, and before/after responsibility where relevant.

Assignment notifications use the provider-independent in-app notification outbox. No email, WhatsApp, operating-system push, or external-provider call is introduced.

## Database Migration

The additive migration is:

`20260824183000_add_student_attendance_continuity`

It adds the duty-assignment enums and table, session-responsibility columns and relations, indexes, tenant-safe foreign keys, row-level security, the coverage-management permission, and school-role permission grants. It does not delete or rename existing attendance data.

On 2026-08-25 the migration was applied as the final migration in the complete 30-migration history to an approved disposable PostgreSQL 17 database on a loopback-only port. Post-deployment `prisma migrate status` reported the schema up to date. Synthetic fixtures and all QA mutations were restricted to that disposable database; no production, Supabase, RDA, or customer-school data was read or changed.

This evidence approves the isolated QA gate only. Production migration, source publication, deployment, and feature rollout remain separately controlled actions. Until a target database has this migration, the modern Student Attendance workflow must continue to fail closed with safe setup-required messaging.

## Deferred Work

The following requirements remain controlled follow-up phases:

- Institution-configurable fallback order and escalation timings.
- Automatic coverage proposals from approved staff leave, Staff Attendance, or timetable data.
- Reminder and overdue schedulers for attendance not started or incomplete.
- Co-Class Teacher master-data assignment where the institution needs a permanent secondary teacher.
- Explicit edit leases and read-only secondary-editor presence; current writes remain protected by record/session versions and controlled responsibility transfer.
- Offline duty packages, continuity cache, service-worker synchronization, and row-level conflict review.
- Contact-teacher actions and operating-system push notifications.
- Advanced pending-attendance approval, review, and automatic finalisation.

These items must not be simulated with broad permissions or guessed attendance data.

## Isolated Database and Authenticated Browser QA

QA date: 2026-08-25
Target: disposable local PostgreSQL 17 database `jinacampus_attendance_qa` and `http://localhost:3100`
Result: **Pass for the isolated release gate**

The database-backed service matrix passed these 12 workflows:

1. Class Teacher session responsibility.
2. Reason-controlled Principal takeover.
3. Pending-duty acknowledgement gate.
4. Concurrent entry-write conflict handling.
5. Delegated completion.
6. Attendance Operator access.
7. Decline lifecycle.
8. Replacement and revocation.
9. Expiry lifecycle.
10. Concurrent duty-assignment conflict handling.
11. Tenant, branch, year, role, and active-staff denials.
12. Audit and provider-independent in-app notification evidence.

Seven negative service cases passed for an unassigned Teacher, Teacher management attempt, inactive staff member, wrong-branch candidate, cross-branch class, cross-year class, and cross-tenant class. Deliberate concurrent writes produced safe transaction conflicts; exactly one valid write won without duplicate sessions or silent overwrite.

Authenticated clean-profile Chromium QA passed for:

| Role or boundary | Result |
|---|---|
| Principal coverage management at 1280 x 900 | Pass |
| Assigned substitute Teacher acknowledgement gate at 390 x 844 | Pass |
| Assigned substitute Teacher roster scope | Pass |
| Modified inaccessible-branch cookie | Pass; ignored without disclosure |
| Office Staff Attendance Operator at 360 x 800 | Pass |
| Permanent Class Teacher scope | Pass |
| Independent second-tenant Principal | Pass |
| Wrong-branch and wrong-year direct URLs | Pass; no protected roster disclosure |
| Browser-to-database session and audit projection | Pass |
| Safe browser output and clean hydration diagnostics | Pass |

Both mobile viewports retained 44 px operational actions and had no page-level horizontal overflow. Four desktop/mobile captures were visually reviewed. A literal replacement-character defect in the responsibility label was corrected to an ASCII separator and covered by source and browser regression assertions. A Server Action module that exported a non-function initial-state object was also corrected by moving that state into the client component; this removed the confirmed runtime `500` on duty acknowledgement.

The final browser projection recorded both synthetic browser duties as `ACTIVE`, acknowledgement audit evidence, and zero sessions for protected wrong-branch or wrong-year classes. Checked UI and browser diagnostics contained no password, session secret, hash, database URL, tenant identifier, Prisma/SQL error, stack trace, internal source path, replacement glyph, or cross-scope student content.

Production migration, source publication, application deployment, approved-HTTPS physical Android/iOS testing, and any institution rollout remain separate release gates.