import { describe, expect, it } from "vitest";

import { validateSchoolCastHostInventory } from "@/modules/schoolcast/operations/host-inventory";

function validInventory() {
  return {
    version: 1,
    environment: "STAGING",
    database: {
      provider: "approved-db-provider",
      region: "region-near-workers",
      projectRef: "stagingproject",
      approvedConnectionLimit: 12,
      approvalRef: "OPS-DB-001"
    },
    hosts: [
      {
        replicaId: "worker-a",
        provider: "provider-a",
        accountRef: "account-a",
        region: "region-a",
        availabilityZone: "zone-a",
        failureDomain: "failure-a",
        powerDomain: "power-a",
        networkDomain: "network-a",
        sshAlias: "schoolcast-a",
        privateMetricsAddress: "10.20.0.11",
        externalHeartbeatCheckRef: "heartbeat-a",
        approvalRef: "OPS-HOST-A",
        resources: { architecture: "arm64", vCpu: 1, memoryMb: 6_144, diskGb: 30 }
      },
      {
        replicaId: "worker-b",
        provider: "provider-b",
        accountRef: "account-b",
        region: "region-b",
        availabilityZone: "zone-b",
        failureDomain: "failure-b",
        powerDomain: "power-b",
        networkDomain: "network-b",
        sshAlias: "schoolcast-b",
        privateMetricsAddress: "10.30.0.11",
        externalHeartbeatCheckRef: "heartbeat-b",
        approvalRef: "OPS-HOST-B",
        resources: { architecture: "amd64", vCpu: 1, memoryMb: 6_144, diskGb: 30 }
      }
    ],
    independence: {
      sharedAvailabilityZone: false,
      sharedFailureDomain: false,
      sharedPowerDomain: false,
      sharedNetworkDomain: false,
      evidenceRef: "OPS-INDEPENDENCE-001"
    },
    monitoring: {
      externalProvider: "approved-deadman-monitor",
      externalFailureDomain: "monitor-domain-c",
      primaryDestinationRef: "alert-primary",
      backupDestinationRef: "alert-backup",
      primaryOwnerRef: "oncall-primary",
      backupOwnerRef: "oncall-backup",
      approvalRef: "OPS-ALERTS-001"
    },
    malwareScanning: {
      mode: "CLAMAV",
      failClosed: true,
      quarantinePrivate: true,
      replicas: [
        {
          replicaId: "worker-a",
          failureDomain: "failure-a",
          privateEndpointRef: "scanner-a",
          signatureUpdateIntervalHours: 3
        },
        {
          replicaId: "worker-b",
          failureDomain: "failure-b",
          privateEndpointRef: "scanner-b",
          signatureUpdateIntervalHours: 3
        }
      ],
      approvalRef: "SEC-SCANNER-001"
    },
    logs: {
      retentionDays: 30,
      encryptedAtRest: true,
      offHostCopy: true,
      destinationFailureDomain: "logs-domain-c",
      accessApprovalRef: "SEC-LOGS-001",
      recoveryEvidenceRef: "OPS-LOG-RESTORE-001"
    }
  };
}

describe("SchoolCast distributed host inventory", () => {
  it("accepts two independent hosts with redundant scanning and external monitoring", () => {
    expect(validateSchoolCastHostInventory(validInventory())).toMatchObject({
      ok: true,
      environment: "STAGING",
      workerReplicas: 2,
      scannerReplicas: 2,
      alertDestinations: 2,
      externalHeartbeatChecks: 2
    });
  });

  it("rejects shared worker failure domains", () => {
    const inventory = validInventory();
    inventory.hosts[1].failureDomain = inventory.hosts[0].failureDomain;
    inventory.malwareScanning.replicas[1].failureDomain = inventory.hosts[0].failureDomain;

    expect(() => validateSchoolCastHostInventory(inventory)).toThrow("separate failure domains");
  });

  it("rejects placeholders and log recovery in a worker failure domain", () => {
    const placeholder = validInventory();
    placeholder.hosts[0].approvalRef = "REPLACE-HOST-APPROVAL";
    expect(() => validateSchoolCastHostInventory(placeholder)).toThrow("Placeholder values");

    const sharedLogs = validInventory();
    sharedLogs.logs.destinationFailureDomain = sharedLogs.hosts[0].failureDomain;
    expect(() => validateSchoolCastHostInventory(sharedLogs)).toThrow("Off-host log recovery");
  });

  it("rejects public metrics addresses and duplicate alert routes", () => {
    const inventory = validInventory();
    inventory.hosts[1].privateMetricsAddress = "203.0.113.10";
    inventory.monitoring.backupDestinationRef = inventory.monitoring.primaryDestinationRef;

    expect(() => validateSchoolCastHostInventory(inventory)).toThrow();
  });
});
