# Identity Card Production Migration Evidence

## Scope

- Date: 2026-08-26
- Environment: approved primary JinaCampus Supabase database
- Operator: Codex, acting under the explicit migration approval recorded in this workspace conversation
- Application deployment: not performed
- Source publication: not performed
- Storage mutation: the required private staff-photo bucket was created and validated; the synthetic probe object was deleted

## Approved Migrations

| Migration | SHA-256 |
| --- | --- |
| `20260824183000_add_student_attendance_continuity` | `11aa013cea8ea45c8016a7a6662ee8b10b8abcfe4f269e331f8f0007e8afed22` |
| `20260825120000_add_identity_cards` | `391200e556e14266908fd66f72fbaf1b2737df9167ea22cf83abab9cde05f9ad` |

The reviewed SQL contains no `DROP`, `TRUNCATE`, table or column rename, or dropped-column operation. The identity-card migration intentionally disables the legacy staff self-scan permission, removes its six existing role grants, and changes one enabled hybrid attendance setting to supervised QR.

## Backup And Recovery Evidence

- Protected backup manifest: `jinacampus-main-backup-20260826T114034Z.dump.sha256.json`
- Recovery scope: PostgreSQL `public` schema logical backup
- Backup size: 1,198,449 bytes
- Backup SHA-256: `8ff88c539f6672f2db5406179c886daf3c5aebb9d6153336d76020132c04f7cc`
- Backup completed: 2026-08-26 11:41:23 UTC
- Isolated PostgreSQL 17 restore completed: 2026-08-26 11:41:37 UTC
- Restore checks: 29 baseline migrations, 119 public tables, 423 foreign keys, two tenants, zero failed migrations, zero invalid indexes, and zero unvalidated constraints
- Filesystem access: restricted to the authorised Windows account and `SYSTEM`
- Storage objects: not included in the logical database backup and not changed by these migrations

The exact migration SQL was then applied in order to a network-disabled restore of this backup. The rehearsal preserved two tenants, 28 users, 533 students, 24 staff profiles, four student-attendance sessions, 194 staff-attendance records, and 81 legacy QR credentials.

## Production Execution Result

`npx prisma migrate deploy` applied both migrations successfully through the guard-verified direct production connection. Immediate `prisma migrate status` reported the schema up to date with 31 migrations.

Post-migration validation confirmed:

- Both migration-ledger checksums match the reviewed files.
- Zero failed or rolled-back migration entries.
- Three expected new tables exist and have row-level security enabled.
- Six attendance-responsibility columns exist and every existing session has a responsible user.
- The three new tables have 21 expected foreign keys.
- Zero invalid indexes and zero unvalidated constraints.
- Three new permissions are active.
- Legacy self-scan role grants and enabled hybrid/self-scan settings are zero.
- All 81 existing staff QR credentials remain present.
- Prisma can query Staff Profile photos, Student Identity Cards, and attendance-responsibility relations.

The new duty-assignment, staff-photo, and student-card tables contained zero rows immediately after migration, as expected.

## Private Staff-Photo Storage Result

The linked production Vercel project contains the required server-only Supabase URL and service-role variables. Their values were not read or printed. Vercel's in-memory environment runner was used so no readable secret file was retained.

The `staff-profile-photos` bucket did not exist before this check. It was created through the reviewed server-side storage configuration with:

- private access (`public = false`)
- 2,000,000-byte per-file limit
- JPEG, PNG, and WebP MIME allowlist

A uniquely named synthetic PNG was uploaded and downloaded through the server client, verified by checksum, denied through the unsigned public URL, retrieved through a 60-second signed URL, and deleted. A database-side post-check confirmed zero `_release-qa/` objects remain in the bucket.

This certifies the storage infrastructure path. Authenticated application-level upload, replacement, retrieval, and deletion against an authorised staff profile remains part of post-deployment browser QA.

## Application Smoke Result

After migration, the local application was restarted and returned:

- `/login`: HTTP `200`
- `/administrator/login`: HTTP `200`
- `/api/health`: HTTP `200` with the database connected
- unauthenticated identity-card routes: safe HTTP `307` redirects
- local runtime logs: no new `P2021` identity-card schema errors

The current Vercel production deployment remains healthy for login and database health checks, but the new identity-card routes return HTTP `404` because the reviewed source has not yet been committed and deployed. This is an application publication boundary, not remaining database drift.

## Recovery Procedure

1. Prefer an application rollback or fail-closed feature disable while retaining the additive schema and historical records.
2. Do not drop the new tables or enums during an incident without a separately reviewed destructive migration.
3. If database restoration is required, use the protected checksum-verified dump in a controlled maintenance window and restore first to an isolated database for confirmation.
4. A primary-database restore is destructive and requires separate explicit authorization because it can discard writes made after the backup timestamp.
5. Staff self-scan permission or setting restoration requires a separately reviewed policy rollback; it must not be inferred from application rollback alone.

## Remaining Release Gates

- Authenticated Principal and Platform Administrator production browser QA needs an approved current session or credential handoff after deployment.
- Authenticated application-level staff-photo upload, replacement, retrieval, and deletion QA remains required after deployment; the underlying private storage path has passed.
- Physical CR80 printing and QR scannability remain hardware-dependent.
- Android and iOS HTTPS display/scanning certification remains device-dependent.
- Release commit review, push, Vercel deployment, and post-deployment smoke testing require their own authorization and evidence.
