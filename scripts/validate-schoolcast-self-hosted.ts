import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

async function read(relativePath: string) {
  return readFile(path.join(process.cwd(), relativePath), "utf8");
}

async function main() {
  const [
    compose,
    composeHost,
    prometheus,
    distributedPrometheus,
    rules,
    blockedAlerts,
    dashboard,
    dockerfile,
    envExample,
    hostEnvExample,
    hostInventoryExample,
    rehearsalEvidenceExample,
    distributedRunbook,
    packageJsonSource
  ] = await Promise.all([
    read("infra/schoolcast-self-hosted/compose.yaml"),
    read("infra/schoolcast-self-hosted/compose.host.yaml"),
    read("infra/schoolcast-self-hosted/prometheus/prometheus.yml"),
    read("infra/schoolcast-self-hosted/prometheus/prometheus.distributed.template.yml"),
    read("infra/schoolcast-self-hosted/prometheus/schoolcast.rules.yml"),
    read("infra/schoolcast-self-hosted/alertmanager/alertmanager.blocked.yml"),
    read("infra/schoolcast-self-hosted/grafana/dashboards/schoolcast-operations.json"),
    read("Dockerfile.schoolcast-worker"),
    read("infra/schoolcast-self-hosted/worker.env.example"),
    read("infra/schoolcast-self-hosted/host.env.example"),
    read("infra/schoolcast-self-hosted/host-inventory.example.json"),
    read("infra/schoolcast-self-hosted/rehearsal-evidence.example.json"),
    read("infra/schoolcast-self-hosted/DISTRIBUTED_STAGING.md"),
    read("package.json")
  ]);

  assert.match(compose, /^\s{2}worker-a:\s*$/m);
  assert.match(compose, /^\s{2}worker-b:\s*$/m);
  assert.match(compose, /restart: unless-stopped/);
  assert.match(compose, /read_only: true/);
  assert.match(compose, /no-new-privileges:true/);
  assert.match(compose, /127\.0\.0\.1:\$\{SCHOOLCAST_GRAFANA_PORT/);
  assert.match(compose, /GF_SECURITY_COOKIE_SECURE: \$\{SCHOOLCAST_GRAFANA_COOKIE_SECURE:-false\}/);
  assert.match(
    compose,
    /alertmanager:[\s\S]*?networks:\s*\n\s*- observability\s*\n\s*- worker-egress\s*\n\s*\n\s*prometheus:/
  );
assert.match(composeHost, /^  worker:$/m);
  assert.equal((composeHost.match(/^  worker:$/gm) ?? []).length, 1);
  assert.match(composeHost, /SCHOOLCAST_WORKER_DEPLOYMENT_ENVIRONMENT: STAGING/);
  assert.doesNotMatch(composeHost, /SCHOOLCAST_WORKER_DEPLOYMENT_ENVIRONMENT: PRODUCTION/);
  assert.match(composeHost, /SCHOOLCAST_PRIVATE_BIND_ADDRESS[^\n]*:9464:9464/);
  assert.match(composeHost, /SCHOOLCAST_PRIVATE_BIND_ADDRESS[^\n]*:9093:9093/);
  assert.match(composeHost, /SCHOOLCAST_PRIVATE_BIND_ADDRESS[^\n]*:9094:9094\/tcp/);
  assert.match(composeHost, /SCHOOLCAST_ALERTMANAGER_PEER_TARGET/);
  assert.match(composeHost, /clamav\/clamav@sha256:[a-f0-9]{64}/);
  assert.match(composeHost, /127\.0\.0\.1:\$\{SCHOOLCAST_PROMETHEUS_PORT/);
  assert.match(composeHost, /127\.0\.0\.1:\$\{SCHOOLCAST_GRAFANA_PORT/);

  assert.match(prometheus, /worker-a:9464/);
  assert.match(prometheus, /worker-b:9464/);
  assert.match(rules, /SchoolCastBothWorkerReplicasUnavailable/);
  assert.match(rules, /SchoolCastQueueAgeHigh/);
  assert.match(rules, /SchoolCastDeadLetterPresent/);
  assert.match(blockedAlerts, /receiver: release-blocked/);
  assert.doesNotMatch(blockedAlerts, /webhook_configs|email_configs/);
  assert.match(dockerfile, /HEALTHCHECK/);
  assert.match(dockerfile, /\/livez/);
  assert.match(envExample, /SCHOOLCAST_WORKER_DATABASE_PROJECT_REF=replaceproject/);
assert.match(envExample, /SCHOOLCAST_WORKER_HEALTH_PORT=9464/);
  assert.match(envExample, /SCHOOLCAST_WORKER_REPLICA_ID=worker-a/);
  assert.match(envExample, /SCHOOLCAST_EXTERNAL_HEARTBEAT_URL=https:\/\//);
  assert.match(envExample, /SCHOOLCAST_EXTERNAL_HEARTBEAT_TIMEOUT_MS=3000/);
  assert.match(hostEnvExample, /SCHOOLCAST_WORKER_REPLICA_ID=worker-a/);
  assert.match(hostEnvExample, /SCHOOLCAST_WORKER_A_METRICS_TARGET=/);
  assert.match(hostEnvExample, /SCHOOLCAST_ALERTMANAGER_B_TARGET=/);
  assert.match(distributedPrometheus, /__WORKER_A_TARGET__/);
  assert.match(distributedPrometheus, /__WORKER_B_TARGET__/);
  assert.match(distributedPrometheus, /__ALERTMANAGER_A_TARGET__/);
  assert.match(distributedPrometheus, /__ALERTMANAGER_B_TARGET__/);
  assert.match(hostInventoryExample, /"environment": "STAGING"/);
  assert.match(rehearsalEvidenceExample, /"status": "NOT_RUN"/);
  assert.match(rehearsalEvidenceExample, /"status": "BLOCKED"/);
  assert.match(distributedRunbook, /production migration and production worker activation as unauthorised/i);
  assert.doesNotMatch(envExample, /\b[a-z0-9]{20}\b/);

const packageJson = JSON.parse(packageJsonSource) as { scripts?: Record<string, string> };
  assert.equal(packageJson.scripts?.["infra:schoolcast:hosts:validate"], "node --import tsx scripts/validate-schoolcast-host-inventory.ts");
  assert.equal(packageJson.scripts?.["infra:schoolcast:host:preflight"], "node --import tsx scripts/verify-schoolcast-staging-host.ts");
  assert.equal(packageJson.scripts?.["infra:schoolcast:monitoring"], "node --import tsx scripts/render-schoolcast-distributed-monitoring.ts");
  assert.equal(packageJson.scripts?.["infra:schoolcast:rehearsal:validate"], "node --import tsx scripts/validate-schoolcast-rehearsal-evidence.ts");

  const parsedDashboard = JSON.parse(dashboard) as { uid?: string; panels?: unknown[] };
  assert.equal(parsedDashboard.uid, "schoolcast-operations");
  assert.ok((parsedDashboard.panels?.length ?? 0) >= 6);

  console.info(JSON.stringify({
    ok: true,
    workerReplicas: 2,
    metrics: "PROMETHEUS",
    dashboard: "GRAFANA_OSS",
    alertRouting: "BLOCKED_UNTIL_TWO_PRIVATE_DESTINATIONS_ARE_RENDERED",
    distributedStagingProfile: "VALIDATED_NOT_PROVISIONED",
    productionActivation: "NOT_AUTHORIZED"
  }));
}

main().catch(() => {
  console.error(JSON.stringify({ ok: false, code: "SCHOOLCAST_SELF_HOSTED_VALIDATION_FAILED" }));
  process.exitCode = 1;
});
