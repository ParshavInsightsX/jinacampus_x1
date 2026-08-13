# GradeBook Staging Pilot Browser QA

Status date: 12 August 2026

Overall result: **Pilot feature and server-side role/scope gate passed in isolated staging. GradeBook remains blocked from production.**

## Environment And Safety

- Target: the dedicated `gradebook-mvp-staging` Supabase project.
- Pilot tenant: `jinacampus-demo`, containing synthetic `.test` and `.invalid` records only.
- Disabled control tenant: `gradebook-control`.
- Production project, Vercel deployment, and RDA school data were not read or changed.
- The guarded runner validated both database URLs against the approved staging project reference before every fixture, flag, and verification command.
- Browser QA ran from an isolated, gitignored application copy on a separate local port so the existing local development server was not stopped.
- Passwords, database URLs, session cookies, and storage credentials were not printed or recorded.

## Feature Flag Evidence

| Check | Result |
|---|---|
| Pilot master flag | Pass |
| Pilot configuration, imports, marks, calculation, co-scholastic, report-card, publication, and analytics subfeatures | Pass |
| Pilot parent/student portal results | Disabled |
| Every non-pilot tenant | Disabled |
| Flag changes | Platform-audited |
| School user self-enablement | Not available |

The feature-disable rehearsal disabled the pilot at the server, denied GradeBook access, preserved all fixture row counts, and re-enabled only the approved pilot. No GradeBook rows were deleted or rewritten by the rehearsal.

## Authenticated Role Matrix

| Role / identity | Browser result | Server result |
|---|---|---|
| Principal | Pass: full pilot workspace and configured navigation rendered | Authorised |
| Examination Coordinator | Pass: pilot-only permission bundle rendered the authorised workspace | Authorised |
| Assigned Teacher | Pass: limited navigation and assigned assessment rendered | Authorised only for assigned scope |
| Unassigned Teacher | Pass: GradeBook opened with no assessments; direct assigned-assessment probe disclosed no record | Safe not-found |
| Staff | Pass: GradeBook was absent from navigation; direct route returned safe 404 after repair | Permission denied |
| Disabled control-tenant Principal | Pass: GradeBook was absent from navigation; direct route returned safe 404 | Feature disabled |

The existing five-role model remains unchanged. `GRADEBOOK_COORDINATOR` is a staging-only custom permission bundle attached to the synthetic Office user; it is not a new canonical school role or production seed.

## Scope And Tampering Matrix

| Boundary | Result | Evidence |
|---|---|---|
| Tenant | Pass | A pilot session could not read the control tenant assessment by direct URL. |
| Institution | Pass | A second institution inside the pilot tenant was denied at the service layer, and authenticated headless Chrome confirmed its assessment direct URL returned safe not-found without leaking the title. |
| Branch | Pass | An assessment in an inaccessible synthetic branch was not returned. |
| Academic year | Pass | A prior-year assessment was not returned in the active-year context. |
| Class / section / subject / teacher assignment | Pass | The assigned Teacher could open the exact composite assessment; the unassigned Teacher could not. |
| User permission | Pass | Staff direct access was denied before GradeBook page data loaded. |
| Modified branch cookie | Pass | An injected inaccessible branch ID fell back to the authorised Main Branch and was not reflected in the API response. |
| Modified client scope fields | Pass | Strict schemas rejected client `tenantId`, `branchId`, `actorUserId`, and `role` fields. |
| Feature-disabled tenant | Pass | Direct route and service access failed closed while data remained intact. |

Dynamic assessment denials use Next's native not-found control flow. Because the parent App Router layout can begin streaming before a nested page resolves, an RSC-style fetch can be a soft 404 with HTTP 200; the response contains no restricted record content and the server emits no unhandled application error. Top-level role and feature denials return HTTP 404.

## Bugs Found And Fixed

1. **Slow staging fixture preparation**
   - Cause: hundreds of sequential hosted-database permission upserts.
   - Fix: idempotent batched `createMany(..., skipDuplicates: true)` role-permission setup and a minimal control role.

2. **Staging QA connection exhaustion**
   - Cause: the migration runner's intentional single direct connection was reused by application-level QA, and six role contexts initially loaded concurrently. This caused Prisma pool timeouts and one transient remote reset.
   - Fix: preserve the exact protected URL, apply bounded in-process QA parameters (`connection_limit=3`, `pool_timeout=30`) to every pilot/browser command, and load the six synthetic identities serially. Migration commands remain single-connection and the secret file is unchanged.
   - Re-test: the complete role/scope matrix and feature-disable rehearsal passed, including the same-tenant cross-institution fixture.

3. **Disabled/forbidden GradeBook route returned generic server error**
   - Cause: expected feature and permission errors reached the generic route error boundary.
   - Fix: require `gradebook.dashboard.view` in section navigation and translate expected 403/404 route guard failures to Next `notFound()`.
   - Re-test: Staff and disabled control-tenant direct routes returned 404 without GradeBook data.

4. **Inaccessible assessment used generic error handling**
   - Cause: service-level safe 404 was not translated to Next route control flow.
   - Fix: map the typed assessment 404 to `notFound()`.
   - Re-test: cross-scope and unassigned-teacher probes disclosed no assessment content and generated no unhandled server error.

## Private Storage Status

Infrastructure verification passed:

- `gradebook-private` exists and is private.
- Object size is limited to 10 MB.
- Allowed types are PDF, XLSX, and CSV.
- No `public`, `anon`, or `authenticated` object policy grants direct browser access.
- Server code enforces tenant/branch/academic-year prefixes and 60-second signed report-card links.

The protected staging runtime now contains the required server-only Storage configuration. `StorageAssert` and the deterministic synthetic `StorageProbe` passed against the approved staging project, including private direct-access denial, server upload/download, MIME rejection, signed URL expiry, deletion cleanup, and synthetic audit evidence. The application variable is `GRADEBOOK_STORAGE_BUCKET` (not `GRADEBOOK_PRIVATE_BUCKET`) and remains `gradebook-private`.

The masked configurator and staging evidence are recorded in `docs/gradebook-staging-storage-qa.md`. Source review also confirmed that validation-report objects, import-file expiry/retention, cancelled/failed import cleanup, and audited import deletion are not implemented. Those remain application release blockers.

## Regression Checks

- Prisma schema formatting and validation passed.
- Strict TypeScript checking passed.
- The full test suite passed: 112 files and 917 tests.
- The isolated production build passed and generated 98 routes.
- The build ran from the staging QA copy so the existing local development server was not interrupted.

## Remaining Release Gates

- Private storage application workflow completion and QA, including validation reports, retention, cleanup, and audited deletion.
- Backup/PITR or tested restore evidence.
- Full functional workflow regression beyond the role/scope matrix.
- Concurrency and production-scale load certification.
- Executable asynchronous worker certification.
- Embedded licensed Unicode font and multilingual report-card certification.
- Student/guardian identity and published-result portal approval.
- Formal academic approval for calculations, board formats, and report-card layouts.
- Existing-module regression smoke.
- Production migration, deployment, and production feature enablement remain unauthorised.

## Recommended Next Task

Implement and retest the missing validation-report, retention, cleanup, and audited deletion controls, then complete authenticated marks-import and report-card storage QA. In parallel, obtain provider backup/PITR evidence. Do not migrate or enable GradeBook in production.
