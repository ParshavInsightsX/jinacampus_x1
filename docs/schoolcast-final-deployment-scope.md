# SchoolCast MVP Final Deployment Scope

## Status

**Production release remains NO-GO as of 15 August 2026.**

The repository now distinguishes the deployable no-premium SchoolCast subset from capabilities that require unapproved infrastructure or provider services. This work does not authorise a production migration, worker activation, external-provider activation, tenant feature enablement, source-code publication, or application deployment.

The production database still lacks approved Point-in-Time Recovery or equivalent evidence for the required recovery objective. Supabase documents automatic daily backups for paid plans and recommends manual off-site exports for Free projects; PITR is a paid add-on. A manual export does not certify the approved 15-minute RPO.

## Server Release Scopes

`SCHOOLCAST_RELEASE_SCOPE` is a server-only environment variable. It must never use a `NEXT_PUBLIC_` name.

| Scope | Intended use | Available capabilities |
|---|---|---|
| `DISABLED` | Production default and rollback state | No SchoolCast workspace, workers, providers, webhooks, or tenant controls |
| `IN_APP_CORE` | Candidate no-premium production pilot after all remaining release gates pass | Immediate in-app notices/broadcasts, approval workflow, authenticated inbox, read/acknowledgement state, read-only calendar projection, aggregate analytics |
| `FULL` | Approved staging and future fully certified infrastructure only | Complete implemented SchoolCast capability set, still subject to tenant flags, RBAC, consent, storage, worker, and provider gates |

Production defaults to `DISABLED` when the variable is absent. A SchoolCast worker cannot start unless the scope is explicitly `FULL` and the existing hosted-worker environment checks also pass.

## IN_APP_CORE Boundary

The candidate core scope is intentionally limited to authenticated school users:

- Communication channels are restricted server-side to `IN_APP`.
- Composer audiences are restricted to active branch users selected through role or all-user rules. Class-section recipient delivery remains disabled.
- Notice/broadcast creation, submission, approval, rejection, immediate publication, cancellation, archival, inbox reads, and acknowledgements retain existing tenant, branch, academic-year, permission, transaction, and audit controls.
- Scheduling is unavailable because it requires a continuously certified worker.
- Preferences expose only in-app general notices. Email, WhatsApp, external-channel consent, and source-event preference options are hidden and server-clamped off.
- Stale tenant flags cannot activate blocked capabilities. Effective feature state is always intersected with the deployment policy.
- Direct URLs, actions, attachment APIs, provider operations, templates, delivery operations, webhooks, and worker endpoints fail closed when their capability is not deployed.
- Administrator Portal controls show only capabilities allowed by the server release scope. In `DISABLED`, school administration does not query pending SchoolCast columns.

## Production Environment Contract

Before a disabled-code deployment:

1. Set `SCHOOLCAST_RELEASE_SCOPE=DISABLED` in Production and Preview.
2. Keep `SCHOOLCAST_WORKER_ENABLED=false`.
3. Do not configure production SchoolCast provider credentials or webhook secrets.
4. Keep every production tenant SchoolCast flag false.
5. Confirm no external SchoolCast provider configuration is `READY` in `LIVE` mode.
6. Confirm no SchoolCast worker or scheduler host targets production.

Before a future `IN_APP_CORE` pilot:

1. Approve and verify production backup, restore, and rollback evidence.
2. Separately approve and apply the additive migration.
3. Deploy the reviewed application artifact while the scope remains `DISABLED`.
4. Run Administrator Portal, existing-module, RBAC, and cross-tenant smoke tests.
5. Separately approve `IN_APP_CORE`, then change only the server release scope.
6. Separately enable the approved pilot tenant's `enabled`, `inApp`, `notices`, `approvals`, and optional `analytics` flags.
7. Verify every other SchoolCast flag remains false and delivery mode remains `DRY_RUN`.
8. Run controlled Principal/Office Staff/Teacher/Staff and negative browser QA.

These actions are separate gates. Completing one does not authorise the next.

## Verification Evidence

Verification completed on 15 August 2026:

- Prisma format, schema validation, and client generation passed.
- Strict TypeScript passed.
- The full regression suite passed: 122 test files and 970 tests.
- The Next.js production build passed and generated 117 routes.
- `git diff --check` passed with line-ending notices only.
- No lint script is configured.
- The protected staging readiness audit confirmed one synthetic IN_APP/DRY_RUN pilot, no external provider configurations, no approved external templates or consent records, no non-DRY_RUN outbox rows, and production readiness `BLOCKED`.
- The linked Vercel project still serves the previously deployed production artifact. This SchoolCast source was not committed, pushed, migrated, enabled, or deployed.
- Vercel Production was explicitly updated on 15 August 2026 with `SCHOOLCAST_RELEASE_SCOPE=DISABLED` and `SCHOOLCAST_WORKER_ENABLED=false`; the control plane confirms both variable names are present. No deployment was triggered, so the currently serving production artifact was not changed.
- Missing or unsupported release-scope values resolve to `DISABLED`. Worker startup remains blocked unless the worker flag is explicitly true, the release scope is `FULL`, and the hosted-worker topology checks pass.
- Final read-only production verification reports only `20260814120000_add_schoolcast_mvp_foundation` pending. The SchoolCast schema is absent and therefore cannot be activated before a separately approved migration.
- Production GradeBook flags were corrected to disabled for both existing tenants under the previously approved safeguard. Two platform audit records were written and the post-check reports zero enabled tenants.
- The consolidated decision and independent action gates are recorded in `docs/final-production-readiness.md`.

## Monitoring and Support

The core scope does not require a background worker or external provider. Production monitoring must still cover:

- application error rate and latency for SchoolCast pages/actions;
- database connection-pool saturation;
- failed publication transactions and audit-write failures;
- in-app notification creation and acknowledgement counts;
- tenant feature-state changes;
- cross-tenant/permission denial anomalies;
- rollback readiness and named support ownership.

Do not claim external delivery health, queue throughput, attachment scanning, or worker availability while those capabilities are disabled.

## Rollback

1. Set `SCHOOLCAST_RELEASE_SCOPE=DISABLED` and redeploy/restart the application.
2. Confirm SchoolCast navigation and direct routes are unavailable.
3. Keep tenant SchoolCast flags false.
4. Keep workers and provider webhooks disabled.
5. Preserve additive tables and immutable audit/history records; do not destructively roll back business data.
6. Revert to the previously verified application deployment if an unrelated regression remains.
7. Record the incident, affected tenants, timestamps, and verification evidence without secrets or recipient data.

## Known Limitations

- The no-premium scope reaches only authenticated JinaCampus user accounts.
- Parents and guardians without approved portal accounts cannot receive in-app SchoolCast messages.
- Class-section communication, homework/classwork delivery, attachments, scheduling, automation, templates, provider operations, and external delivery remain disabled.
- FeeDesk remains excluded because its source module is unavailable.
- Production recovery and formal sign-offs remain release blockers.

See `docs/schoolcast-deferred-capabilities-backlog.md`, `docs/schoolcast-production-release-gates.md`, and `docs/schoolcast-release-approval-ledger.md`.
