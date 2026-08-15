import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { renderSchoolCastDistributedMonitoringConfig } from "../src/modules/schoolcast/operations/distributed-monitoring-config";

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

async function main() {
  const monitorReplica = required("SCHOOLCAST_WORKER_REPLICA_ID");
  if (monitorReplica !== "worker-a" && monitorReplica !== "worker-b") {
    throw new Error("SCHOOLCAST_WORKER_REPLICA_ID_INVALID");
  }

  const root = process.cwd();
  const template = await readFile(path.join(
    root,
    "infra",
    "schoolcast-self-hosted",
    "prometheus",
    "prometheus.distributed.template.yml"
  ), "utf8");
  const rendered = renderSchoolCastDistributedMonitoringConfig({
    template,
    monitorReplica,
    workerATarget: required("SCHOOLCAST_WORKER_A_METRICS_TARGET"),
    workerBTarget: required("SCHOOLCAST_WORKER_B_METRICS_TARGET"),
    alertmanagerATarget: required("SCHOOLCAST_ALERTMANAGER_A_TARGET"),
    alertmanagerBTarget: required("SCHOOLCAST_ALERTMANAGER_B_TARGET")
  });

  const outputDirectory = path.join(root, "infra", "schoolcast-self-hosted", "generated");
  const outputPath = path.join(outputDirectory, `prometheus-${monitorReplica}.yml`);
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(outputPath, rendered, { encoding: "utf8", mode: 0o600 });
  await chmod(outputPath, 0o600).catch(() => undefined);
  console.info(JSON.stringify({
    ok: true,
    event: "schoolcast.distributed_monitoring_config_rendered",
    monitorReplica,
    targets: { workers: 2, alertmanagers: 2 }
  }));
}

main().catch((error: unknown) => {
  console.error(JSON.stringify({
    ok: false,
    code: error instanceof Error && /^SCHOOLCAST_[A-Z0-9_]+$/.test(error.message)
      ? error.message
      : "SCHOOLCAST_DISTRIBUTED_MONITORING_CONFIG_FAILED"
  }));
  process.exitCode = 1;
});
