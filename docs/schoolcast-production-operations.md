# SchoolCast Production Operations Contract

## Release Boundary

SchoolCast remains **production blocked**. This document defines the operational contract that must be approved and provisioned before production migration or live delivery. It does not represent hosted-worker provisioning, provider approval, a production load certificate, or stakeholder sign-off.

The current safe deployment posture is:

- feature flags off for production tenants;
- email and WhatsApp disabled;
- delivery mode `DRY_RUN` outside an approved recipient pilot;
- FeeDesk integration excluded because the source module is unavailable;
- private attachments remain quarantined until the scanner marks them `SAFE`.

## Approved Pilot Capacity Envelope

The requesting product owner approved these target values on 14 August 2026. They are release targets, not certified service levels; target-scale hosted evidence remains mandatory.

| Measure | Proposed pilot target | Required approval/evidence |
|---|---:|---|
| Recipient fan-out burst | 5,000 recipients in 15 minutes | Product volume forecast and staging test at or above target |
| Source event acknowledgement | p95 under 2 seconds | APM trace from source transaction through durable event write |
| Due queue age | p95 under 5 minutes; alert at 10 minutes | Hosted worker dashboard and alert test |
| Delivery-attempt completion | p95 under 15 minutes, subject to provider quota | Provider quota, rate-limit, and pilot evidence |
| Attachment scan queue age | p95 under 2 minutes; alert at 10 minutes | Hosted scanner latency/load evidence |
| Worker availability | 99.9% monthly proposed | Hosting plan, health checks, and on-call approval |
| Recovery point objective | 15 minutes | Production backup/PITR evidence and restore rehearsal |
| Recovery time objective | Four hours proposed | Isolated restore rehearsal and owner approval |

No production capacity claim may be made from the existing 1,000-message synthetic DRY_RUN result alone.

## Worker Topology

The repository provides a dedicated durable entrypoint:

```powershell
npm run worker:schoolcast
```

Production must run it in a hosted worker environment with server-only database, Storage, provider, and scanner credentials. Use `SCHOOLCAST_WORKER_RUN_MODE=CONTINUOUS`; configure batch size, concurrency, lease duration, polling interval, and alert thresholds through the validated environment contract.

Required topology:

1. At least two independently restartable worker instances after load certification.
2. A scheduler/process supervisor that restarts failed workers and records deployment health.
3. PostgreSQL remains the durable queue and source of truth.
4. `FOR UPDATE SKIP LOCKED`, lease ownership, deterministic idempotency keys, bounded concurrency, and retry ceilings remain authoritative.
5. The web application must not share a generic cron secret with SchoolCast delivery authority.
6. Horizontal scaling is allowed only after the database pool and provider quotas are sized and tested.

The worker image is reproducible through `Dockerfile.schoolcast-worker`. A zero-license-cost baseline now exists in `infra/schoolcast-self-hosted` with two worker containers, private health/Prometheus endpoints, Prometheus rules, Alertmanager, and Grafana OSS. It is a certification lab until deployed across two independent hosts; two containers on one host are not high availability. The linked Vercel Hobby project remains the web platform only and cannot replace continuous worker supervision. Do not add an inadequate daily cron or share `CRON_SECRET` with SchoolCast.

The distributed staging profile runs one replica per approved host, requires unique replica IDs and external dead-man heartbeat checks, and renders both private worker and Alertmanager targets on each monitor. It remains hard-coded to `STAGING`. See `docs/schoolcast-distributed-staging-readiness.md`.

## Queue Monitoring and Alerts

`getSchoolCastWorkerHealth` reports queue depth, oldest due-item age, processing state, terminal failures, attachment backlog, and scanner readiness without exposing hostnames or secrets. Each continuous worker exposes private `/livez`, `/readyz`, and `/metrics` endpoints. Container restart uses liveness only; queue degradation alerts operators without causing a destructive restart loop.

Production dashboards must chart:

- source events by `PENDING`, `PROCESSING`, `FAILED`, and age;
- GradeBook bridge backlog and dead letters;
- scheduled publications due and overdue;
- outbox `QUEUED`, `RETRYING`, `SENDING`, `UNDELIVERABLE`, and age;
- attachment `PENDING`, `FAILED`, `REJECTED`, scanner availability, and age;
- provider success, retryable failure, permanent failure, bounce, complaint, and webhook lag;
- database pool saturation, worker cycle duration, restarts, and exception rate.

At minimum, alert on queue depth/age thresholds, any terminal source event, any UNDELIVERABLE row, scanner unavailability, repeated provider authentication failures, webhook signature failures, and sustained database pool pressure. Severity and response targets are defined in docs/schoolcast-on-call-runbook.md; named rotations and external destinations remain pending.

## Dead-Letter Operations

Terminal delivery and integration failures are visible in the SchoolCast delivery ledger. Requeue is server-authorised and audited:

- `schoolcast.outbox.retry` for terminal delivery rows;
- `schoolcast.outbox.admin_reconcile` for failed domain events and GradeBook dead letters.

Operators must first resolve the underlying provider, payload, source-record, or scanner issue. Requeue never changes tenant, branch, academic-year, recipient, or source ownership and does not accept those claims from the client. Permanently failed jobs must remain retained for reconciliation and audit.

## Malware Scanner

The adapter uses ClamAV `INSTREAM`, validates the file again after private quarantine download, and fails closed. A `PING` readiness probe reports only `READY`, `DISABLED`, or a safe unavailable code. Scanner failure leaves the object quarantined and schedules bounded retry; malware or permanent integrity failure rejects the attachment and removes the quarantined object.

Production requirements still pending:

- a privately reachable hosted scanner, never a public unauthenticated ClamAV port;
- signature-update monitoring and engine-version visibility;
- availability and latency alerts;
- quarantine retention and suspicious-file incident procedure;
- failover or approved fail-closed outage procedure;
- access logs and a scanner load certificate at the approved attachment profile.

## Source Integrations

| Source | Transactional producer | SchoolCast consumer | Current status |
|---|---|---|---|
| Student attendance | Attendance create/update/correction | Student and authorised guardian audience | Synthetic staging cutover and idempotent replay passed |
| Staff attendance | QR check-in/out and authorised correction | Linked staff recipient | Synthetic staging cutover and idempotent replay passed |
| Staff leave | Submit/update/review/withdraw/cancel action | Linked staff recipient | Synthetic staging cutover and recipient resolution passed |
| Calendar/holiday | Create/update/cancel per authorised branch | Scoped student/guardian/staff audiences | Synthetic staging cutover and recipient resolution passed |
| GradeBook | Existing GradeBook publication outbox | Eligible published-result audience | Synthetic staging bridge passed; GradeBook remains independently gated |
| FeeDesk | None | None | Explicitly excluded from this release |

Each producer writes a duplicate-safe event in the same database transaction as the source mutation. The consumer resolves authoritative records again and enforces tenant, branch, academic-year, feature, consent, and audience controls before publication.

## Email and WhatsApp Gate

Live delivery remains prohibited until verified senders, approved templates, consent and preferences, server-only credentials, signed webhooks, provider quotas, billing caps, complaint/opt-out handling, and controlled real-recipient pilots are approved. `DRY_RUN` must not be represented as provider delivery.

## Backup and Recovery Gate

Before production migration, record the exact commit and migration head, confirm database backup/PITR availability, export reproducible Storage configuration, and rehearse an isolated restore. Database backups do not by themselves restore private Storage objects, provider state, or secrets; those require separate recovery procedures.

The restore rehearsal must prove the approved RPO/RTO, migration history, tenant flags disabled by default, queue consistency, private object recovery, worker shutdown, provider disablement, and application rollback to a schema-compatible build.

Supabase Free does not include automatic backups or PITR. Manual off-site exports remain useful disaster-recovery evidence but do not prove the approved 15-minute PITR objective. Production therefore stays blocked unless PITR is separately funded or a self-managed recovery architecture is separately approved, implemented, and certified.

## Go/No-Go Rule

Production remains **NO-GO** until capacity, hosted workers, scanner, provider pilots, backup/restore evidence, and all formal approvals are recorded in the release ledger. The approved source-module producer set has passed synthetic staging cutover QA; production source cutover remains part of the controlled rollout.
