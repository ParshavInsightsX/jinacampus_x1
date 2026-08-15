# SchoolCast Distributed Staging Infrastructure Readiness

## Status

**Repository controls ready; external infrastructure not provisioned; production remains NO-GO as of 14 August 2026.**

This record does not authorise a production database migration, production worker activation, live email or WhatsApp delivery, feature enablement, source-code publication, or deployment. Those remain separate release decisions.

Local source verification passed Prisma format/validate/generate, strict TypeScript, 120 test files and 962 tests, the Next.js production build, the infrastructure drift validator, secret-free host inventory validation, distributed target rendering, and per-host Compose parsing. Docker Desktop was stopped, so pinned image startup, `promtool`/`amtool`, and live ClamAV health checks remain part of the two-host rehearsal.

## Approved Certification Envelope

| Measure | Required staging result |
|---|---:|
| Synthetic recipient fan-out | At least 5,000 recipients within 15 minutes |
| Worker replicas | Two, one per approved independent host |
| Queue age | p95 at or below 5 minutes |
| Host-loss recovery | Surviving host continues; recovery within 5 minutes |
| Lost or duplicate delivery attempts | Zero |
| Worker/database errors | Zero |
| Database pool timeouts | Zero |
| External host-loss detection | Within 5 minutes |
| Alert acknowledgement | Within 15 minutes |
| Scanner signature age | At most 6 hours |
| Log retention | At least 30 days with encrypted off-host recovery |
| Recovery point objective | At most 15 minutes |
| Recovery time objective | At most 4 hours |

## Reproducible Controls Added

- `infra/schoolcast-self-hosted/compose.host.yaml` runs one worker and one private ClamAV replica per host. The profile hard-codes `STAGING` and cannot activate production.
- Each host runs Prometheus, Alertmanager, and Grafana OSS. Worker metrics and Alertmanager clustering bind only to approved private addresses; Prometheus and Grafana bind to loopback.
- Both Prometheus replicas scrape both worker replicas and send alerts to both Alertmanager replicas.
- Hosted workers require a stable `worker-a` or `worker-b` identity, an approved database project-reference match, and a unique external HTTPS dead-man heartbeat URL.
- The heartbeat sends an empty POST after a completed cycle. It sends no tenant, recipient, content, database, or host data, and its URL is never returned in worker output.
- Alertmanager configuration requires two distinct HTTPS destinations. The committed default remains non-delivering.
- Host inventory validation rejects public metrics addresses, duplicate replicas/routes/approvals, placeholder evidence, shared availability/power/network/failure domains, a monitor in either worker domain, and off-host logs stored in either worker domain.
- Rehearsal evidence validation enforces load, failover, alert, dead-letter, restart, database, scanner, log, recovery, provider, and approval gates. Even a complete staging pass returns production migration and worker activation as unauthorised.

## Operator Files

Create the following private files from the committed examples. They are ignored by Git and must be readable only by the service account:

- `infra/schoolcast-self-hosted/host-inventory.local.json`
- `infra/schoolcast-self-hosted/host.env.local`
- `infra/schoolcast-self-hosted/worker.env.local`
- `infra/schoolcast-self-hosted/rehearsal-evidence.local.json`
- rendered files under `infra/schoolcast-self-hosted/generated/`

Do not place host addresses, database URLs, alert webhooks, heartbeat URLs, provider credentials, recipient details, or approval-system secrets in source control or release documents.

## Host Admission Procedure

For each approved Linux host:

1. Record independent provider/account, region, availability zone, power, network, and failure-domain evidence in the private inventory.
2. Confirm private routed connectivity between both hosts and the approved staging database.
3. Restrict worker metrics `9464`, Alertmanager `9093`, and cluster traffic `9094` TCP/UDP to the two private host addresses.
4. Keep SSH, Docker, Prometheus, Grafana, ClamAV, and worker metrics off the public internet.
5. Set the unique replica ID and unique external heartbeat URL in the private environment.
6. Run:

```bash
export SCHOOLCAST_HOST_INVENTORY_FILE=infra/schoolcast-self-hosted/host-inventory.local.json
npm run infra:schoolcast:hosts:validate
npm run infra:schoolcast:host:preflight
npm run infra:schoolcast:alerts
npm run infra:schoolcast:monitoring
npm run infra:schoolcast:validate
docker compose --env-file infra/schoolcast-self-hosted/host.env.local \
  -f infra/schoolcast-self-hosted/compose.host.yaml config --quiet
```

Only after both preflights and private-network checks pass may an operator start the staging profile. An account owner must provision the hosts; this repository intentionally does not contain cloud credentials or vendor-specific account creation.

## Mandatory Rehearsal Drills

1. Run the 5,000-recipient synthetic IN_APP/DRY_RUN load and capture throughput, queue p95, worker errors, duplicate attempts, pool connections, timeouts, and database errors.
2. Stop host A, prove host B continues processing, then repeat in reverse. Record lost jobs, duplicates, and recovery time.
3. Fire and resolve SEV-2 test alerts, block the primary route, verify backup delivery and acknowledgement, then reverse the routes.
4. Stop a worker during a lease, verify container restart and stale-lease recovery within five minutes, and prove idempotent final state.
5. Create a synthetic terminal row, review it, use the permission-scoped audited replay control, and reconcile it without cross-tenant mutation.
6. Stop each scanner independently, prove attachments remain private and quarantined, then restore scanning and verify clean/malware outcomes.
7. Restore the encrypted off-host operational/security logs and verify unauthorised access is denied.
8. Restore the approved staging database/storage evidence into an isolated recovery target and measure RPO/RTO.

Record immutable evidence references in the private rehearsal ledger, then run:

```bash
export SCHOOLCAST_REHEARSAL_EVIDENCE_FILE=infra/schoolcast-self-hosted/rehearsal-evidence.local.json
npm run infra:schoolcast:rehearsal:validate
```

## External Blockers

| Gate | Current state | Required evidence |
|---|---|---|
| Two independent hosts | Blocked | Approved hosts, private routes, unique failure domains, successful preflights |
| External monitoring | Blocked | Two unique heartbeat checks outside both worker domains and total-host-loss drill |
| Alert destinations | Blocked | Named primary/backup owners, two private routes, firing/resolution/failover evidence |
| Log retention | Blocked | Encrypted off-host destination, 30-day policy, access review, restore drill |
| Malware scanning | Repository profile ready; approval blocked | Two private scanner replicas, signatures, outage/load/quarantine/incident evidence |
| Database recovery | Blocked | Backup availability, PITR, isolated restore, measured RPO/RTO |
| Email | Blocked | Sender, templates, consent, secrets, webhook, billing cap, delivery reconciliation, recipient pilot |
| WhatsApp | Blocked | Business verification, templates, consent, secrets, webhook, billing cap, delivery reconciliation, recipient pilot |
| Formal approvals | Blocked | Operations, security/privacy, technical, and business/product sign-offs |

## Supabase Recovery Constraint

Supabase documents that Free projects should use manual off-site logical exports; automatic backups are not included on Free, and Point-in-Time Recovery is a paid add-on on eligible paid projects. A manual export is useful disaster-recovery evidence, but it does not establish the approved 15-minute PITR objective.

Under the current no-premium decision, the production database recovery gate therefore remains blocked. The safe choices are:

1. keep SchoolCast production workers and live providers disabled; or
2. separately approve funded PITR; or
3. separately approve, design, migrate to, and certify a self-managed database/WAL-archive architecture.

The third choice is a major production architecture change and is outside this staging-infrastructure task.

## Release Boundary

Passing the distributed staging rehearsal does not authorise production. Production database migration and production worker activation require separate explicit approvals after backup/restore, provider pilots, security review, and all stakeholder sign-offs are complete.
