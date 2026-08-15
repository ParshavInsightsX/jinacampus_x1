import { describe, expect, it } from "vitest";

import { renderSchoolCastDistributedMonitoringConfig } from "@/modules/schoolcast/operations/distributed-monitoring-config";

const template = [
  "external_labels:",
  "  monitor_replica: __MONITOR_REPLICA__",
  "workers: [__WORKER_A_TARGET__, __WORKER_B_TARGET__]",
  "alerts: [__ALERTMANAGER_A_TARGET__, __ALERTMANAGER_B_TARGET__]"
].join("\n");

describe("SchoolCast distributed monitoring configuration", () => {
  it("renders two private worker and Alertmanager targets", () => {
    const rendered = renderSchoolCastDistributedMonitoringConfig({
      template,
      monitorReplica: "worker-a",
      workerATarget: "10.20.0.11:9464",
      workerBTarget: "10.30.0.11:9464",
      alertmanagerATarget: "10.20.0.11:9093",
      alertmanagerBTarget: "10.30.0.11:9093"
    });

    expect(rendered).toContain("monitor_replica: worker-a");
    expect(rendered).toContain("10.20.0.11:9464");
    expect(rendered).not.toMatch(/__[A-Z0-9_]+__/);
  });

  it("rejects public, credential-bearing, and duplicate targets", () => {
    expect(() => renderSchoolCastDistributedMonitoringConfig({
      template,
      monitorReplica: "worker-a",
      workerATarget: "203.0.113.10:9464",
      workerBTarget: "10.30.0.11:9464",
      alertmanagerATarget: "10.20.0.11:9093",
      alertmanagerBTarget: "10.30.0.11:9093"
    })).toThrow("SCHOOLCAST_MONITOR_TARGET_INVALID");

    expect(() => renderSchoolCastDistributedMonitoringConfig({
      template,
      monitorReplica: "worker-a",
      workerATarget: "10.20.0.11:9464",
      workerBTarget: "10.20.0.11:9464",
      alertmanagerATarget: "10.20.0.11:9093",
      alertmanagerBTarget: "10.30.0.11:9093"
    })).toThrow("SCHOOLCAST_MONITOR_TARGETS_MUST_DIFFER");
  });
});
