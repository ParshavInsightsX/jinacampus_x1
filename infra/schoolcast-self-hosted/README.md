# SchoolCast Self-Hosted Operations Baseline

This directory is a reproducible, zero-license-cost **validation baseline** for SchoolCast workers and observability. It does not authorise a production database migration, worker activation, feature enablement, or live provider delivery.

## Included

- two independently supervised worker containers on the Compose host;
- private worker `/livez`, `/readyz`, and `/metrics` endpoints;
- Prometheus metrics and eleven fail-safe alert rules;
- Alertmanager with a non-delivering default receiver;
- Grafana OSS with a provisioned SchoolCast operations dashboard;
- loopback-only monitoring ports, non-root workers, read-only worker filesystems, dropped Linux capabilities, bounded local logs, and automatic restart policies;
- an explicit database-project guard before hosted workers can start.

Two containers on one host are **not** two failure domains. The Compose topology is suitable for local/staging recovery drills. Production certification requires one worker replica on each of two independently powered and networked Linux hosts, a private route to the database/scanner, and monitoring that survives either worker host.

`compose.host.yaml` and `DISTRIBUTED_STAGING.md` provide the staging-only one-replica-per-host profile. Host inventory, private target rendering, external dead-man heartbeats, per-host preflight, and rehearsal evidence are fail-closed. These files make deployment reproducible but do not provision or approve external hosts.

## Protected Configuration

1. Copy `worker.env.example` to `worker.env.local` on the host.
2. Replace every placeholder with server-only values from the approved environment.
3. Set `SCHOOLCAST_WORKER_DEPLOYMENT_ENVIRONMENT` to `STAGING` during rehearsal. `PRODUCTION` remains separately authorised.
4. Set `SCHOOLCAST_WORKER_DATABASE_PROJECT_REF` to the intended database project reference and verify it matches `DATABASE_URL`.
5. Set a unique `SCHOOLCAST_WORKER_REPLICA_ID` and external HTTPS heartbeat URL for each hosted replica. Keep the URL secret.
6. Use the pooled runtime database connection with a tested connection limit. `DIRECT_URL` may use the same least-privilege runtime URL in the worker container; migration credentials do not belong in the worker.
7. Restrict the file to the service account on Linux, for example `chmod 600 worker.env.local`.
8. Never publish the worker metrics port. Prometheus reaches it only on the internal `observability` network.

Private files and `generated/` are excluded by the root `.gitignore`.

## Alert Destinations

The committed `alertmanager.blocked.yml` intentionally sends no notifications. Configure two distinct approved HTTPS destinations in the operator environment and render the private file:

```powershell
$env:SCHOOLCAST_ALERT_PRIMARY_WEBHOOK_URL = "<primary-approved-https-webhook>"
$env:SCHOOLCAST_ALERT_BACKUP_WEBHOOK_URL = "<backup-approved-https-webhook>"
npm run infra:schoolcast:alerts
```

The renderer rejects HTTP, localhost, inline credentials, and duplicate destinations. It never prints destination URLs. Validate and drill both routes before production use.

## Validation

Load `ops.env.local` into the host shell, then run:

```powershell
npm run infra:schoolcast:validate
docker compose -f infra/schoolcast-self-hosted/compose.yaml config --quiet
docker build --file Dockerfile.schoolcast-worker --tag jinacampus-schoolcast-worker:release-candidate .
```

Validate Prometheus and Alertmanager syntax with the pinned images:

```powershell
docker run --rm --entrypoint /bin/promtool prom/prometheus:v3.5.5 --version
docker run --rm --entrypoint /bin/amtool prom/alertmanager:v0.33.1 --version
```

Do not run `docker compose up` against a production URL until the production migration and worker activation gates are independently approved.

## Operations

- Grafana: loopback port `3300` by default.
- Prometheus: loopback port `9090` by default.
- Alertmanager: loopback port `9093` by default.
- The loopback-only HTTP default uses `SCHOOLCAST_GRAFANA_COOKIE_SECURE=false`. Set it to `true` only when Grafana is served through an approved HTTPS reverse proxy.
- Alertmanager has outbound network access only so it can reach the two approved HTTPS alert destinations. Its UI remains bound to loopback.
- Access a remote host through an approved VPN or SSH tunnel; do not expose these ports publicly.
- Worker logs are structured JSON in the Docker `local` driver with bounded rotation. Critical business actions and requeues remain in the database audit ledger.
- Use `docker compose logs worker-a worker-b` for bounded local diagnosis. A secure independent log export/backup must pass the production operations review before activation.
- The continuous worker itself performs due scheduling and stale-lease recovery. No Vercel cron is required for normal processing.
- Follow `docs/schoolcast-on-call-runbook.md` for queue, scanner, dead-letter, and incident procedures.

## Production Topology Gate

Production requires all of the following, even if the software stack itself is free:

1. two independent hosts in or near the approved database region;
2. automatic host and container recovery;
3. private database, Storage, and malware-scanner connectivity;
4. monitoring/alerts that remain available when either worker host fails;
5. named primary and backup alert owners and a completed drill;
6. secure log retention/export and operational access control;
7. target-scale load, database-pool, failover, idempotency, and recovery certification;
8. approved backup/PITR and restore evidence;
9. separately authorised production migration and worker activation.
