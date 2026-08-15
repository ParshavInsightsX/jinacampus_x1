# Distributed SchoolCast Staging Rehearsal

This profile deploys one worker, one private ClamAV scanner, and one monitoring replica per host. It is hard-coded to `STAGING`; it cannot authorise or activate production workers.

The profile configures already approved Linux hosts; it does not create cloud accounts or compute instances. Host provisioning requires an operator-owned provider account and must be recorded in the private inventory.

## External Preconditions

The operator must supply two approved Linux hosts with separate availability, failure, power, and network domains. A private routed network must connect both hosts. Metrics (`9464`), Alertmanager (`9093`), and Alertmanager clustering (`9094` TCP/UDP) must be allowed only between the approved private addresses. SSH, Docker API, Prometheus, Grafana, ClamAV, and metrics endpoints must not be publicly exposed.

Each host requires at least one vCPU, 4 GB RAM, 20 GB disk, Docker Engine with Compose, synchronized time, automatic security updates, encrypted storage, and a named operator. Six GB RAM is recommended when ClamAV, Prometheus, Alertmanager, and Grafana share the host.

An external dead-man monitor outside both worker failure domains must have one private check URL per replica. The URLs are server-only secrets. A successful worker cycle sends an empty POST; it sends no tenant, recipient, content, database, or host metadata.

## Private Files

Create these files separately on each host:

- `host.env.local` from `host.env.example`;
- `worker.env.local` from `worker.env.example`, with a unique replica ID and heartbeat URL;
- `host-inventory.local.json` from `host-inventory.example.json`;
- `generated/alertmanager.yml` using the approved primary and backup destinations;
- `generated/prometheus-worker-a.yml` or `prometheus-worker-b.yml`.

All private files are ignored by Git. Restrict them to the service account with mode `0600` on Linux.

## Validation and Start

Load `host.env.local` into the operator shell without printing values. Then run:

```bash
export SCHOOLCAST_HOST_INVENTORY_FILE=infra/schoolcast-self-hosted/host-inventory.local.json
npm run infra:schoolcast:hosts:validate
npm run infra:schoolcast:host:preflight
npm run infra:schoolcast:alerts
npm run infra:schoolcast:monitoring
docker compose --env-file infra/schoolcast-self-hosted/host.env.local \
  -f infra/schoolcast-self-hosted/compose.host.yaml config --quiet
docker compose --env-file infra/schoolcast-self-hosted/host.env.local \
  -f infra/schoolcast-self-hosted/compose.host.yaml up -d --build
```

Repeat on the second host with `worker-b`, its private bind address, peer target, unique heartbeat URL, and generated Prometheus file.

Verify both Prometheus instances can scrape both workers and route to both Alertmanager instances. Verify the Alertmanager cluster reports two peers. Access Grafana and Prometheus only through an approved VPN or SSH tunnel.

## Required Drills

1. Run 5,000 synthetic DRY_RUN/IN_APP queue items within 15 minutes.
2. Stop host A and prove host B continues processing without loss or duplicates; repeat in reverse.
3. Block each alert route independently and prove the other route delivers and is acknowledged.
4. Stop a worker mid-lease and prove restart plus lease recovery within five minutes.
5. Create a scoped synthetic terminal row, review it, perform permission-checked audited replay, and reconcile it.
6. Record peak database connections, pool timeouts, database errors, queue p95 age, scanner signature age, and recovery timing.
7. Stop each scanner and prove attachments remain quarantined and publication fails closed.
8. Restore encrypted off-host logs and the approved staging backup into an isolated target.

Record evidence in a private `rehearsal-evidence.local.json` based on the committed example, then run `npm run infra:schoolcast:rehearsal:validate`.

Passing staging evidence still reports both production migration and production worker activation as unauthorised. Those remain separate release decisions.
