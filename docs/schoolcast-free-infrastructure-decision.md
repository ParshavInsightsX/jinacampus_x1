# SchoolCast Free and Self-Hosted Infrastructure Decision

## Decision

**Production remains NO-GO as of 15 August 2026.**

JinaCampus will not purchase Vercel Pro, Observability Plus, or another premium worker/monitoring add-on at this stage. A reproducible open-source baseline is now available for two SchoolCast worker processes, Prometheus, Alertmanager, and Grafana OSS. This removes software-licensing dependency, but it does not create two independent hosts, a hosted private malware scanner, approved alert destinations, backup evidence, or an on-call team.

No production migration, worker activation, provider enablement, feature-flag change, commit publication, or deployment is authorised by this decision.

## Evaluation

| Option | Cost posture | Technical result | Release decision |
|---|---|---|---|
| Vercel Hobby web functions/cron | Existing free plan | Cannot provide the required continuously supervised replicas; Hobby cron is insufficient for minute-level queue processing and current custom-alert access is unavailable | Rejected as the SchoolCast worker platform; keep the web app separate |
| One local PC or one free VM with two containers | No new platform fee | Supports process restart and concurrency, but power, network, disk, and host failure remove both replicas | Accepted only for staging/recovery drills; not production HA |
| Two operator-owned Linux hosts in/near the DB region | No new software licence; compute/power/network must already exist | Can run one replica per failure domain with private networking and OSS monitoring | Preferred self-managed production candidate, pending actual host provisioning and every certification gate |
| Oracle Always Free compute | Potentially $0 if capacity exists | Official limits can support small VMs, but capacity can be unavailable and idle instances may be reclaimed | Conditional staging/pilot candidate only; not accepted as 99.9% production evidence by itself |
| Paid managed worker/observability provider | Recurring fee | Lowest operational burden and clearer managed-service guarantees | Deferred by product decision; reconsider if self-hosted operations cannot pass certification |
| Internally built queue database | Development cost and higher integrity risk | Duplicates mature PostgreSQL queue/lease behavior already implemented | Rejected; PostgreSQL remains the durable queue and source of truth |
| Prometheus + Alertmanager + Grafana OSS | Free/open source | Meets metrics, dashboards, alert-rule, and primary/backup routing needs when securely operated | Accepted and implemented as the repository baseline |
| Loki/Alloy central log stack | Free/open source but additional storage and operations | Adds central search but increases failure surface and retention/security workload | Deferred until a host and retention owner are approved; bounded Docker logs plus durable audit ledgers are the temporary staging fallback |

Docker restart policies provide container restart handling, but do not replace independent host availability. Prometheus rules and Alertmanager routing are configuration-as-code. Grafana supports provisioned data sources and dashboards. These are accepted building blocks, not a hosted-service certificate.

Official references used for the decision:

- [Docker restart policies](https://docs.docker.com/engine/containers/start-containers-automatically/)
- [Docker Compose services, health checks, and scaling](https://docs.docker.com/reference/compose-file/services/)
- [Prometheus alerting rules](https://prometheus.io/docs/prometheus/latest/configuration/recording_rules/)
- [Alertmanager high availability](https://prometheus.io/docs/alerting/latest/high_availability/)
- [Grafana OSS provisioning](https://grafana.com/docs/grafana/latest/administration/provisioning/)
- [OCI Always Free resource limits and capacity notes](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm)
- [Supabase database backups and PITR](https://supabase.com/docs/guides/platform/backups)
- [Supabase production checklist](https://supabase.com/docs/guides/deployment/going-into-prod)

## Implemented Baseline

- `Dockerfile.schoolcast-worker` builds a non-root worker-only image with no Next.js runtime dependency.
- The worker exposes private liveness, readiness, cycle, queue, scanner, and dead-letter metrics with bounded label cardinality.
- Container health checks restart only a stale/unresponsive process. Queue degradation remains visible for operator action and does not create a restart loop.
- Hosted workers require an explicit database project reference that must match the runtime URL, a unique replica ID, and a unique external HTTPS dead-man heartbeat URL.
- `infra/schoolcast-self-hosted/compose.yaml` defines two workers, restart policies, read-only filesystems, dropped capabilities, bounded logs, Prometheus, Alertmanager, and Grafana.
- `infra/schoolcast-self-hosted/compose.host.yaml` defines one staging-only worker/scanner/monitoring replica per approved host; private inventory, target rendering, host preflight, and evidence validation prevent a partial topology from being certified.
- Monitoring ports bind to loopback and worker metrics remain on an internal Docker network.
- Alertmanager defaults to a non-delivering receiver. A renderer requires two distinct HTTPS destinations and stores the generated configuration outside Git.
- Eleven Prometheus rules cover missing/failed replicas, stale heartbeats, external-heartbeat configuration/delivery, queue age/depth, terminal work, scanner backlog, and cycle errors.
- A provisioned dashboard covers replica state, queue depth/age, scanner readiness, queue states, cycle duration, and heartbeat age.
- The continuous worker processes due schedules itself; normal processing does not depend on a premium cron service.

## Deferred Capability Ledger

| Deferred feature/service | Reason | Unavailable premium dependency | Operational impact | Temporary limitation/fallback | Recommended future approach | Reconsideration conditions |
|---|---|---|---|---|---|---|
| Production worker hosting | No approved pair of independent hosts exists | Managed continuous-worker platform | SchoolCast cannot process production queues reliably | Keep all production SchoolCast flags and workers disabled | Provision two independently powered Linux hosts near the DB or approve a managed service | Two hosts, private network, capacity/failover test, and named owner available |
| Managed Vercel alerts and advanced observability | Current plan does not expose required custom alert capability | Vercel Pro/Observability Plus | Vercel cannot be the SchoolCast on-call system | Use self-hosted Prometheus/Alertmanager/Grafana in staging | Operate the OSS stack or approve managed observability later | Two alert destinations and alert-loss/failover drill pass |
| Central searchable worker logs | Secure retention host and owner are not approved | Managed log platform | Diagnosis relies on bounded per-host logs and database audit ledgers | Retain Docker local logs; preserve audited business/dead-letter records | Add self-hosted Loki/Alloy with encrypted backup, or approved managed logs | Retention, privacy, storage, backup, and access-control owner approved |
| 99.9% infrastructure certificate on free compute | Free capacity is best-effort and may share a failure domain | SLA-backed compute | Worker availability target cannot yet be claimed | Use free/self-hosted nodes for rehearsal only | Use existing independent owned hosts or fund SLA-backed compute | Monthly availability measurement and failover drill meet target |
| Hosted private malware scanner | No privately reachable production scanner exists | Hosted scanning/network service | Attachments cannot safely publish | Keep attachment publication fail-closed and files quarantined | Operate ClamAV on private approved compute with signature/availability monitoring | Scanner load, outage, quarantine, alert, and incident drills pass |
| Live email and WhatsApp | Senders, templates, consent, credentials, billing, and recipient pilot are unapproved | Provider accounts and message billing | External communication remains unavailable | IN_APP/DRY_RUN only | Complete provider and legal/business gates | Sender, template, consent, webhook, quota, billing, and pilot evidence approved |
| External dead-man monitoring | A monitor outside both worker failure domains is not provisioned | Managed uptime/on-call service | A total worker-host outage may not self-report | Empty-POST heartbeat integration and private configuration are ready; no endpoint is connected | Use an approved external monitor or independently hosted dead-man service | Two unique checks and simulated total-host failure drill pass |
| Fifteen-minute database PITR | Supabase Free does not include automatic backups or PITR | Supabase paid PITR or separately operated WAL archive | Approved RPO cannot be certified | Keep SchoolCast production disabled; retain manual off-site exports for disaster recovery only | Approve PITR funding or separately approve and certify a self-managed database recovery architecture | Isolated restore proves RPO <= 15 minutes and RTO <= 4 hours |

## Required Validation Before Release

1. Provision two independent hosts and confirm region/network latency to the database.
2. Deploy one worker replica per host and ensure one host loss leaves processing active.
3. Place monitoring and at least one alert path outside the shared worker failure domain.
4. Configure two named alert destinations and complete SEV-1/SEV-2 firing/resolution drills.
5. Validate restart, stale-cycle, queue-age, queue-depth, scanner, terminal-row, and database-pool alerts.
6. Run the approved 5,000-recipient/15-minute load and concurrency profile against the final topology.
7. Verify bounded connection use, lease recovery, idempotency, provider rate limits, and dead-letter operations.
8. Certify log retention/access, backup/PITR, restore, rollback, and feature-disable procedures.
9. Keep email/WhatsApp disabled until their independent provider gates pass.
10. Obtain operational, technical, security/privacy, business, and pilot-owner approval.

Production database migration and worker activation remain separate explicit approvals. Passing this infrastructure approach review does not approve either action.

The final no-premium application boundary and complete deferred product/technical backlog are maintained in `docs/schoolcast-final-deployment-scope.md` and `docs/schoolcast-deferred-capabilities-backlog.md`.
