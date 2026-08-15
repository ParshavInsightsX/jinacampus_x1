import { execFile as execFileCallback } from "node:child_process";
import { readFile } from "node:fs/promises";
import { cpus, networkInterfaces, platform, totalmem } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { schoolCastHostInventorySchema } from "../src/modules/schoolcast/operations/host-inventory";

const execFile = promisify(execFileCallback);

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

async function commandVersion(command: string, args: string[]) {
  const result = await execFile(command, args, {
    timeout: 15_000,
    windowsHide: true,
    maxBuffer: 64 * 1024
  });
  const value = result.stdout.trim();
  if (!value || value.length > 120) throw new Error("SCHOOLCAST_HOST_TOOL_VERSION_INVALID");
  return value;
}

async function availableDiskGb() {
  const result = await execFile("df", ["-Pk", process.cwd()], {
    timeout: 10_000,
    windowsHide: true,
    maxBuffer: 64 * 1024
  });
  const lines = result.stdout.trim().split(/\r?\n/);
  const fields = lines.at(-1)?.trim().split(/\s+/);
  const availableKb = Number(fields?.[3]);
  if (!Number.isFinite(availableKb)) throw new Error("SCHOOLCAST_HOST_DISK_CHECK_FAILED");
  return Math.floor(availableKb / 1024 / 1024);
}

async function main() {
  if (platform() !== "linux") throw new Error("SCHOOLCAST_HOST_REQUIRES_LINUX");

  const replicaId = required("SCHOOLCAST_WORKER_REPLICA_ID");
  if (replicaId !== "worker-a" && replicaId !== "worker-b") {
    throw new Error("SCHOOLCAST_WORKER_REPLICA_ID_INVALID");
  }

  const inventoryPath = path.resolve(required("SCHOOLCAST_HOST_INVENTORY_FILE"));
  const inventory = schoolCastHostInventorySchema.parse(JSON.parse(await readFile(inventoryPath, "utf8")));
  const expected = inventory.hosts.find((host) => host.replicaId === replicaId);
  if (!expected) throw new Error("SCHOOLCAST_HOST_NOT_IN_APPROVED_INVENTORY");

  const localAddresses = Object.values(networkInterfaces())
    .flatMap((entries) => entries ?? [])
    .filter((entry) => entry.family === "IPv4" || entry.family === "IPv6")
    .map((entry) => entry.address.toLowerCase());
  if (!localAddresses.includes(expected.privateMetricsAddress.toLowerCase())) {
    throw new Error("SCHOOLCAST_HOST_PRIVATE_ADDRESS_MISMATCH");
  }

  const architecture = process.arch === "x64" ? "amd64" : process.arch;
  const vCpu = cpus().length;
  const memoryMb = Math.floor(totalmem() / 1024 / 1024);
  const diskGb = await availableDiskGb();
  if (
    architecture !== expected.resources.architecture
    || vCpu < expected.resources.vCpu
    || memoryMb < expected.resources.memoryMb
    || diskGb < expected.resources.diskGb
  ) {
    throw new Error("SCHOOLCAST_HOST_RESOURCES_DO_NOT_MATCH_INVENTORY");
  }

  const dockerVersion = await commandVersion("docker", ["version", "--format", "{{.Server.Version}}"]) ;
  const composeVersion = await commandVersion("docker", ["compose", "version", "--short"]);

  console.info(JSON.stringify({
    ok: true,
    environment: inventory.environment,
    replicaId,
    architecture,
    vCpu,
    memoryMb,
    diskGb,
    dockerVersion,
    composeVersion,
    privateAddressMatched: true,
    productionActivation: "NOT_AUTHORIZED"
  }));
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "";
  console.error(JSON.stringify({
    ok: false,
    code: /^SCHOOLCAST_[A-Z0-9_]+$/.test(message)
      ? message
      : "SCHOOLCAST_HOST_PREFLIGHT_FAILED"
  }));
  process.exitCode = 1;
});
