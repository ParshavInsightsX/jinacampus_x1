# SchoolCast Production Approval and Authorization Requests

Status date: 15 August 2026

Overall state: **REQUESTED, AWAITING EXTERNAL DECISIONS**

The production recovery gate remains blocked. These records collect the required decisions without authorizing or executing any production action. A request is not an approval, and a conditional response is not executable authorization.

## Formal Acknowledgement

Acknowledgement ID: `SC-ACK-20260815-01`

The release-governance process was formally acknowledged on 15 August 2026. The acknowledgement confirms that no database migration, source commit, push, deployment, production environment change, worker activation, provider activation, or feature-flag change was performed. It does not satisfy any sign-off or authorize either production request.

The secret-free machine record is `docs/evidence/schoolcast-production-approval-acknowledgement-2026-08-15.json`.

## Formal Approval Requests

| Request ID | Approval | Decision | Approver | Requested at (UTC) | Required evidence |
|---|---|---|---|---|---|
| `SC-APR-OPS-20260815` | Operations | Pending | Not supplied | 2026-08-15T08:38:31Z | Recovery ownership, monitoring, alerting, runbooks, escalation, backup scheduling, and restore operations |
| `SC-APR-ENG-20260815` | Technical/engineering | Pending | Not supplied | 2026-08-15T08:38:31Z | Reviewed migration, schema validation, regression results, rollback procedure, and production-target verification |
| `SC-APR-SEC-20260815` | Security/privacy | Pending | Not supplied | 2026-08-15T08:38:31Z | Backup encryption, independent retention, key recovery, Storage recovery, secrets, privacy, audit, and incident controls |
| `SC-APR-PROD-20260815` | Product/business | Pending | Not supplied | 2026-08-15T08:38:31Z | Disabled-scope release acceptance, operational limitations, deferred providers, support ownership, and rollback acceptance |

Each approval record is valid only when it contains:

1. An explicit `APPROVED` or `REJECTED` decision.
2. The accountable approver's full name and authority or role.
3. A UTC decision timestamp.
4. A durable, secret-free evidence reference.
5. No unresolved conditions.

Development work, QA results, repository changes, or this request packet do not constitute any of the four approvals.

## Authorization Request 1: Production Database Migration

Request ID: `SC-AUTH-MIG-20260815`

Current status: **PREPARED, NOT AUTHORISED, PREREQUISITES BLOCKED**

Decision requested from the named production database authority:

> After the production recovery gate is `PASS` and all four formal approvals are recorded, do you explicitly authorize applying only the reviewed additive migration `20260814120000_add_schoolcast_mvp_foundation` to the approved production database and performing its immediate post-migration validation?

This authorization includes only:

- Preflight verification of the approved production target.
- Migration status inspection.
- Application of the named additive migration.
- Immediate schema, constraint, migration-ledger, and baseline regression validation.

It explicitly excludes:

- Preparing or pushing a source commit.
- Deploying application code.
- Enabling SchoolCast for any tenant.
- Activating workers, schedulers, providers, email, or WhatsApp.
- Creating or mutating production Storage resources unless separately approved.

## Authorization Request 2: Disabled-Scope Code Publication and Deployment

Request ID: `SC-AUTH-DEPLOY-20260815`

Current status: **PREPARED, NOT AUTHORISED, PREREQUISITES BLOCKED**

Decision requested from the named release authority:

> After the production recovery gate is `PASS`, all four formal approvals are recorded, and the separately authorized production migration has passed validation, do you explicitly authorize preparing the reviewed release commit, pushing that commit, and deploying the reviewed application with `SCHOOLCAST_RELEASE_SCOPE=DISABLED` and `SCHOOLCAST_WORKER_ENABLED=false`?

This authorization includes only:

- Review of the explicit release manifest and exclusion of unrelated working-tree entries.
- Preparation and push of the approved source commit.
- Application deployment with SchoolCast fail closed.
- Post-deployment health, authentication, core-module regression, direct-route denial, and configuration smoke tests.

It explicitly excludes:

- Database migration authority.
- Changing SchoolCast to `IN_APP_CORE` or `FULL`.
- Enabling a production pilot tenant.
- Activating workers or schedulers.
- Activating email, WhatsApp, webhooks, or external-provider delivery.

## Recording Rule

Responses to the two authorization requests must be recorded separately with the authorizer's full name, authority, UTC timestamp, decision, and evidence reference. Approval of one request never authorizes the other. Responses received before their prerequisites pass remain non-executable and must be reconfirmed after the final preflight.

Do not record credentials, database URLs, provider secrets, recipient contacts, or private recovery artifacts in this document.
