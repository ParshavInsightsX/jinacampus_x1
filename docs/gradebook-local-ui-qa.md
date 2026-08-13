# GradeBook Local UI QA

Status date: 12 August 2026

Overall result: **The GradeBook UI is implemented and available for the synthetic staging pilot. Production remains disabled.**

## Root Cause

The ordinary `npm run dev` command loads the repository `.env`, which targets the main JinaCampus Supabase project. GradeBook is intentionally disabled for that production environment, so its navigation group is hidden and direct routes fail closed.

The approved synthetic pilot and its GradeBook feature flags exist only in the isolated `gradebook-mvp-staging` project. Route registration was not missing: the App Router contains the GradeBook dashboard, configuration, examination, marks, import, results, report-card, publication, correction, enrichment, analytics, history, and API routes.

## Safe Local Launcher

Do not edit `.env` and do not enable GradeBook in the main project.

1. Stop the ordinary port-3000 development server with Ctrl+C.
2. Run the read-only readiness preflight:

~~~powershell
npm run qa:gradebook:staging:ready
~~~

3. Start the staging-backed local server:

~~~powershell
npm run dev:gradebook:staging
~~~

4. Open:

~~~text
http://localhost:3000/?schoolId=jinacampus-demo
~~~

The launcher reads the protected staging-only environment under the current Windows profile, refuses the production project, verifies the private GradeBook bucket, confirms the synthetic pilot and role fixtures, checks that port 3000 is free, and then starts Next.js with localhost-specific application and WebAuthn origins.

If port 3000 is still occupied, the launcher stops with a clear message instead of starting against or interfering with the existing server.

## Synthetic Test Identities

Use the synthetic password already configured as `DEV_DEMO_USER_PASSWORD` in the protected staging environment. The launcher and QA output never print it.

| Workflow | Synthetic identity |
|---|---|
| Principal | principal@demo.jinacampus.test |
| Examination Coordinator | office@demo.jinacampus.test |
| Assigned Teacher | teacher@demo.jinacampus.test |
| Unassigned Teacher denial | unassigned-teacher@gradebook.qa.invalid |
| Staff denial | staff@demo.jinacampus.test |

The School ID is `jinacampus-demo`.

## Verified Access

- Principal login and GradeBook workspace: pass.
- Examination Coordinator login and GradeBook workspace: pass.
- Assigned Teacher login and exact assessment workspace: pass.
- Unassigned Teacher workspace contains no assigned assessment.
- Staff login succeeds, but direct GradeBook access returns safe not-found.
- The disabled control tenant remains disabled.
- All GradeBook subfeatures required for local pilot testing are enabled except the deferred student/guardian portal-results flag.
- Private Storage configuration and the synthetic object probe pass.

### Authenticated local HTTP rerun

| Identity | Login | GradeBook route | Expected result |
|---|---:|---:|---|
| Principal | 200 | 200 | Workspace rendered |
| Examination Coordinator | 200 | 200 | Workspace rendered |
| Assigned Teacher | 200 | 200 | Assigned workspace rendered |
| Unassigned Teacher | 200 | 200 | Empty scoped workspace rendered |
| Staff | 200 | 404 | Safe permission denial |

The unauthenticated GradeBook route redirects to the School ID login page. The production build independently registered the GradeBook dashboard, setup, examination, assessment, marks, import, submission, verification, approval, result, publication, report-card, history, enrichment, correction, analytics, and API routes.

During this QA pass, the ordinary main-environment server was already using port 3000. It was deliberately left untouched. An isolated staging-backed server on port 3100 was used for the authenticated checks above. The supported operator procedure for moving the staging test surface to port 3000 remains the guarded launcher documented earlier in this file.

## Manual QA Scope

The launcher makes the implemented GradeBook pages available for responsive layout review, navigation, examination setup, marks workflows, result calculation, report-card workflows, loading/empty/success/error states, and role/scope denial checks.

This establishes an accessible local/staging test surface; it does not claim that every visual state and mutable end-to-end workflow has completed manual sign-off. It also does not complete the remaining production gates for import validation-report storage, retention and cleanup, full workflow regression, concurrency/load certification, asynchronous workers, multilingual PDFs, backup/PITR evidence, publication policy, or academic sign-off.

No production database flag, production Storage resource, production deployment, or RDA school record was changed.
