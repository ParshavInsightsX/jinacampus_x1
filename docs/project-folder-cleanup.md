# Project Folder Cleanup

## Status

- Cleanup date: 2026-08-15
- Scope: local project metadata, generated artifacts, diagnostics, and inactive QA evidence
- Application source, tests, Prisma schema and migrations, active static assets, deployment configuration, and required technical documentation were not relocated.

## Temporary Backup

Inactive but potentially useful artifacts were moved to the ignored local directory `temp_meta_data/` while preserving their project-relative paths.

- Relocated files: 264
- Relocated size: 72,053,936 bytes (about 68.7 MiB)
- Inventory: `temp_meta_data/inventory.json`
- Restore utility: `temp_meta_data/restore.ps1`
- Integrity: every relocated file has a SHA-256 hash in the inventory

The restore utility runs as a dry run by default, verifies hashes, and refuses to overwrite existing project paths.

## Reviewed Removals

The following local-only artifacts were permanently removed after review because they were reproducible, empty, duplicated, or unsafe to retain in the backup:

- A duplicate GradeBook browser-QA checkout containing copied local environment files
- Generated GradeBook local build output
- Generated document-rendering dependency cache
- Generated runtime cache
- An obsolete environment backup
- A generated SchoolCast worker bundle
- Five failed zero-byte staging dump files

Total reviewed removal size: 831,692,648 bytes (about 793.2 MiB).

Valid staging dumps, checksum evidence, controlled-release snapshots, schema rollback references, and active local server logs remain in `.tmp` because they are still relevant to recovery or current development.

## Security Controls

- `.env` and `.env.local` remain in their original ignored locations and were not copied.
- The obsolete environment backup and secret-bearing duplicate checkout were deleted rather than relocated.
- The relocated backup was scanned locally for environment filenames, database connection strings, private-key markers, JWT-like values, Supabase secret-key patterns, and credential assignments.
- No credential or secret content is recorded in this document or the inventory.

## Exclusions

`temp_meta_data` is excluded by:

- `.gitignore`
- `.dockerignore`
- `.vercelignore`

Local scratch directories `.docker-tmp` and `.home` are also excluded. The backup must remain local unless it is separately reviewed and explicitly approved for another storage location.

## Verification

- Dependency-tree verification: Passed (`npm ls --depth=0` exited successfully; two generated image-runtime packages are reported as extraneous in local `node_modules`)
- Prisma format, validate, and client generation: Passed
- TypeScript type-check: Passed
- Automated tests: Passed (124 files, 982 tests)
- Clean production build: Passed (117 static/dynamic routes collected)
- Guarded staging database inspection: Passed; confirmed the approved staging target, `DRY_RUN`, in-application-only delivery, and external providers disabled
- SchoolCast self-hosted infrastructure validation: Passed with production activation still unauthorised and alert routing still fail-closed pending two private destinations
- SchoolCast production-readiness evidence validation: Correctly blocked because the required production evidence file is not configured
- Backup hash verification: Passed (264 of 264)
- Restore dry run: Passed
- Git ignore verification: Passed
- `git diff --check`: Passed with pre-existing Windows line-ending notices only
- Lint: Not run because the package does not define a lint script
- Local staging dev server: Restarted; the Administrator login route returned HTTP 200

No production migration, deployment, provider activation, worker activation, feature enablement, or production environment change was performed during cleanup.
