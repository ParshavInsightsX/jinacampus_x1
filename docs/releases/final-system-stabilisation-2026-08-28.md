# Final System Stabilisation And Production-Readiness Ledger

## Executive Decision

- Evidence date: 2026-08-28
- Deployed source baseline: `8b1bad3` on `release/web-v1-20260826`
- Production URL: `https://jinacampus.vercel.app`
- Production mutation, configuration change, commit, push, or deployment in this pass: none
- Confirmed unresolved P0 defects: **0**
- Confirmed unresolved in-scope P1 defects in the reviewed source candidate: **0**
- Final status: **suitable for a controlled source release after review, but not ready for an unconditional public-launch declaration**

The active product must be assessed against what is actually implemented and approved. The current release scope is CampusCore, Academia, StaffBoard Lite, provider-independent notifications, institution entitlements, and a controlled GradeBook implementation. FeeDesk, InsightBoard, full SchoolCast, and Student/Guardian portals are not active release modules and must not be represented as tested or production-ready.

## Scope And Disposition

| Product area | Current disposition | Release conclusion |
| --- | --- | --- |
| CampusCore | Implemented and active | In scope; automated, schema, and aggregate isolation checks pass |
| Academia | Implemented and active | In scope; attendance, enrollment, academic-year, and resource-scope protections covered |
| StaffBoard Lite | Implemented and active | In scope; staff attendance and QR workflows remain subject to physical-device certification |
| Provider-independent notifications | Implemented and active | In-app path available; deferred channels remain fail closed |
| Institution entitlements | Implemented and active | Server-enforced and aggregate tenant-scope checks pass |
| GradeBook | Implemented but disabled for both production tenants | Preserve data; do not enable until its separate storage, worker, academic, portal, and QA gates pass |
| FeeDesk | Not an implemented release module | Excluded roadmap scope, not a broken production workflow |
| InsightBoard | Not an implemented release module | Excluded roadmap scope, not a broken production workflow |
| Full SchoolCast | Removed/deferred | Do not expose or claim provider delivery; the approved notification foundation remains separate |
| Student/Guardian portals | Deferred | Privacy and workflow certification must precede any future activation |

## Priority Findings

### P0 - None Confirmed

No authentication bypass, tenant leak, cross-scope data mismatch, destructive migration, financial corruption, academic corruption, invalid database constraint, or public private-document bucket was confirmed by the inspected source, automated tests, read-only production metadata, or aggregate integrity probes.

### P1 - Fixed In The Source Candidate, Publication Pending

#### Tenant And Institution Context Hardening

School and mobile session contexts now accept branch access only when the access row and branch belong to the authenticated tenant, the branch is active, and the owning institution is active. This closes the possibility of retaining an active branch under an inactive institution while resolving fallback context.

The shared predicate is used by both authentication paths and is covered for valid, wrong-tenant, inactive-branch, and inactive-institution cases. Client-supplied tenant, branch, role, or permission claims are not made authoritative.

#### Managed Database Pool Stability

Dashboard loaders now bound each query stage to approximately two concurrent Prisma operations and derive staff totals from one grouped query. This addresses the observed small-pool timeouts without changing tenant filters, branch filters, role filters, metric definitions, or response contracts.

These corrections exist only in the reviewed working tree. They require an explicit source review, commit, push, deployment, and post-deployment smoke test before they are considered live.

#### Access-Aware Login And Workspace Routing

Password and passkey authentication now return through the authenticated root resolver instead of assigning a destination from role names alone. The resolver combines server-derived permissions with institution attendance entitlements before choosing a dashboard, workspace, student-attendance, staff-history, own-card, or operator-scanner destination.

Attendance fast-login no longer routes every successful user to the operator scanner. Scanner access requires staff-attendance and QR-write entitlements plus the scan permission; staff self-card access requires QR-read entitlement and the self-card permission; teachers fall back to their permitted attendance or student workspace. True multi-responsibility users retain the workspace chooser.

#### QR Read And Write Capability Separation

Navigation now distinguishes read-only access to a staff member's own active QR card from write/operator access to scanning and credential management. A read entitlement no longer exposes scanner or credential routes, while every protected service remains authoritative on the server.

### Previously Reported P1 Gates Now Closed

- GradeBook containment: `jinacampus-demo` and `rda-main` have legacy GradeBook flags disabled and ten GradeBook entitlements per tenant set to `DISABLED`. `rda-main` GradeBook rows were removed under approval; `jinacampus-demo` retains five testing/audit rows. The changes are audited.
- Durable login protection: migration `20260828120000_add_password_login_throttling` is applied. School, platform-administrator, and mobile password endpoints share database-backed account/source throttling. Synthetic production smoke verified failure, HTTP 429 throttling, and recovery after the configured interval.

## Security And Isolation Review

### Authentication

- School and platform-administrator session cookies are HTTP-only, `SameSite=Lax`, and secure in production.
- Passwords remain hashed; recovery paths do not expose existing passwords.
- Password throttle records are durable across serverless instances and apply to school, mobile, and platform-administrator password realms.
- Successful production login smoke with an approved real QA account remains pending because no credential handoff was available. No credential was guessed, reset, read, or printed in this pass.

### RBAC, Scope, And Entitlements

- The platform administrator remains a separate platform identity; the production aggregate contains one active platform administrator.
- Production tenant role inventories use the canonical school roles: `PRINCIPAL`, `OFFICE_STAFF`, `TEACHER`, and `STAFF`.
- Navigation visibility is generated from server-filtered access and entitlement context; protected services remain authoritative.
- Read-only aggregate checks found zero cross-tenant or cross-scope mismatches in branch access, role assignments, students, sections, enrollments, staff, attendance, or entitlements.
- GradeBook server and navigation gates are disabled for both production tenants.

### Files And Storage

- `institution-logos` is intentionally public for public branding and restricts MIME type and size.
- Institution regulatory documents, staff leave documents, staff profile photos, and student documents are private buckets with MIME and size restrictions.
- No `gradebook-private` production bucket exists. This is correct while GradeBook remains disabled and is a mandatory blocker to future GradeBook activation.
- No private student, staff, regulatory, or academic object was read during this review.

### HTTP And Browser Security

Production `/login` returns anti-framing, MIME-sniffing, referrer, and camera/microphone policy headers. A Content Security Policy is not currently emitted. Introducing a CSP requires nonce/hash design plus authenticated browser regression because Next.js scripts and approved media/storage origins must continue to work; track this as a controlled P2 security-hardening task rather than adding an untested policy during stabilisation.

## Database And Integrity Evidence

- Prisma validates successfully against the committed schema.
- Production migration history contains 33 applied migrations and reports current.
- Aggregate production probes returned zero findings for branch/institution tenant mismatch, academic-year scope mismatch, user branch or role mismatch, student or staff scope mismatch, class-section and enrollment mismatch, attendance mismatch, entitlement mismatch, duplicate active enrollments, duplicate student attendance, invalid indexes, unvalidated constraints, and public application tables without RLS.
- No raw production row contents, credentials, hashes, or private files were exported by the integrity probe.
- The latest protected logical backup and isolated PostgreSQL 17 restore rehearsal passed. It remains a point-in-time logical recovery artifact, not continuous recovery certification.

## Performance And Stability

- Dashboard concurrency was the only confirmed material runtime query-pressure issue in the reviewed scope; the candidate fix bounds pool usage.
- Shared queries remain tenant and branch scoped; no new unbounded operational query path was introduced by the candidate.
- The Staff QR countdown no longer seeds client state with render-time `Date.now()`; its clock starts after hydration. Staff leave balance forms now receive a stable institution-time-zone year from the server. These changes remove two active server/client mismatch risks.
- Production dependencies report zero known vulnerabilities.
- The full dependency audit reports one low-severity Windows development-server `esbuild` advisory. Handle it through a dedicated dependency-upgrade task; do not apply an unreviewed forced dependency update to the release branch.
- No lint command exists in `package.json`; lint success must not be claimed.

## Workflow And Navigation Conclusions

- The implemented navigation is role aware and entitlement aware, with separate mobile navigation rather than a compressed desktop sidebar.
- All 33 configured navigation targets resolve to application pages, and active route titles now cover institution legal identity, Student ID Card, staff leave, staff QR card, and workspace-chooser routes.
- The only route-title audit exceptions are two controlled GradeBook compatibility aliases that immediately redirect; they were not expanded during this active-module stabilisation.
- No active links to FeeDesk, InsightBoard, full SchoolCast, or Student/Guardian portals were accepted as part of this release scope.
- `getMvpDashboardSummary` currently appears test-only. Keep it until dashboard consolidation receives a separate dependency review.
- The legacy OTP helper and fixed development LAN origin are deprecation candidates, not release blockers. Remove them only after import, mobile QA, and configuration impact review.
- No destructive role, permission, route, migration-history, or database cleanup was performed.

## Validation Matrix

| Gate | Result |
| --- | --- |
| Prisma validation | Pass |
| Production migration status | Pass; 33 migrations current |
| TypeScript strict check | Pass |
| Automated tests | Pass; 130 files and 1006 tests |
| Production build | Pass; 115 pages |
| `git diff --check` | Pass; existing Windows line-ending notices only |
| Production dependency audit | Pass; zero production vulnerabilities |
| Aggregate tenant/data integrity | Pass; all inspected mismatch and duplicate counts are zero |
| Public HTTPS and security-header smoke | Pass |
| Local public-route smoke | Pass; school, administrator, and attendance login render, health responds, protected dashboard redirects |
| Embedded screenshot-based browser QA | Unavailable in this execution environment; not claimed |
| Authenticated production role matrix | Pending approved QA credentials |
| Android/iPhone/iPad/PWA camera certification | Accepted but unresolved physical-device limitation |
| FeeDesk reconciliation | Not applicable; FeeDesk is not an active release module |
| Student/Guardian portal privacy | Not applicable to active scope; mandatory before future activation |
| Lint | Unavailable; no lint script exists |

## Remaining Production And Public-Launch Gates

### Recovery Objective

The current Supabase Free plan does not provide the previously required continuous PITR/15-minute RPO. Periodic logical dumps do not meet that objective. Resolve this through funded managed PITR, a separately approved and rehearsed self-managed WAL archive/restore architecture, or formal acceptance of a less stringent RPO. This is an infrastructure/governance blocker, not an application-code defect.

### Legal Publication

The legal-readiness gate correctly remains blocked. Documents are drafts and `noindex`; required legal entity, grievance, support, version, effective-date, counsel, and authorised-signatory approvals are incomplete. Qualified Indian legal review and executive approval are required before claiming public-launch legal readiness.

### Physical Device Certification

Android Chrome, iPhone/iPad Safari, and installed-PWA camera workflows have not been physically certified in this environment. The documented limitation was accepted for the prior source release, but it remains unresolved and must not be represented as completed device QA.

### GradeBook Activation

GradeBook must remain disabled until private storage, workers, concurrency/load behavior, Unicode PDF rendering, Student/Guardian publication policy, assignment and cross-scope browser QA, academic approval, and rollback evidence are independently completed.

## Release Recommendation

1. Review the exact tenant-context and dashboard-pool source diff.
2. If approved, create a narrowly scoped release commit, push, and deploy it without changing module feature flags.
3. Run public health/header smoke plus authenticated Principal, Office Staff, Teacher, and Staff smoke using approved QA accounts.
4. Keep GradeBook disabled and all deferred provider channels fail closed.
5. Resolve recovery and legal gates before declaring general public-launch readiness.
6. Complete physical QR/PWA certification when authorised Android, iPhone, and iPad devices are available.

## Rollback Position

This audit pass makes no database, storage, environment, feature-state, or deployment change. The candidate source corrections require no schema migration. Application rollback is the current verified deployment `8b1bad3`; production data and additive schema remain in place. Any future production data mutation, migration, feature activation, or destructive cleanup requires its own approval and audit evidence.
