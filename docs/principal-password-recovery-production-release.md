# Principal Password Recovery Production Release

Date: 2026-08-13

Status: **Production migration, authority, deployment, and public smoke passed**

## Release Scope

- Principal password recovery only
- Additive migration `20260812143000_add_principal_password_recovery`
- Explicit recovery authority for one approved active Platform Administrator
- Email and SMS delivery remain manual
- GradeBook remains disabled for production school tenants

No password, database URL, reset token, session secret, private backup path, or
provider credential is recorded in this document.

## Backup and Recovery Gate

Before migration, a custom-format logical backup of the production `public`
schema was written outside the repository with a SHA-256 manifest and restricted
local ACLs. The dump was restored into an isolated PostgreSQL 17 container.

The restore rehearsal confirmed:

- 21 completed baseline Prisma migrations
- the recovery tables were absent before migration
- the restored schema and migration ledger were readable
- the temporary restore container was removed after verification

The database is on the Supabase free plan, so this verified logical backup is
the release recovery baseline. Supabase Storage objects are not part of a
PostgreSQL logical dump and were not changed by this release.

Rollback strategy:

1. Revoke recovery authority to disable administrator operation immediately.
2. Roll back the Vercel deployment if application behavior regresses.
3. Retain the additive recovery tables during ordinary application rollback.
4. Use the verified logical backup only for database disaster recovery, with a
   controlled maintenance window and a new pre-restore backup.

## Migration Result

- Guarded target: production Supabase project
- Connection: IPv4 session pooler for Prisma Migrate
- Pre-deploy state: 22 committed migrations, one pending recovery migration
- Deploy result: migration applied successfully
- Post-deploy state: 22 migrations, schema up to date
- Recovery request and rate-limit tables exist
- Platform recovery authority and tenant-local Principal ID columns exist

## Authority and Audit

The approved active Platform Administrator received
`canManagePrincipalRecovery=true` through the protected operator command.
Existing sessions for that administrator were revoked. A platform audit event
records the authority change without credentials.

The approved production GradeBook flags were disabled for `jinacampus-demo` and
`rda-main` before application deployment. All ten GradeBook capability flags are
false for both tenants, and each change has a platform audit event. GradeBook was
not enabled by this release.

## Deployment and Smoke

Release commit: `9fb37e7`

Vercel completed its remote Next.js production build and marked the deployment
Ready. The production alias points to the new deployment.

HTTP-level production smoke passed:

- `/api/health` returned 200
- `/administrator/login` returned 200
- `/forgot-password` returned 200
- `/principal-password-reset` returned 200
- unauthenticated `/administrator/principal-recovery` redirected to the
  Administrator login
- malformed recovery requests returned safe 400 responses
- unknown-school and unknown-account requests returned the same generic 200
  response shape
- malformed reset completion returned a safe 400 response
- no password hash, token hash, database URL, Prisma error, or stack trace was
  detected in tested responses
- synthetic public requests created no Principal recovery request

The isolated browser control surface was unavailable during this production
pass, and no protected Platform Administrator password handoff existed locally.
Authenticated production queue interaction was therefore not bypassed or
claimed. The complete authenticated approval, rejection, expiry, single-use,
session-revocation, replay, cross-tenant, and unauthorised-role matrix passed in
the approved staging environment before production release.

## Delivery Status

Email and SMS providers remain deferred. Production contains no recovery row
claiming automated delivery. Until a provider is approved and integrated, the
system must continue to record and display `MANUAL_DELIVERY_REQUIRED`.

## Database Advisories

Post-migration Supabase advisors reported informational findings only:

- RLS enabled without client policies on server-only Prisma tables
- unindexed foreign keys
- unused indexes

These pre-existing database-hardening items are not part of the recovery release
and remain a separate task. Server-side authentication, authorization, tenant
resolution, and audited Prisma access remain authoritative.
