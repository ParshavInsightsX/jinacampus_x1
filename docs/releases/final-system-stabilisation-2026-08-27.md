# Final System Stabilisation And Production-Readiness Ledger

## Decision

- Evidence date: 2026-08-27
- Source baseline: `4160eef` on `release/web-v1-20260826`
- Active release scope: CampusCore, Academia, StaffBoard Lite, provider-independent in-app notifications, institution entitlements, and controlled GradeBook
- Production mutation in this pass: none
- Commit, push, environment change, and deployment in this pass: none
- P0 findings: none confirmed in the inspected source, automated suite, aggregate production-integrity checks, or public production smoke
- Final status: **not ready for an unconditional public-production declaration**

The source candidate passes all available automated release gates. Production publication remains separately controlled because the live GradeBook feature state conflicts with its documented release boundary, durable password-login throttling is absent, the approved recovery objective is not certified on the current database plan, formal legal publication approval is incomplete, and authenticated production/device certification is not available in this pass.

## Stabilisation Fixes

### Tenant Context Hardening

School and mobile session context now accept branch access only when all of the following are true:

- access belongs to the authenticated tenant;
- branch belongs to the authenticated tenant;
- branch is active; and
- owning institution is active.

This prevents an active branch under an inactive institution from being combined with a fallback active institution or academic year. Focused tests cover valid access, cross-tenant access, cross-tenant branch, inactive branch, and inactive institution.

### Dashboard Connection-Pool Stability

Dashboard data loaders now cap each query stage at two concurrent Prisma calls and avoid redundant staff counts. The rendered dashboard already loads service pairs sequentially, so the revised path stays within the small managed runtime pool instead of launching large query bursts. No metric, tenant filter, branch filter, role filter, or response contract changed.

## Verified Evidence

### Source And Build

| Gate | Result |
| --- | --- |
| Prisma format | Pass |
| Prisma validate | Pass |
| Prisma client generation | Pass |
| Prisma migration status | Pass; all 32 migrations applied |
| TypeScript | Pass |
| Automated tests | Pass; 129 files and 988 tests |
| Production build | Pass; 115 static pages generated |
| `git diff --check` | Pass; existing Windows line-ending notices only |
| Production dependency audit | Pass; zero production vulnerabilities |
| Lint | Not available; no lint script is defined |

The full dependency audit reports one low-severity `esbuild` development-server advisory. It does not affect the production dependency set and remains assigned to the dedicated dependency-upgrade task.

### Production Runtime

- The deployed production commit matches the recorded source baseline.
- Vercel reports the deployment as ready.
- No runtime error cluster was reported in the preceding seven days.
- `/`, `/login`, and `/administrator/login` returned HTTP 200.
- `/api/health` returned HTTP 200 and reported database connectivity.
- Unauthenticated `/dashboard` and `/administrator` requests redirected safely.
- `/api/dev/env-check` returned HTTP 404 in production.
- Camera, frame, referrer, and MIME-sniffing security headers were present.
- Cron endpoints failed closed because `CRON_SECRET` is not configured. Scheduled digest and quiet-hour processing therefore remain disabled; immediate in-app processing remains available through the existing service path.

### Database And Tenant Integrity

Read-only aggregate checks returned zero mismatches for:

- branch-to-institution tenant scope;
- academic-year-to-institution tenant scope;
- user branch access and role assignment scope;
- student, class-section, and enrollment scope;
- staff profile scope;
- student and staff attendance scope; and
- institution entitlement scope.

Additional readiness checks returned zero active tenants without an active institution, active institutions without an active branch, active school users without an active role or branch, active staff linked to inactive users, multiple active academic years per institution, or active branch access into an inactive branch or institution.

All public application tables have RLS enabled. Supabase currently reports informational RLS-without-policy notices because browser database access is intentionally fail-closed and server operations use Prisma. Performance advisors are informational unindexed-foreign-key and unused-index findings; index changes require measured workload evidence and a separate database-hardening review.

### Storage

- Institution logos use the intentionally public branding bucket.
- Regulatory documents, staff leave documents, staff photographs, and student documents use private buckets with MIME and size restrictions.
- No production GradeBook private bucket is present. This is consistent only while GradeBook file workflows remain disabled.

## Release Blockers Requiring Explicit Action

### P1: GradeBook Is Enabled Outside Its Approved Boundary

Read-only production inspection confirms both current tenants have the GradeBook module, all inspected legacy GradeBook flags, and ten GradeBook entitlements enabled. This conflicts with the recorded requirement to keep GradeBook disabled until pilot, storage, worker, concurrency, multilingual PDF, portal-access, and academic sign-off gates pass. Production also lacks the required private GradeBook bucket.

Required action: separately authorise an audited production containment change that sets every GradeBook legacy flag and institution entitlement to `DISABLED` for both tenants while preserving all GradeBook data. This pass did not mutate that state.

### P1: Password Login Has No Durable Brute-Force Limiter

Passkey and principal-recovery endpoints have persisted attempt controls, but school password login, platform administrator password login, and mobile password login do not. Generic errors and strong password hashing reduce disclosure and credential risk but do not provide distributed rate limiting in a serverless deployment.

Required action: approve an additive, database-backed attempt ledger and lockout policy, or an approved durable edge rate limiter, with safe identifier/IP hashing, expiry cleanup, audit events, and tests. An in-memory limiter is not an acceptable production substitute.

### Operational Recovery Objective

A protected logical production backup and isolated PostgreSQL 17 restore rehearsal passed on 2026-08-27. The evidence validated 32 migrations, 132 public tables, 475 foreign keys, indexes, and constraints. The current Supabase plan does not certify continuous Point-in-Time Recovery or the previously stated 15-minute RPO.

Required action: fund PITR or approve and rehearse a self-managed continuous recovery architecture. Do not represent the current periodic logical-backup process as a 15-minute RPO.

### Legal Publication Gate

The legal-readiness checker correctly remains blocked. Legal documents are draft/non-effective and required entity, grievance, support, version, and effective-date settings are not approved. Qualified Indian counsel and authorised signatories must approve the final documents before public-launch legal readiness is claimed.

## Accepted Or External Limitations

- Physical Android Chrome, iPhone/iPad Safari, and installed-PWA camera certification was previously accepted as a documented release limitation. It was not performed or re-certified here.
- The embedded visual browser and standalone browser verifier were unavailable. Public routes were verified over HTTPS, but no screenshot-based or credentialed visual QA is claimed.
- No approved production QA credentials were used. Authenticated role and scope behavior is covered by the automated suite and prior isolated browser evidence, not by a new production login in this pass.
- Realtime delivery, browser push, active digest/quiet-hour execution, and hard-retention deletion remain deferred and disabled.
- Live WhatsApp delivery remains outside the provider-independent in-app notification release boundary.

## Cleanup And Simplification Register

| Item | Current use | Recommendation | Approval |
| --- | --- | --- | --- |
| Legacy OTP helper/service | Public OTP routes are retired; helper can log an OTP only outside production | Deprecate and remove after one final import/usage review | Review required |
| Fixed `allowedDevOrigins` LAN IP | Development-only historical pilot setting | Remove or replace with documented local configuration when LAN QA is retired | Routine review |
| `getMvpDashboardSummary` | Test-only combined loader | Keep until dashboard query consolidation is separately reviewed | None now |
| Supabase informational index advisories | No confirmed production regression | Use measured query plans before adding/removing indexes | Migration approval |
| Low-severity development `esbuild` advisory | Test/development toolchain only | Resolve in the dedicated dependency-upgrade task | Dependency review |

Existing ignored recovery artifacts and `temp_meta_data` remain untouched. No destructive cleanup was performed.

## Controlled Next Actions

1. Obtain explicit approval for the audited production GradeBook-disable containment change.
2. Obtain explicit architectural and migration approval for durable password-login throttling.
3. Complete legal configuration and qualified sign-off before public launch.
4. Certify an approved recovery architecture against the required RPO/RTO.
5. Re-run authenticated production smoke with approved QA accounts and physical-device QR/PWA certification when devices are available.
6. Only after blockers are resolved, review the exact source diff, create a release commit, push, deploy, and repeat public plus authenticated post-deployment smoke checks under separate release authorisation.

## Rollback Position

The changes in this pass are source-only and introduce no schema or data migration. Application rollback is the previous verified deployment. The additive production schema should remain in place. Production feature-state containment, data restores, environment changes, and destructive actions each require separate approval and audit evidence.
