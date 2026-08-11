# Student Promotion

## Purpose

The Student Promotion workspace provides a class-wise, selected-student workflow for closing academic-year outcomes and creating next-year enrollments. It does not modify or move historical attendance, enrollment, examination, fee, or class records.

Route: `/academia/promotions`

Permission: `academia.promotion.manage`

Principal and supported legacy school-governance roles receive the permission by default. Office Staff or a future Academic Coordinator can receive it only through an explicit permission grant. Teacher and Staff roles do not receive promotion authority by default.

## Workflow

1. Select the source academic year and class-section.
2. Select the target academic year and default next class-section.
3. Select individual students or use bulk selection.
4. Apply a bulk outcome, then change individual exceptions.
5. Confirm the effective date and optional batch/student remarks.
6. Attest that examination results are finalised and published.
7. Review the source, target, selected/excluded counts, and outcome summary.
8. Confirm the promotion batch.

The examination and result module is not part of the current Base MVP. Result publication is therefore an explicit, audited operator attestation. A future GradeBook integration should replace this attestation with a server-verified result lifecycle check.

## Outcomes

| Outcome | Source enrollment | Target-year enrollment | Student lifecycle |
| --- | --- | --- | --- |
| Promoted | `PROMOTED` | Created in default next class-section | Remains active |
| Not Promoted | `COMPLETED` | Not created | Remains active |
| Repeat Same Class | `COMPLETED` | Created in an explicitly selected same-class section | Remains active |
| Transferred | `TRANSFERRED` | Not created | Becomes transferred |
| School Left | `WITHDRAWN` | Not created | Becomes withdrawn |
| Result Pending | Remains active | Not created | Remains active |
| Promotion Withheld | Remains active | Not created | Remains active |

Students omitted from the selected set are recorded as `EXCLUDED` in the batch ledger and are not changed. New students continue through admission or student import and are never mixed into promotion.

## Data Integrity

- `StudentPromotionBatch` records branch, source/target academic years, source/default target class-sections, effective date, confirmation, counts, outcome summary, actor, and reversal state.
- `StudentPromotionItem` records every source enrollment, including excluded students, prior enrollment/student lifecycle state, decision, optional target enrollment, and reversal metadata.
- Existing `Enrollment` uniqueness continues to prevent more than one student enrollment per target academic year.
- Target class-section capacity is checked before writes.
- The target academic year must follow the source year, and the effective date must fall within the target year.
- Promoted students must move to a different class level. Repeating students must use the source class level in the target year.
- The batch, enrollment writes, lifecycle updates, decision ledger, and audit log are committed in one Prisma transaction.

## Reversal

An authorised user can reverse a complete batch by typing `REVERSE PROMOTION` and providing a reason. Reversal:

- marks created target enrollments `CANCELLED` rather than deleting them;
- restores the source enrollment and student lifecycle snapshots;
- marks the batch and selected items reversed; and
- writes a separate audit event.

Reversal is blocked when target-year attendance exists, a target enrollment was changed, or related source/student lifecycle state changed after promotion. A correction then requires an explicit operational review rather than silently overwriting later records.

## Security

- Tenant, branch, actor, role, enrollment status, and audit authority are session-derived.
- Source and target records are revalidated for the current tenant, active branch, institution, and academic year.
- Zod schemas are strict and reject client tenant/branch/actor fields and duplicate student decisions.
- Server-side `academia.promotion.manage` checks protect reads, execution, and reversal.
- Audit records contain safe identifiers and summaries, not passwords, tokens, or sensitive student identity fields.

## Deployment And QA

### Controlled DB-backed QA ledger - 10 August 2026

The additive migration was deployed to the approved database and verified current. Authenticated browser QA used only the `jinacampus-demo` institution and a synthetic promotion roster; no RDA school record was selected or mutated.

- A Principal loaded the 2026-27 `QA Class 1-A` roster, selected one synthetic student, confirmed finalised results, and reviewed a one-student `Promoted` preview into 2027-28 `QA Class 2-A`.
- Confirmation created the target-year enrollment and persisted a `COMPLETED` batch with one selected and zero excluded students.
- The Principal reversed the same batch with the required confirmation and reason. Browser history then showed `REVERSED`.
- Database verification confirmed the target enrollment is `CANCELLED`, the source enrollment is `ACTIVE`, and the student lifecycle is `ACTIVE`.
- Both `academia.student_promotion.batch_completed` and `academia.student_promotion.batch_reversed` audit events exist for the batch.
- A temporary Teacher session received a safe protected-page failure and no promotion controls or student data.
- All short-lived QA sessions were revoked, the Principal first-login password-change requirement was restored, and the temporary Teacher account, role access, branch access, and staff profile were disabled.
- A before/after aggregate baseline across RDA users, students, enrollments, academic years, class-sections, promotion batches, and audit logs remained unchanged.

This ledger validates the selected-student promoted/reversal path and default Teacher denial. The wider outcome and boundary matrix remains covered by automated service tests and should be sampled again when a full pilot dataset is approved.

Before release:

1. Run `npx prisma migrate deploy` against the approved database.
2. Verify Principal can load a branch roster, mix outcomes, preview, and confirm.
3. Verify target enrollments and source statuses match the outcome table.
4. Verify transferred and school-left students do not appear in active target-year lists.
5. Verify a safe reversal before target activity and blocked reversal after target attendance.
6. Verify Teacher and Staff receive a safe permission denial.
7. Verify wrong-branch, cross-tenant, duplicate target enrollment, duplicate decision, invalid year/date, and capacity boundaries.
