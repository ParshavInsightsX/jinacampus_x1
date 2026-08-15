# SchoolCast Production Recovery Rehearsal

## Decision

**NO-GO for SchoolCast production activity as of 15 August 2026.**

The approved recovery objectives remain:

- Recovery Point Objective (RPO): at or below 15 minutes.
- Recovery Time Objective (RTO): at or below 4 hours.

The database restore mechanics passed against the approved synthetic staging environment. The production recovery architecture did not pass because continuous recovery, an independent off-site recovery copy, Supabase Storage object recovery, and production-scale RPO/RTO evidence are not available.

No production data was exported. No production database, Storage object, feature flag, worker, provider, source commit, or deployment was changed.

## Current Platform Facts

- The production Supabase project and the isolated staging project were both `ACTIVE_HEALTHY` during the check.
- The Supabase organisation remains on the Free plan.
- Production has 22 completed Prisma migrations; the latest completed migration is the Principal password-recovery migration.
- The SchoolCast schema is absent from production, so SchoolCast cannot be activated there.
- The production Vercel project retains a current ready deployment and an earlier ready rollback candidate. No live rollback was executed.
- The application defaults SchoolCast to `DISABLED` in production and rejects invalid release-scope values. Worker startup defaults to disabled and additionally requires the `FULL` release scope.

Supabase documents that automatic daily backups apply to Pro, Team, and Enterprise projects, recommends manual off-site exports for Free projects, and offers PITR as a paid add-on. It also states that database backups do not include Storage objects. See [Database Backups](https://supabase.com/docs/guides/platform/backups) and the [Production Checklist](https://supabase.com/docs/guides/deployment/going-into-prod).

## Staging Rehearsal

The guarded rehearsal command was:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\backup-schoolcast-staging.ps1
```

The script:

1. Loaded only the protected staging environment file.
2. Rejected the production project reference and any unapproved database target.
3. Created a PostgreSQL custom-format dump of the staging `public` schema without owner or privilege restoration.
4. Verified that `pg_restore` could read the archive.
5. Restored the archive with `--exit-on-error` into a disposable PostgreSQL container.
6. Validated the Prisma ledger, synthetic tenant baseline, public tables, foreign keys, indexes, constraints, and SchoolCast schema.
7. Deleted the temporary credential file and disposable restore container.
8. Wrote an ignored local manifest and the secret-free evidence summary at `docs/evidence/schoolcast-recovery-rehearsal-2026-08-15.json`.

Measured result:

| Check | Result |
|---|---|
| Backup duration | 61.872 seconds |
| Isolated restore and validation duration | 10.436 seconds |
| Full rehearsal duration | 73.314 seconds |
| Backup size | 788,312 bytes |
| Checksum verification | Pass |
| Completed migrations | 23 |
| Failed or rolled-back migrations | 0 |
| Synthetic tenants | 2 |
| Public tables | 116 |
| Foreign keys | 409 |
| Invalid indexes | 0 |
| Unvalidated constraints | 0 |
| SchoolCast schema in restored staging copy | Present |

These measurements describe a small synthetic staging database. They do not predict production restore duration and do not certify the production RTO.

## Recovery Gate Matrix

| Requirement | Status | Evidence or limitation |
|---|---|---|
| Production backup availability | Blocked | Free-plan control plane provides no approved continuous production backup evidence. |
| PITR or approved alternative | Blocked | Neither funded PITR nor an approved continuous-WAL architecture is configured. |
| Database restore procedure | Pass for staging mechanics only | Custom dump restored and validated in an isolated disposable database. |
| Migration rollback readiness | Procedure ready; production drill not authorised | The SchoolCast migration is additive. Rollback disables SchoolCast, returns to an approved application artifact, retains additive history, and uses a reviewed forward fix rather than destructive table removal. |
| Application rollback readiness | Partial | Ready deployment candidates exist and the rollback command is documented; production traffic was not changed for this rehearsal. |
| Feature-flag rollback | Pass in code and staging | Missing/invalid production scope resolves to `DISABLED`; worker startup is separately fail closed; staging feature-disable queue-claim denial passed. |
| Database Storage recovery | Blocked | A PostgreSQL logical dump includes Storage metadata only, not object bytes. |
| RPO at or below 15 minutes | Blocked | An on-demand dump is not continuous recovery and has no guaranteed backup interval. |
| RTO at or below 4 hours | Not certified | Staging mechanics completed in 73.314 seconds, but production scale and Storage recovery were not rehearsed. |
| Secret-free supporting evidence | Pass | The tracked evidence contains no database URL, password, token, recipient contact, or provider credential. |

## Rollback Procedures

### Migration rollback

1. Keep `SCHOOLCAST_RELEASE_SCOPE=DISABLED` and `SCHOOLCAST_WORKER_ENABLED=false`.
2. Do not enable any tenant SchoolCast flag.
3. If post-migration validation fails, stop before application deployment.
4. Preserve additive SchoolCast tables and audit/history data; do not run an unreviewed destructive down migration.
5. Correct the schema through a reviewed forward migration, or restore to an isolated target from the approved recovery point before any controlled cutover.

### Application rollback

1. Keep SchoolCast disabled before moving production traffic.
2. Roll back or promote the last approved ready Vercel deployment.
3. Verify `/api/health`, Administrator login, school login, dashboard access, and core CampusCore/Academia/StaffBoard routes.
4. Confirm SchoolCast navigation and direct routes remain unavailable.
5. Scan runtime errors and retain the failed deployment for investigation.

### Feature rollback

1. Set the server-only release scope to `DISABLED`.
2. Keep the worker kill switch `false`.
3. Keep all tenant SchoolCast flags false.
4. Keep providers, webhooks, schedulers, and hosted workers inactive.
5. Preserve immutable communication and audit records for reconciliation.

### Storage recovery

Production approval requires a separate encrypted, independently retained object backup and restore drill for private GradeBook and SchoolCast buckets. The drill must validate object bytes, metadata, tenant-safe paths, checksums, quarantine state, retention, deletion recovery, signed-access denial, and key recovery.

## Required Architecture Decision

One of these paths must be explicitly approved and then rehearsed:

1. Fund Supabase Pro/required compute/PITR, configure monitoring and Storage recovery, and test an isolated point-in-time restore.
2. Approve and operate a self-managed continuous-WAL architecture with encryption, independent off-site copies, monitoring, key recovery, Storage backups, named ownership, and an isolated restore rehearsal.

A scheduled logical dump may improve the fallback baseline, but it cannot be represented as meeting the 15-minute RPO without a reliable schedule, independent destination, monitoring, and measured recovery evidence.

## Approvals and Authorisations

Operations, technical/engineering, security/privacy, and business/product approvals remain pending because the recovery gate is incomplete. Development or QA activity is not a formal approval.

The following independent production actions remain **not authorised**:

- Apply the SchoolCast production database migration.
- Prepare/push/deploy the SchoolCast release code.
- Activate workers or schedulers.
- Activate email or WhatsApp providers.
- Change production scope to `IN_APP_CORE`.
- Enable a production pilot tenant.

After an approved recovery architecture passes its production-representative rehearsal, record all four named approvals in `docs/schoolcast-release-approval-ledger.md`, then request database migration and disabled-scope code deployment as two separate authorisations.
