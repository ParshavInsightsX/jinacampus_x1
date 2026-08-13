# GradeBook MVP Controlled Release Ledger

Status date: 13 August 2026
Overall status: **Staging pilot and role/scope browser QA verified; remaining application release gates are blocked**

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
| Local application gates | Pass | Typecheck, 112 test files / 917 tests, and the 98-route production build passed. |
| Production deployment baseline | Pass | Vercel identifies production commit `14ddafece378fac209bce872c9fa309e6d1e300f`; its isolated source snapshot contains exactly 20 Prisma migrations through `20260810213000_add_gradebook_foundation`. |
| Isolated staging database | Pass | The separate `gradebook-mvp-staging` Supabase project is active and healthy. No production data was copied. |
| Local database configuration | Pass | The masked setup writes an ACL-protected `.local` file under `%LOCALAPPDATA%\\JinaCampus\\secrets`, outside the repository. The runner never uses the Windows clipboard and refuses any target other than the approved staging project. |
| Docker staging fallback | Blocked | Docker Desktop is not running in the current QA environment. |
| Staging migration state | Pass | The exact 20-migration production snapshot was applied and seeded, followed by the approved GradeBook expansion and additive Principal recovery migrations. Post-deploy status reports 22 migrations and an up-to-date schema. Production remains unchanged. |
| Migration-history integrity | Pass | Ordered names and migration checksums match the selected snapshots. The audit accepts only equivalent LF/CRLF encodings so Windows cannot create a false mismatch; substantive SQL edits still fail. No migration history was copied or synthesized. |
| Schema drift comparison | Baseline issue recorded | Existing differences remain limited to legacy index-name truncation and SQL defaults not represented in the Prisma schema. Neither the GradeBook expansion nor Principal recovery migration introduced an additional model/table drift item. |
| Main GradeBook rollout state | Safe | The existing master GradeBook flag is off. Expanded feature columns are treated as disabled until migration. |
| Private GradeBook bucket | Infrastructure pass / application blocked | The committed idempotent storage migration is recorded in staging Supabase migration history. `gradebook-private` is private, limited to 10 MB PDF/XLSX/CSV objects, and has zero direct `public`/`anon`/`authenticated` policies. Server-only staging configuration, synthetic upload/download, direct-access denial, MIME rejection, signed expiry, cleanup, and QA audit evidence passed. Validation-report objects, import retention/expiry, cancelled/failed cleanup, and audited deletion are not implemented. |
| Synthetic staging pilot | Pass | Only `jinacampus-demo` is enabled; every other staging tenant remains disabled and portal results remain off. Principal, coordinator, assigned/unassigned Teacher, Staff, cross-institution/branch/year/tenant, direct-record, cookie-tampering, and disabled-tenant checks are recorded in `docs/gradebook-staging-pilot-browser-qa.md`. |
| Public Data API surface | Staging pass | The separately approved staging hardening revoked browser-role access. The recovery tables are server-only and use the same guarded application path; browser table grants remain zero. The staging catalog now contains 97 public application tables. Production remains unchanged. |
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
| Catalog integrity | Pass | 97 application tables, 43 GradeBook tables, 325 foreign keys, 88 declared unique keys backed by 94 unique indexes, 402 valid indexes overall, zero invalid indexes, zero unvalidated constraints, verified migration history, and preserved synthetic fixtures. |
| Recovery rehearsal | Partial | The isolated application schema was reset and rebuilt from immutable migrations while Supabase system schemas remained intact. Pilot feature-disable/re-enable preserved GradeBook data and passed. Provider backup/PITR restoration evidence remains pending. |
| Private file storage | Infrastructure pass / application blocked | Reproducible bucket migration, private access, MIME/size restrictions, tenant/branch/year paths, and 60-second signed URL source controls verified. The protected staging configuration and deterministic synthetic object probe passed without exposing credentials or retaining QA objects. Validation-report objects, import retention/expiry, cancelled/failed cleanup, and audited deletion remain missing. |
| Pilot-only flags | Pass | Exactly one synthetic pilot tenant is enabled, portal results are off, every non-pilot tenant is disabled, and feature-disable fails closed without deleting GradeBook data. |
| Role and scope matrix | Pass | Principal, staging Examination Coordinator, assigned and unassigned Teacher, Staff, cross-institution, cross-branch, cross-year, cross-tenant, direct URL, modified branch cookie, and client-owned scope injection checks passed. |
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
13. Run `scripts/configure-gradebook-staging-storage.ps1` and enter the staging server key only at its masked prompt; do not use the clipboard or repository environment files.
14. Run `StorageAssert` and `StorageProbe`, then record the synthetic object cleanup and signed-expiry evidence.
15. Select one disposable or formally approved pilot institution. Enable the master flag and only the subfeatures currently under test.
16. Run the role/scope, workflow, concurrency, load, failure, report-card, and history matrices.
17. Disable the master feature flag and verify navigation and server routes deny access while data remains intact.
18. Re-enable only after every mandatory staging gate has passed and evidence has been reviewed.

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

### Pilot and browser QA result: 12 August 2026

- The synthetic pilot was enabled only after migration and bucket infrastructure verification.
- The custom Examination Coordinator is a staging-only permission bundle; canonical production role seeds remain unchanged.
- The feature-disable rehearsal generated platform audit evidence, denied all server access, preserved fixture counts, and re-enabled only the pilot.
- A staging wrapper defect reused the migration connection limit for the browser runtime. The wrapper now preserves the protected URL and adjusts only bounded, in-process QA parameters; the secret file is not rewritten.
- Application-level pilot commands now use that bounded runtime, and synthetic identity contexts load serially so hosted direct-connection limits do not create false authorization failures.
- Expected GradeBook role/feature denials now return safe not-found responses instead of generic server failures.
- Authenticated headless Chrome confirmed that the Principal can open the authorised assessment while a direct URL to the second institution's assessment returns a safe not-found page without restricted content.
- Complete evidence is in `docs/gradebook-staging-pilot-browser-qa.md`.

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

Infrastructure verification is complete, including live synthetic server upload/download, direct-access denial, signed URL expiry, and cleanup. Retention/expiry, validation-report objects, cancelled/failed import deletion, audited cleanup, and supporting-document policy remain application release gates. See `docs/gradebook-staging-storage-qa.md`.

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

GradeBook is **not release-ready and must remain disabled in production**. The staging database upgrade, catalog integrity, Data API hardening, private bucket infrastructure and synthetic object lifecycle, pilot-only feature flags, feature-disable rehearsal, and authenticated role/scope browser matrix are complete. Required import validation-report, retention, cleanup, and audited deletion controls are not yet implemented. Worker certification, multilingual PDF support, load/concurrency evidence, academic sign-off, backup/PITR evidence, full functional regression, production migration, production storage mutation, deployment, and production enablement remain prohibited.
