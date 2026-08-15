import { createHash } from "node:crypto";
import { isIP } from "node:net";

import { z } from "zod";

const reference = z.string().trim().min(3).max(160)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]+$/)
  .refine(
    (value) => !/(?:replace|example|todo|tbd)/i.test(value),
    "Placeholder values are not accepted."
  );
const projectReference = z.string().trim().regex(/^[a-z0-9]{8,40}$/)
  .refine(
    (value) => !/(?:replace|example|todo|tbd)/i.test(value),
    "Placeholder project references are not accepted."
  );
const replicaId = z.enum(["worker-a", "worker-b"]);

function isPrivateAddress(value: string) {
  if (isIP(value) === 4) {
    const parts = value.split(".").map(Number);
    return parts[0] === 10
      || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
      || (parts[0] === 192 && parts[1] === 168);
  }
  if (isIP(value) === 6) return /^(fc|fd)/i.test(value);
  return /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:internal|private|lan)$/i.test(value);
}

const privateAddress = z.string().trim().refine(isPrivateAddress, {
  message: "Must be an RFC1918, IPv6 ULA, or approved private DNS address."
});

const hostSchema = z.object({
  replicaId,
  provider: reference,
  accountRef: reference,
  region: reference,
  availabilityZone: reference,
  failureDomain: reference,
  powerDomain: reference,
  networkDomain: reference,
  sshAlias: reference,
  privateMetricsAddress: privateAddress,
  externalHeartbeatCheckRef: reference,
  approvalRef: reference,
  resources: z.object({
    architecture: z.enum(["amd64", "arm64"]),
    vCpu: z.number().int().min(1),
    memoryMb: z.number().int().min(4_096),
    diskGb: z.number().int().min(20)
  })
});

const scannerSchema = z.object({
  replicaId,
  failureDomain: reference,
  privateEndpointRef: reference,
  signatureUpdateIntervalHours: z.number().positive().max(6)
});

export const schoolCastHostInventorySchema = z.object({
  version: z.literal(1),
  environment: z.literal("STAGING"),
  database: z.object({
    provider: reference,
    region: reference,
    projectRef: projectReference,
    approvedConnectionLimit: z.number().int().min(2).max(100),
    approvalRef: reference
  }),
  hosts: z.array(hostSchema).length(2),
  independence: z.object({
    sharedAvailabilityZone: z.literal(false),
    sharedFailureDomain: z.literal(false),
    sharedPowerDomain: z.literal(false),
    sharedNetworkDomain: z.literal(false),
    evidenceRef: reference
  }),
  monitoring: z.object({
    externalProvider: reference,
    externalFailureDomain: reference,
    primaryDestinationRef: reference,
    backupDestinationRef: reference,
    primaryOwnerRef: reference,
    backupOwnerRef: reference,
    approvalRef: reference
  }),
  malwareScanning: z.object({
    mode: z.literal("CLAMAV"),
    failClosed: z.literal(true),
    quarantinePrivate: z.literal(true),
    replicas: z.array(scannerSchema).length(2),
    approvalRef: reference
  }),
  logs: z.object({
    retentionDays: z.number().int().min(30).max(365),
    encryptedAtRest: z.literal(true),
    offHostCopy: z.literal(true),
    destinationFailureDomain: reference,
    accessApprovalRef: reference,
    recoveryEvidenceRef: reference
  })
}).strict().superRefine((inventory, ctx) => {
  const unique = (values: readonly string[], path: (string | number)[], message: string) => {
    if (new Set(values.map((value) => value.toLowerCase())).size !== values.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path, message });
    }
  };

  unique(inventory.hosts.map((host) => host.replicaId), ["hosts"], "Worker replica IDs must be unique.");
  unique(inventory.hosts.map((host) => host.sshAlias), ["hosts"], "SSH aliases must be unique.");
  unique(inventory.hosts.map((host) => host.approvalRef), ["hosts"], "Host approval references must be unique.");
  unique(
    inventory.hosts.map((host) => host.privateMetricsAddress),
    ["hosts"],
    "Worker private metrics addresses must be unique."
  );
  unique(
    inventory.hosts.map((host) => host.externalHeartbeatCheckRef),
    ["hosts"],
    "Each worker requires a distinct external heartbeat check."
  );
  unique(inventory.hosts.map((host) => host.availabilityZone), ["hosts"], "Hosts must use separate availability zones.");
  unique(inventory.hosts.map((host) => host.failureDomain), ["hosts"], "Hosts must use separate failure domains.");
  unique(inventory.hosts.map((host) => host.powerDomain), ["hosts"], "Hosts must use separate power domains.");
  unique(inventory.hosts.map((host) => host.networkDomain), ["hosts"], "Hosts must use separate network domains.");

  if (inventory.monitoring.primaryDestinationRef === inventory.monitoring.backupDestinationRef) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["monitoring", "backupDestinationRef"],
      message: "Primary and backup alert destinations must differ."
    });
  }
  if (inventory.monitoring.primaryOwnerRef === inventory.monitoring.backupOwnerRef) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["monitoring", "backupOwnerRef"],
      message: "Primary and backup alert owners must differ."
    });
  }
  if (inventory.hosts.some((host) => host.failureDomain === inventory.monitoring.externalFailureDomain)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["monitoring", "externalFailureDomain"],
      message: "External monitoring must not share a worker failure domain."
    });
  }

  unique(
    inventory.malwareScanning.replicas.map((scanner) => scanner.replicaId),
    ["malwareScanning", "replicas"],
    "Each worker requires one scanner replica."
  );
  unique(
    inventory.malwareScanning.replicas.map((scanner) => scanner.privateEndpointRef),
    ["malwareScanning", "replicas"],
    "Scanner endpoint references must be unique."
  );
  if (inventory.hosts.some((host) => host.failureDomain === inventory.logs.destinationFailureDomain)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["logs", "destinationFailureDomain"],
      message: "Off-host log recovery must not share a worker failure domain."
    });
  }

  for (const scanner of inventory.malwareScanning.replicas) {
    const host = inventory.hosts.find((candidate) => candidate.replicaId === scanner.replicaId);
    if (!host || host.failureDomain !== scanner.failureDomain) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["malwareScanning", "replicas"],
        message: "Scanner replicas must map to their worker host failure domains."
      });
    }
  }
});

export type SchoolCastHostInventory = z.infer<typeof schoolCastHostInventorySchema>;

export function validateSchoolCastHostInventory(input: unknown) {
  const inventory = schoolCastHostInventorySchema.parse(input);
  const digest = createHash("sha256").update(JSON.stringify(inventory)).digest("hex");
  return {
    ok: true as const,
    environment: inventory.environment,
    workerReplicas: inventory.hosts.length,
    scannerReplicas: inventory.malwareScanning.replicas.length,
    alertDestinations: 2,
    externalHeartbeatChecks: inventory.hosts.length,
    inventoryDigest: digest
  };
}
