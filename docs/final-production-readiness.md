# JinaCampus Final Production Readiness Ledger

Status date: 15 August 2026

Overall decision: **NO-GO for the current GradeBook and SchoolCast production release.**

This ledger consolidates final technical verification without authorising a production migration, source publication, application deployment, worker activation, provider activation, or tenant feature enablement. Existing production workflows remain the release baseline.

## Verified Release Evidence

### Isolated staging database

- The protected staging target was verified before every command.
- All 23 committed Prisma migrations are applied.
- `prisma migrate diff` reports no schema difference.
- The catalog contains 115 application tables, 409 foreign keys, 480 indexes, zero invalid indexes, and zero unvalidated constraints.
- GradeBook has 43 tenant-scoped tables; SchoolCast has 18 RLS-enabled tables.
- GradeBook and SchoolCast migration SQL contains no destructive table/column removal, truncation, rename, or existing-column type change.

### GradeBook staging

- Only the synthetic staging pilot tenant is enabled; the control tenant is disabled.
- Portal results are disabled.
- Principal, Examination Coordinator, assigned Teacher, unassigned Teacher, Staff, disabled-tenant, cross-tenant, cross-institution, cross-branch, cross-year, direct-record, and client-scope injection checks pass.
- Feature disable denies server access while preserving GradeBook data.
- The private storage probe verifies private access, server upload/download, MIME rejection, signed URL expiry, cleanup, and QA audit evidence.

### SchoolCast staging

- Only the synthetic staging pilot tenant is enabled.
- The effective staging scope is `IN_APP` and `DRY_RUN`; email, WhatsApp, source automation, and teacher direct publish are disabled.
- Catalog, functional/RBAC, source-module integration, private storage, malware rejection, scanner recovery, idempotency, retry, and bounded load checks pass.
- The 500-item bounded worker profile completed with five workers, stale-lease recovery, no worker errors, no duplicate replay, and zero external-provider requests.
- FeeDesk remains excluded because its source module is unavailable.

### Application quality gates

- `npx prisma format`: pass.
- `npx prisma validate`: pass.
- `npx prisma generate`: pass.
- `npm run typecheck`: pass.
- `npm test`: pass, 122 files and 970 tests.
- `npm run build`: pass, 117 application routes.
- `git diff --check`: pass; Windows line-ending notices only.
- `npm pkg get scripts.lint`: no lint script is configured.

## Confirmed Issues Corrected

1. Prisma metadata drift was removed by mapping existing PostgreSQL-truncated index names and database defaults in `prisma/schema.prisma`. No database migration or data change was required.
2. GradeBook staging drift was corrected so portal results remain disabled.
3. SchoolCast staging drift was corrected so email, WhatsApp, source automation, and teacher direct publish remain disabled.
4. Production GradeBook was found enabled for `jinacampus-demo` and `rda-main`. Under the previously approved release safeguard, all GradeBook flags were disabled for both tenants in one guarded transaction. Two platform audit records were written, and the post-check reports zero enabled tenants.

## Production State

- The production target was verified using non-secret host/project metadata.
- Exactly one committed migration is pending: `20260814120000_add_schoolcast_mvp_foundation`.
- The SchoolCast columns and tables are absent, so SchoolCast cannot be enabled on the current production schema.
- GradeBook is disabled for every production tenant setting row.
- Production SchoolCast release scope and worker controls remain fail closed according to the recorded Vercel control-plane evidence.
- Read-only HTTPS smoke checks returned 200 for /api/health, /administrator/login, and /login on the currently deployed baseline. This does not validate the un-deployed release source or authenticated workflows.
- Supabase production advisors report no error or warning findings. Informational findings remain: 98 server-only RLS-without-policy notices, 205 unindexed foreign-key notices, and 80 unused-index notices; these require separate database-hardening review.
- The Supabase organization is currently on the Free plan. Supabase documents that Free projects need manual off-site exports and that PITR requires a paid plan/add-on, so the approved 15-minute RPO is not certified: https://supabase.com/docs/guides/platform/backups and https://supabase.com/docs/guides/deployment/going-into-prod.
- A guarded staging logical-backup rehearsal restored and validated the synthetic SchoolCast schema in 73.314 seconds. It proves restore mechanics only and explicitly does not certify production RPO, production RTO, off-site retention, or Storage object recovery; see docs/schoolcast-production-recovery-rehearsal.md.
- No production migration, code deployment, worker, provider, storage, or SchoolCast tenant flag was changed during this finalization pass.

## Remaining Mandatory Gates

### GradeBook

- Complete application-level import validation-report retention, cancelled/failed cleanup, and audited deletion.
- Complete marks lifecycle, result calculation/publication, report-card history, concurrency, and production-scale load certification.
- Certify executable workers, retry/dead-letter behavior, observability, and recovery.
- Embed and validate an approved Unicode PDF font.
- Finalise student/guardian publication access policy.
- Obtain academic approval for calculations and board/report-card formats.
- Verify production backup/PITR or an approved equivalent and complete a restore rehearsal.

### SchoolCast

- Provide and validate the two-host inventory and independent failure domains.
- Provide signed rehearsal evidence for failover, alerts, dead-letter operations, restart, and database-pool behavior.
- Certify hosted private malware scanning, retention, monitoring, and incident procedures.
- Complete email/WhatsApp sender, template, consent, webhook, billing, rate-limit, and real-recipient pilot gates before any live provider use.
- Approve and provision either Supabase PITR or a continuous-WAL equivalent, add independent encrypted database and Storage recovery copies, then pass a production-representative RPO/RTO restore rehearsal. The synthetic staging restore-mechanics rehearsal has passed but does not close this gate.
- Record named operations, engineering, security/privacy, business/product, and pilot-owner approvals.

The repository validators intentionally remain blocked for missing host inventory, rehearsal evidence, and production-readiness evidence. These are external release gates, not code failures.

## Independent Production Authorisations

| Action | Current status |
|---|---|
| Apply the additive SchoolCast production migration | Not authorised |
| Publish the release commit | Authorised under `SC-AUTH-DEPLOY-20260815`; execution pending reviewed staging |
| Deploy code with SchoolCast scope `DISABLED` | Authorised under `SC-AUTH-DEPLOY-20260815`; blocked by pending separately authorised migration compatibility gate |
| Provision or activate production workers/schedulers | Not authorised |
| Provision or activate live email/WhatsApp providers | Not authorised |
| Change production scope to `IN_APP_CORE` | Not authorised |
| Enable a production pilot tenant | Not authorised |

Approval of one row does not approve any other row.

## Rollback Boundary

1. Keep GradeBook and SchoolCast tenant flags disabled.
2. Keep `SCHOOLCAST_RELEASE_SCOPE=DISABLED` and `SCHOOLCAST_WORKER_ENABLED=false`.
3. Preserve additive tables and immutable audit/history records; prefer feature disable and forward repair over destructive rollback.
4. Do not run `prisma migrate reset` against staging or production.
5. Restore the previously verified application artifact if a future disabled-scope deployment causes an unrelated regression.

## Source Publication Boundary

The working tree contains a broad GradeBook/SchoolCast release set. The unrelated untracked entry `({tag` is explicitly excluded. Restricted SchoolCast source publication is authorised under `SC-AUTH-DEPLOY-20260815`; production migration remains separately unauthorised, and deployment must not execute until the generated Prisma client is compatible with the production schema.

## Recommended Next Task

Choose and approve one production recovery architecture: funded Supabase PITR or a separately operated continuous-WAL equivalent with independent encrypted database and Storage recovery. Rehearse that architecture against a production-representative isolated target, demonstrate RPO at or below 15 minutes and RTO at or below 4 hours, then record the four named approvals. Only after those steps pass should production migration and disabled-scope deployment be requested as two separate actions.
