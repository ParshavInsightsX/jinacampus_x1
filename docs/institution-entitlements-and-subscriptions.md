# Institution Entitlements and Subscription Readiness

## Status

Implemented in source and covered by unit tests. The additive migration `20260818233000_add_institution_entitlements` passed both a clean full-history migration and a baseline-to-upgrade rehearsal against disposable local PostgreSQL with synthetic data. The upgrade rehearsal verified subscription-plan preservation, Attendance and GradeBook backfills, the same-tenant institution foreign key, and completed Prisma migration history.

The migration has not been applied to a deployment database in this task. No billing provider, payment request, production feature change, or deployment was performed.

## Purpose

JinaCampus now separates two independent authorization decisions:

1. **Institution entitlement:** whether the institution currently has access to a module or feature under its plan, trial, add-on, or manual grant.
2. **Role permission:** whether the signed-in school user may perform the requested operation within their tenant, institution, branch, and academic-year scope.

A protected request succeeds only when both checks pass. Navigation filtering is only a usability aid; service and query boundaries remain authoritative.

## Data Model

### TenantSubscription

One lifecycle record per tenant stores:

- Plan code
- Trial, active, grace-period, suspended, cancelled, or expired status
- Trial and subscription period dates
- Grace-period end date
- Future provider references
- Future plan-limit and add-on JSON

Provider reference, limit, and add-on fields are a foundation only. They are not client-controlled and no billing provider is connected.

### InstitutionEntitlement

Each row is scoped by `tenantId`, `institutionId`, module, and feature. A composite foreign key prevents an institution from being linked to another tenant. Access is one of:

- `DISABLED`: no feature access.
- `READ_ONLY`: authorised users may read retained records, but protected writes are blocked.
- `FULL`: authorised users may read or write according to their RBAC permissions.

Disabling or expiring access does not delete attendance, GradeBook, audit, academic, or other historical records.

## Attendance Entitlements

The Administrator Portal exposes the current Attendance capabilities per institution:

| Capability | Server-enforced behavior |
|---|---|
| Attendance module | Parent gate for all Attendance access |
| Student attendance | Student attendance screens and records |
| Staff attendance | Staff attendance screens, own history, and records |
| Mark attendance | Student attendance submission |
| Attendance correction | Student and staff correction mutations |
| QR attendance | QR generation, deactivation, scan, and mobile scan APIs |
| Attendance reports | Student and staff report queries |
| Late and absence management | Attendance exception automation and related notification queuing |
| Holiday and leave integration | Access to integrated attendance treatment; reconciliation remains an integrity safeguard |
| Attendance settings | Attendance and notification-setting reads and mutations |
| Approval and audit access | Attendance locking and approval-oriented operations |

Attendance exports are still deferred. The reports entitlement does not claim an export workflow that does not exist.

Holiday and approved-leave reconciliation is not deleted or reversed when access is disabled. These records are retained so subscription changes cannot corrupt historical working-day, paid-holiday, or authorised-leave treatment. Shared compliance audit records also remain retained under CampusCore audit governance.

## GradeBook Compatibility

The same institution entitlement model now fronts the existing GradeBook feature controls. The migration mirrors existing GradeBook flags into institution entitlements, and Administrator Portal entitlement changes mirror back to legacy tenant flags during the transition. Existing GradeBook data is not altered or deleted.

GradeBook remains disabled wherever its existing flags were disabled. Its separate controlled-release gates still apply.

## Administrator Workflow

1. Open the school in the separate Administrator Portal.
2. Edit **Subscription readiness** to record plan and lifecycle status.
3. Edit **Institution Module Access** for each institution.
4. Choose Disabled, View only, or Full access for each capability.
5. Save the subscription and entitlement forms separately.

The interface states that it records access only and does not charge the institution. Entitlement updates and subscription lifecycle updates are written to the platform audit log. Arbitrary module or feature names submitted by a client are rejected against the server-owned catalog.

School Principals and staff cannot use these forms. They continue to manage user permissions only through approved school RBAC workflows.

## Provisioning and Migration Behavior

Newly provisioned institutions receive:

- A subscription lifecycle row derived from the tenant plan; newly provisioned trials receive a bounded 30-day end date
- Full Attendance access to preserve current Base MVP behavior
- GradeBook disabled by default

The additive migration backfills the same state for existing institutions. It adds no destructive drops, renames, or data deletion. The new tables have indexes, uniqueness constraints, tenant-safe foreign keys, date-range checks, and server-only RLS enablement.

Application code intentionally fails closed if the entitlement schema is expected but unavailable. Administrator school profile, branding, lifecycle, and deletion workflows remain available, while subscription and module-access controls show a database-update-required state. Direct entitlement mutations return a safe setup error, and newly created schools defer commercial-access initialization for the migration backfill rather than failing the entire school transaction.

Apply the migration before enabling or deploying subscription-controlled capabilities. The compatibility state prevents a schema mismatch from crashing unrelated Administrator Portal workflows; it is not a substitute for the approved migration.

## Error and Usability Behavior

Users receive plain-language outcomes for:

- Subscription inactive
- Module not included
- Feature not included
- View-only access
- Entitlement configuration unavailable
- Institution scope unavailable

Disabled navigation entries are omitted on desktop and mobile. Direct requests and modified client submissions are still rejected by server checks. Forms retain large labelled controls, grouped module sections, explicit save actions, and explanatory copy suitable for non-technical operators.

## Security Rules

- Never trust client tenant, institution, branch, user, role, or permission claims.
- Resolve institution access from the authenticated server context and tenant-scoped branch lookup.
- Require the module entitlement, feature entitlement, subscription lifecycle, and RBAC permission.
- Reject unsupported or duplicate entitlement keys.
- Audit subscription and entitlement mutations without recording secrets.
- Preserve historical records when access changes.
- Keep billing credentials and provider actions out of this foundation.

## Free-Tier and Deferred Scope

This foundation uses PostgreSQL, Prisma, Zod, and existing application infrastructure. It adds no premium dependency.

Deferred items:

- Billing and payment-provider integration
- Meter collection and automatic usage-limit enforcement
- Add-on purchasing and checkout
- Automated renewal invoices and payment retries
- Customer self-service plan changes
- Attendance data export
- Full subscription retention and archival policy approval

The `limitsJson`, `addOnsJson`, and provider-reference fields must remain server-managed until those workflows are approved and validated.

## Release Gate

Before deployment:

1. Take an approved database backup and verify the target connection.
2. Run `npx prisma migrate deploy` against the approved non-production database first.
3. Verify migration status, Attendance FULL backfill, GradeBook legacy-state mirroring, constraints, and schema drift.
4. Run authenticated Administrator Portal subscription and entitlement CRUD QA.
5. Verify Disabled, View only, Full, suspended, expired, trial, and grace-period behavior.
6. Run Principal, Teacher, Office Staff, Staff, direct-URL, modified-request, cross-branch, cross-institution, and cross-tenant denial QA.
7. Re-run student marking, correction, reports, staff QR, mobile API, settings, dashboard, leave, and calendar smoke flows.
8. Obtain separate approval before any production migration or deployment.

## Future Module Rule

Every future module must register a server-owned module and feature catalog, define default access, use institution entitlement checks at query and mutation boundaries, keep RBAC independent, preserve data on disablement, expose safe Administrator Portal controls, and document its migration and release gates before activation.