# SchoolCast Capacity and On-Call Runbook

## Approved Pilot Targets

The requesting product owner approved this pilot capacity envelope on 14 August 2026. Approval establishes the target; it does not certify the current hosting platform or authorise production delivery.

| Measure | Approved target | Alert or escalation point |
|---|---:|---:|
| Recipient fan-out burst | 5,000 recipients within 15 minutes | Capacity breach if the run exceeds 15 minutes |
| Source event acknowledgement | p95 under 2 seconds | p95 at or above 2 seconds for 10 minutes |
| Due queue age | p95 under 5 minutes | Oldest due item at or above 10 minutes |
| Delivery-attempt completion | p95 under 15 minutes, subject to provider quota | p95 at or above 15 minutes |
| Attachment scan queue age | p95 under 2 minutes | Oldest scan at or above 10 minutes |
| Worker availability | 99.9% monthly | Any unavailable primary replica or both replicas unhealthy |
| Recovery point objective | 15 minutes | Backup/PITR evidence does not meet 15 minutes |
| Recovery time objective | 4 hours | Restore rehearsal exceeds 4 hours |

The existing synthetic staging result is below the burst target and remains reference evidence only. Target-scale certification must run against the approved hosted topology before production release.

## Required Hosted Topology

- Build the worker from Dockerfile.schoolcast-worker.
- Run two independently restartable replicas in the same region as the database where practical.
- Set SCHOOLCAST_WORKER_ENABLED=true, SCHOOLCAST_WORKER_DEPLOYMENT_ENVIRONMENT=PRODUCTION, and SCHOOLCAST_WORKER_RUN_MODE=CONTINUOUS only after the production migration and release gate are approved.
- Keep database, Storage, scanner, and provider credentials server-only in the hosting provider's secret store.
- Start with batch size 100, concurrency 10, lease 180 seconds, and a 1-second poll interval only after database-pool load certification. Reduce concurrency when pool saturation is observed.
- Use the hosting platform process supervisor for restart and replica health. PostgreSQL remains the durable queue and SKIP LOCKED leases remain the concurrency authority.
- Keep SCHOOLCAST_WORKER_ENABLED=false in the Vercel web application until the production schema is ready. Do not equate CRON_SECRET with SCHOOLCAST_WORKER_SECRET.
- Assign each hosted replica a unique worker ID and unique external HTTPS dead-man heartbeat URL. The monitor must be outside both worker failure domains, and the URL must remain server-only.

Vercel Hobby cannot host the required continuous worker and does not provide the required custom alert capability on the current plan. No paid Vercel upgrade is approved. The accepted baseline is the self-hosted stack in `infra/schoolcast-self-hosted`, deployed on two independent Linux failure domains with Prometheus, Alertmanager, and Grafana OSS. Free compute may be used for rehearsal, but it is not production evidence until availability, host-loss, alert-loss, load, and recovery drills pass. The web deployment alone is not the worker platform.

## Dashboard Contract

The hosted operations dashboard must show:

1. Worker replica state, restart count, cycle duration, exception count, external heartbeat configuration, and heartbeat delivery failures.
2. Domain-event pending, processing, failed, and oldest-age values.
3. GradeBook bridge backlog and dead-letter count.
4. Scheduled publications due and overdue.
5. Outbox queued, retrying, sending, undeliverable, throughput, and oldest age.
6. Attachment pending, failed, rejected, scanner state, and scan age.
7. Provider successes, retryable and permanent failures, webhook failures, bounce/complaint counts, and provider latency.
8. PostgreSQL connection-pool utilisation, timeout count, query latency, CPU, and storage pressure.

Structured events beginning with schoolcast.worker. are safe dashboard inputs. Dashboards and alerts must not include recipient addresses, message bodies, attachment paths, database URLs, tenant identifiers, or secrets.

## Alert Routing

| Alert | Severity | Initial response |
|---|---|---|
| Cross-tenant delivery, credential exposure, malware bypass, or unauthorised live provider use | SEV-1 | Acknowledge within 15 minutes; stop workers, disable providers and feature flags, preserve evidence, notify security/privacy owner |
| Both worker replicas unavailable, queue age 10 minutes, scanner unavailable with backlog, database pool saturation, or repeated provider authentication failure | SEV-2 | Acknowledge within 30 minutes; fail closed, restore capacity, and reconcile queued work |
| Individual undeliverable rows, intermittent retries, or non-urgent webhook lag | SEV-3 | Acknowledge within 4 business hours; resolve cause before audited requeue |

Primary alert delivery must go to a named operations rotation, with a separately named backup and escalation owner. Vercel project-owner notifications are a fallback only, not a complete on-call system. Names, phone numbers, private webhooks, and provider credentials belong in the approved operations system, not this repository.

## Incident Procedure

1. Confirm whether the issue is tenant-scoped or platform-wide without opening message content.
2. For SEV-1, disable live providers and affected tenant feature flags, then stop worker replicas.
3. For SEV-2, keep PostgreSQL queue rows intact; do not bulk-delete or bypass leases.
4. Inspect safe worker events, queue health, provider status, scanner status, and database-pool metrics.
5. Resolve the underlying provider, payload, scanner, storage, or database problem.
6. Use only permission-scoped audited requeue controls; never rewrite tenant, branch, academic-year, recipient, or source ownership.
7. Verify idempotency and delivery ledger state before restarting all replicas.
8. Record timeline, impact, actor, mitigation, recovery, and follow-up without secrets or message content.

## Activation Gate

Do not activate production workers until all items are true:

- production migration and schema verification approved;
- production backup/PITR and restore rehearsal meet the approved RPO/RTO;
- hosted scanner is private, monitored, and fail-closed;
- two worker replicas are provisioned and target-scale load passes;
- dashboard and SEV-1/SEV-2 alert drills pass;
- named primary, backup, and escalation contacts acknowledge the runbook;
- email and WhatsApp remain disabled until their separate provider gates pass;
- SchoolCast feature flags remain limited to the formally approved pilot.

## Current Provisioning Evidence

As of 14 August 2026:

- the linked Vercel project is on Hobby;
- SCHOOLCAST_WORKER_ENABLED is explicitly set to false for Vercel Production and Preview;
- no Vercel cron job is registered;
- Vercel has its default owner/admin error rule; the valid SchoolCast custom alert request was denied because alert-rule access is unavailable on the current plan;
- the production deployment does not contain the uncommitted SchoolCast release;
- a distributed staging-only host profile, host inventory validator, private target renderer, per-host preflight, and release-evidence validator are implemented, but no external host is provisioned;
- no hosted continuous worker provider or named on-call destination is connected;
- production SchoolCast migration, flags, providers, and delivery remain unchanged.

This is a safe partial completion, not production worker certification.