# GradeBook MVP Controlled Release Ledger

Status date: 12 August 2026
Overall status: **Staging database and private-storage infrastructure verified; application release gates remain blocked**

This ledger is the evidence and decision record for the controlled GradeBook MVP release. A gate is complete only when its evidence is recorded here or linked from an approved private release record. Local compilation is not staging, academic, load, device, or production certification.

## Safety Rules

- Never run `prisma migrate reset` against pilot, staging, or production.
- Never use the main JinaCampus database as an unlabelled staging target.
- Keep `gradebookEnabled` and every GradeBook subfeature flag off until the corresponding gate passes.
- Back up and verify recovery before applying a database migration.
- Do not copy production personal data into an unsecured QA environment.
- Do not record database URLs, credentials, signed URLs, student data, or report cards in this document.
- A rollback starts by disabling GradeBook. Additive GradeBook tables are retained unless a separately approved data-retention operation is required.

## Current Environment Evidence

| Check | Result | Evidence |
|---|---|---|
| Local Prisma schema | Pass | `prisma format`, `prisma validate`, and `prisma generate` passed. |
| Local application gates | Pass | Typecheck, 111 test files / 909 tests, and the 98-route production build passed. |
| Production deployment baseline | Pass | Vercel identifies production commit `14ddafece378fac209bce872c9fa309e6d1e300f`; its isolated source snapshot contains exactly 20 Prisma migrations through `20260810213000_add_gradebook_foundation`. |
| Isolated staging database | Pass | The separate `gradebook-mvp-staging` Supabase project is active and healthy. No production data was copied. |
| Local database configuration | Pass | The masked setup writes an ACL-protected `.local` file under `%LOCALAPPDATA%\\JinaCampus\\secrets`, outside the repository. The runner never uses the Windows clipboard and refuses any target other than the approved staging project. |
| Docker staging fallback | Blocked | Docker Desktop is not running in the current QA environment. |
| Staging migration state | Pass | The superseded fresh install was removed from staging `public`; Supabase system schemas remained intact. The exact 20-migration production snapshot was applied and seeded, then only migration `20260811201500_expand_gradebook_phase_0_1` was applied. Post-deploy status reports 21 migrations and an up-to-date schema. |
| Migration-history integrity | Pass | Ordered names and migration checksums match the selected snapshots. The audit accepts only equivalent LF/CRLF encodings so Windows cannot create a false mismatch; substantive SQL edits still fail. No migration history was copied or synthesized. |
| Schema drift comparison | Baseline issue recorded | Pre- and post-upgrade Prisma diffs are identical. Existing production-baseline differences are limited to legacy index-name truncation and SQL defaults not represented in the Prisma schema; migration 21 introduced no additional drift. |
| Main GradeBook rollout state | Safe | The existing master GradeBook flag is off. Expanded feature columns are treated as disabled until migration. |
| Private GradeBook bucket | Infrastructure pass | The committed idempotent storage migration is recorded in staging Supabase migration history. `gradebook-private` is private, limited to 10 MB PDF/XLSX/CSV objects, and has zero direct `public`/`anon`/`authenticated` policies. End-to-end upload/download/retention QA remains pending. |
| Public Data API surface | Staging pass | The separately approved staging hardening revoked browser-role access and enabled RLS on all 96 public tables. Browser table grants are zero. Supabase reports no security errors or warnings; server-only tables intentionally have no Data API policies. Production remains unchanged. |
| Unicode PDF font | Blocked | Current PDF rendering uses WinAnsi standard fonts and intentionally rejects unsupported Unicode text. |
| GradeBook workers | Blocked | Job and outbox persistence exists, but no executable queue/cron worker is implemented or load-certified. |
| Academic board sign-off | Blocked | No qualified CBSE, CISCE/ICSE, State Board, or institution-specific approval evidence is available. |
| Student/guardian portal | Blocked | Parent/student account roles and the results portal remain unimplemented and disabled. |

## Migration Static Audit

Migration: `prisma/migrations/20260811201500_expand_gradebook_phase_0_1/migration.sql`

- 30 new enums.
- 41 new GradeBook tables.
- 106 new indexes, including scoped uniqueness constraints.
- 159 foreign-key constraints.
- 41 new tables have row-level security enabled as defense in depth.
- One existing table is altered: `tenant_settings` receives nine nullable-safe, `NOT NULL DEFAULT false` feature columns.
- No `DROP`, `TRUNCATE`, `DELETE FROM`, field rename, existing-column type change, or existing-column removal is present.
- The migration grants GradeBook permissions only to approved school-role mappings. The separate platform `ADMINISTRATOR` role is not granted tenant academic access.

Static review does not replace applying the migration to isolated staging and validating the resulting catalog.

## Gate Matrix

| Gate | Status | Required evidence |
|---|---|---|
| Isolated staging target | Pass | Dedicated zero-data Supabase project created at the approved USD 0 monthly project cost in the same organisation and region. |
| Verified production baseline | Pass | Production commit `14ddafe` supplied exactly 20 migrations. Staging was rebuilt from them and seeded with synthetic records: 1 tenant/institution/branch/year, 5 users, 18 students/enrollments, 45 student-attendance rows, 32 staff-attendance rows, and 5 subjects. |
| Staging GradeBook upgrade | Pass | Exactly `20260811201500_expand_gradebook_phase_0_1` was pending; it applied successfully and post-deploy migration status is current. |
| Catalog integrity | Pass | 95 application tables, 43 GradeBook tables with RLS, 320 foreign keys, all 86 Prisma-declared unique keys backed by 91 unique indexes, 389 valid indexes overall, zero invalid indexes, zero unvalidated constraints, verified migration checksums, and preserved synthetic fixtures. |
| Recovery rehearsal | Partial | The isolated application schema was reset and rebuilt from immutable migrations while Supabase system schemas remained intact. Pilot feature-disable and provider backup/PITR restoration evidence remain pending. |
| Private file storage | Infrastructure pass | Reproducible bucket migration, private access, MIME/size restrictions, tenant/branch/year paths, and 60-second signed URL source controls verified. Upload/download, access-audit, cleanup, and retention browser/worker QA remain pending. |
| Pilot-only flags | Pending | Exactly one approved pilot tenant enabled; all other tenants disabled; server-side denial verified. |
| Role and scope matrix | Pending | Principal, approved coordinator/custom role, assigned teacher, class teacher, forbidden roles, and all negative scopes. |
| Student/guardian publication access | Blocked | Approved account/identity model and linked-student server authorization. |
| Functional regression | Pending | Import, marks lifecycle, calculation, corrections, publication, report cards, history, and existing-module smoke. |
| Concurrency and load | Pending | No lost update, idempotent retry, large roster/import limits, timing, and resource evidence. |
| Academic format approval | Blocked | Signed representative examples and calculation/report-layout approval. |
| Multilingual PDFs | Blocked | Approved licensed Unicode fonts and English/Hindi/regional render-print-regenerate evidence. |
| Worker certification | Blocked | Executable workers, retries, idempotency, dead-letter handling, observability, and tenant-safe load evidence. |
| Production migration | Not authorised | Every preceding gate must pass first. |
| Pilot production enablement | Not authorised | Production migration, storage, worker, smoke, and rollback validation must pass first. |

## Staging Procedure

1. Identify an authorised staging database. Prefer an isolated Supabase development branch or dedicated staging project.
2. Confirm the environment is not the main production project. Record only the setup type in public documentation.
3. Verify a restorable pre-migration backup. For a disposable branch, record the branch baseline and test reset/recreation; for a persistent staging project, verify the provider backup or encrypted `pg_dump` and its checksum.
4. Run `powershell -File scripts/configure-gradebook-staging-env.ps1`; type the staging password at the masked prompt. The secret is stored under `%LOCALAPPDATA%\\JinaCampus\\secrets`, never in the repository, Windows clipboard, or root `.env`.
5. Run `scripts/gradebook-staging.ps1 -Command AssertTarget`; it must print only the approved staging project reference and reject the production reference.
6. Reset only the isolated staging application's `public` tables/enums with `-Command ResetApplicationSchema`. Supabase system schemas remain untouched.
7. Deploy and audit the 20-migration production snapshot using `-SchemaPath .tmp/gradebook-production-14ddafe/prisma/schema.prisma`.
8. Seed that baseline with synthetic, non-sensitive demo fixtures through `-Command Seed` and audit required data counts.
9. Against the committed GradeBook release snapshot, run `-Command ExpectedGradebookPending`; exactly `20260811201500_expand_gradebook_phase_0_1` must be pending.
10. Deploy migration 21, run `-Command Status`, `-Command Drift`, and `-Command Audit`, then validate catalog evidence independently.
11. Run existing-module smoke before enabling any GradeBook flag.
12. Apply the recorded private-storage infrastructure and verify it is not public and has no browser-role access policy.
13. Select one disposable or formally approved pilot institution. Enable the master flag and only the subfeatures currently under test.
14. Run the role/scope, workflow, concurrency, load, failure, report-card, and history matrices.
15. Disable the master feature flag and verify navigation and server routes deny access while data remains intact.
16. Re-enable only after every mandatory staging gate has passed and evidence has been reviewed.

### Provisioning attempt: 12 August 2026

- Approved target: Supabase development branch `gradebook-mvp-staging`.
- Approved branch price: USD 0.01344 per hour.
- Result: no branch was created and no branch charge began; Supabase rejected the operation because the organisation is not on Pro or above.
- Approved fallback: a separate Supabase project at USD 0 per month in the same organisation and region.
- Fallback result: the dedicated staging project is active and healthy, with no `public` tables, no migration ledger entries, and no copied production data.
- First credential handoff: the ignored one-time file was consumed and deleted correctly, but Supabase rejected the supplied value for the staging `postgres` user. Prisma did not apply any migration; the staging catalog and migration ledger remain empty.
- Superseded result: all 21 repository migrations were fresh-installed and the catalog appeared structurally valid. This is not accepted as upgrade evidence because production-like baseline data was absent before migration 21.
- Corrected process: Vercel production commit was pinned, its 20-migration source snapshot was isolated, a dedicated GradeBook staging release branch was created, and guarded secret/migration/catalog tooling was added.
- Accepted baseline result: staging `public` was rebuilt from the exact production commit's 20 migrations and populated only with synthetic `.test`/`.invalid` fixtures.
- Accepted upgrade result: migration 21 was the only pending migration, applied successfully, and passed migration-status and catalog-integrity checks.
- Drift result: the release added no new drift; inherited production-baseline index-name/default differences remain recorded for a separate reconciliation task.
- Storage result: the committed idempotent bucket migration is recorded in staging Supabase history and independently verified.
- Public Data API result: the separately approved staging-only hardening is recorded in Supabase history, all 96 public tables have RLS, and browser roles have zero table grants.
- Advisor result: zero security errors/warnings; 96 intentional server-only `rls_enabled_no_policy` information notices; 205 unindexed-foreign-key and 198 unused-index information notices remain a separate performance-review task.
- The main JinaCampus project remained unchanged.

## Storage Acceptance

The application currently enforces these controls in server code:

- Private bucket requirement.
- CSV, XLSX, and PDF allowlist.
- Configurable 10 MB import and 5 MB report-card limits.
- Object paths beginning with tenant, branch, and academic-year IDs.
- Non-overwriting uploads.
- SHA-256 import/PDF checksums.
- 60-second signed report-card download URLs after permission and scope checks.
- Audit records for report-card downloads and import lifecycle actions.

Infrastructure verification, retention cleanup, temporary-file cleanup, validation-report objects, and supporting-document policy remain release gates.

## Recovery Strategy

### Application or feature failure

1. Disable the pilot tenant's `gradebookEnabled` flag.
2. Confirm GradeBook navigation disappears and protected routes fail closed.
3. Retain additive tables and immutable history.
4. Roll forward application defects or restore the previous verified application deployment if compatible.

### Migration failure on staging

1. Stop the migration attempt and capture the safe error code.
2. Do not edit Prisma migration history manually.
3. Restore or recreate the isolated staging target from its verified baseline.
4. Correct the migration locally, rerun all schema gates, and repeat on a fresh staging baseline.

### Production recovery

Production migration and restoration require a separately verified provider backup/PITR record. Destructive rollback SQL is not the default because it would delete newly created GradeBook history. Feature disable plus forward repair is preferred unless the approved incident plan requires restoration.

## External Approval Records Required

- Pilot institution and authorised QA account selection.
- Backup/PITR verification by the database owner.
- Academic board-format sign-off.
- Licensed Unicode font approval and required language list.
- Expected roster/import/report-card volumes and performance thresholds.
- Worker runtime, queue, cron, observability, and retention policy.
- Student/guardian identity and publication-access policy.

## Release Decision

GradeBook is **not release-ready and must remain disabled in production**. The staging database upgrade, catalog integrity, Data API hardening, and private bucket infrastructure gates are complete. The next executable task is controlled pilot feature-flag setup followed by authenticated Principal/coordinator/Teacher/forbidden-role/cross-scope browser QA. Worker certification, multilingual PDF support, load/concurrency evidence, academic sign-off, backup/PITR evidence, production migration, production storage mutation, deployment, and production enablement remain prohibited.
