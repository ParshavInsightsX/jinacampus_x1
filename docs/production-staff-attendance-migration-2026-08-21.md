# Production Staff Attendance Migration Evidence

Status date: 21 August 2026

Target: primary JinaCampus Supabase PostgreSQL database

Decision: migration applied successfully; database and read-only production workflow verification passed

This record contains no database URL, project reference, password, user identity, raw session token, QR value, or token hash.

## Authorised Scope

The approved scope was limited to:

1. Establishing a documented logical recovery point.
2. Applying the reviewed Prisma production migrations with `npm run db:migrate:deploy`.
3. Verifying migration status, critical row counts, tenant isolation, StaffBoard behavior, and existing production reads.

No Vercel or Supabase configuration, provider, worker, scheduler, feature flag, tenant entitlement, storage object, or unrelated database record was changed.

## Logical Recovery Point

The tracked `scripts/backup-main-database.ps1` procedure completed before deployment.

- Evidence timestamp: `2026-08-21T07:28:52Z`
- Backup file: `jinacampus-main-backup-20260821T072852Z.dump`
- Evidence manifest: `jinacampus-main-backup-20260821T072852Z.dump.sha256.json`
- Protected location: `%LOCALAPPDATA%\JinaCampus\backups\main` outside the repository
- Backup size: `1,019,630` bytes
- SHA-256: `72a846a2e18bc77344035eae01a4e7ec1e37392e56787898028b99bd661789a6`
- Format/scope: PostgreSQL 17 custom-format logical dump of the `public` schema

Independent verification confirmed:

- The dump hash matches the manifest.
- `pg_restore --list` can read the dump.
- The dump restores successfully into an isolated PostgreSQL 17 container.
- Restored catalog: 26 completed migrations, 2 tenants, 106 public tables, and 351 foreign keys.
- Restored integrity: zero failed migrations, zero invalid indexes, and zero unvalidated constraints.
- Temporary credential files and restore containers were removed.

This is a logical application-schema recovery point, not Supabase Point-in-Time Recovery or a complete project backup. It excludes Auth/Storage schemas, Storage objects, global roles, and role passwords. Supabase also documents that database backups do not restore deleted Storage objects. See [Supabase Database Backup Guidance](https://supabase.com/docs/guides/platform/backups).

## Pre-Migration Baseline

Captured at `2026-08-21T07:31:50Z`:

| Check | Result |
| --- | ---: |
| Completed / failed Prisma migrations | 26 / 0 |
| Tenants / institutions / branches | 2 / 2 / 2 |
| Academic years / users | 3 / 27 |
| Students / enrollments | 533 / 534 |
| Staff profiles / attendance settings | 24 / 2 |
| Staff attendance records / legacy QR tokens | 151 / 75 |
| Permissions / role-permission grants | 202 / 530 |
| Audit logs / notification outbox | 2,890 / 0 |
| Waiting sessions / non-idle queries over 30 seconds | 0 / 0 |
| Invalid indexes / unvalidated constraints | 0 / 0 |

Tenant-consistency checks for branches, users, role assignments, students, enrollments, staff profiles, attendance settings, and attendance records all returned zero violations. Fingerprints were recorded for staff profiles, legacy attendance fields, attendance settings, and QR-token records.

## Migration Execution

Executed exactly:

```text
npm run db:migrate:deploy
```

Prisma exited successfully and applied exactly these reviewed additive migrations:

- `20260820182500_extend_staff_attendance_status`
- `20260820183000_rebuild_staff_attendance_hybrid`

No other migration was applied. The reviewed SQL contained no `DROP`, `DELETE`, or `TRUNCATE` statement. Prisma documents that `migrate deploy` applies pending migration history without detecting unrelated drift, so separate status and schema-diff checks were also run. See [Prisma Production Migration Guidance](https://www.prisma.io/docs/cli/migrate/deploy).

## Post-Migration Database Verification

### Migration ledger and schema

- `npm run db:migrate:status`: 28 migrations found; database schema up to date.
- Prisma 5.22 schema diff: no difference detected.
- Completed / failed migrations: 28 / 0.
- Both migration ledger checksums match the reviewed local SQL files:
  - `20260820182500`: `2bc5405079fc2e0aaebb1a17eff09f1e0f28657c9f25d5743ddf57e9181d36d0`
  - `20260820183000`: `a55ede166f7f307afe2500232535fd70ee7b6689900adb2e682a4b3c34ee5468`
- All 20 new check constraints are validated.
- All four critical unique indexes are valid.
- The public schema has zero invalid indexes and zero unvalidated constraints.

### Critical counts and expected deltas

All pre-existing critical business counts remained unchanged:

- 2 tenants, 2 institutions, 2 branches, 3 academic years, and 27 users.
- 533 students and 534 enrollments.
- 24 staff profiles, 2 attendance settings, 151 staff attendance records, and 75 legacy QR tokens.
- 2,890 audit logs and zero notification-outbox rows.

Expected migration-created/backfilled state:

- Permissions: 202 to 208 (`+6` reviewed attendance permissions).
- Role-permission grants: 530 to 552 (`+22` reviewed grants).
- Staff branch assignments: 24.
- Version-1 published policies: 2.
- Schedules: 2; schedule assignments: 24.
- Attendance events: 153, matching 130 legacy check-ins, 2 check-outs, and 21 status events.
- Credentials, scan sessions, adjustments, and attendance outbox events: 0.

All four legacy fingerprints matched their pre-migration values. Backfill reconciliation, compatibility metadata, event linkage, lifecycle/review fields, and tenant/institution/branch composite-scope checks returned zero violations.

### RLS and tenant isolation

- RLS is enabled on all 9 new tables.
- The new tables intentionally have no direct PostgREST policies. Direct `anon` and `authenticated` role probes returned zero visible rows on all 9 tables.
- All checked new-table tenant/institution/branch relationship violations returned zero.
- Two active principal tenant contexts each received explicit denial for a foreign tenant branch through:
  - Staff Attendance Register reads.
  - Staff Attendance capture-setting reads.
  - Staff roster reads.

## Functional and Regression Verification

### Production read-only service smoke

A temporary credential-free harness constructed the same tenant, user, branch, academic-year, and role context consumed by server services. It called only read functions and compared protected row counts before and after. It passed for both active tenant contexts:

- MVP dashboard summary, including CampusCore, Academia, and StaffBoard metrics.
- Academia student list.
- Staff roster.
- Staff Attendance Register and summary.
- Daily/monthly Staff Attendance reports.
- Attendance capture settings.
- QR/operator branch options.
- Staff QR credential roster.
- Pending attendance-adjustment queue.
- Three foreign-tenant denial checks per tenant.

Protected counts for users, students, staff, attendance records/events, credentials, scan sessions, adjustments, attendance outbox, audit logs, and sessions were identical before and after this smoke test.

### Focused automated regression

Nine focused Vitest files passed: 86 tests total. Coverage included StaffBoard tenant isolation, Hybrid Attendance, corrections, QR scanning, admin queries, CampusCore isolation, Academia isolation, dashboard queries, and in-app notifications.

### Live HTTP and logs

- `GET /api/health`: HTTP 200 with database connected.
- `GET /login`: HTTP 200 with no server-error marker.
- Unauthenticated protected API/page probes returned safe 401/redirect behavior.
- Post-migration PostgreSQL logs contain no `P2022`, `P2024`, Prisma runtime, connection-exhaustion, deadlock, uniqueness, foreign-key, or check-constraint error pattern.
- The only two ERROR entries after migration were the operator's harmless read-only diagnostic queries using incorrect table/column spellings; corrected queries succeeded.

Configured non-secret smoke passwords did not match any active production Principal, Office Staff, or Staff account. Therefore, no authenticated HTTP session was created and no password was reset or test user provisioned. Authenticated route rendering and mutating scan/correction flows were not exercised against production; doing so would require separately supplied approved credentials and test-data authority. Production service/RBAC reads, public HTTP health, database invariants, and focused mutation tests passed.

## Supabase Advisors

No ERROR or WARNING advisor finding was reported.

- Security: 115 informational `rls_enabled_no_policy` notices, including all 9 new server-only tables. Their effective PostgREST behavior was independently verified as deny-all for `anon` and `authenticated`. [Advisor explanation](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)
- Performance: 243 informational unindexed-foreign-key notices and 115 informational unused-index notices across the database. The new tables account for 23 and 17 respectively. New indexes have had almost no production observation time, so unused status is expected immediately after deployment; index changes require a separate review. [Unindexed foreign keys](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys), [unused indexes](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index)

## Final Boundary and Follow-Up

- No code deployment, configuration change, provider activation, worker activation, scheduler activation, feature activation, or additional data migration was performed.
- The recovery dump and evidence manifest must be retained together and access-controlled.
- The two applied migration directories are currently untracked in the local Git worktree. They must be reviewed and committed/published through the normal source-control process so production migration history is not lost. This run did not commit or push them.
- Full Supabase project recovery, Auth/Storage recovery, PITR, physical-device scanner QA, authenticated production route smoke, and production mutation smoke remain separate gates.
