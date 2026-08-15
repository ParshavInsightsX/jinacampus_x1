import { isIP } from "node:net";

const TOKENS = {
  monitorReplica: "__MONITOR_REPLICA__",
  workerA: "__WORKER_A_TARGET__",
  workerB: "__WORKER_B_TARGET__",
  alertmanagerA: "__ALERTMANAGER_A_TARGET__",
  alertmanagerB: "__ALERTMANAGER_B_TARGET__"
} as const;

function isPrivateHost(host: string) {
  if (isIP(host) === 4) {
    const parts = host.split(".").map(Number);
    return parts[0] === 10
      || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
      || (parts[0] === 192 && parts[1] === 168);
  }
  if (isIP(host) === 6) return /^(fc|fd)/i.test(host);
  return /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:internal|private|lan)$/i.test(host);
}

function validateTarget(value: string, expectedPort: number) {
  if (value.includes("://") || /[@/?#]/.test(value)) throw new Error("SCHOOLCAST_MONITOR_TARGET_INVALID");
  const separator = value.lastIndexOf(":");
  if (separator <= 0) throw new Error("SCHOOLCAST_MONITOR_TARGET_INVALID");
  const host = value.slice(0, separator).replace(/^\[|\]$/g, "");
  const port = Number.parseInt(value.slice(separator + 1), 10);
  if (!isPrivateHost(host) || port !== expectedPort) throw new Error("SCHOOLCAST_MONITOR_TARGET_INVALID");
  return value;
}

type DistributedMonitoringInput = {
  template: string;
  monitorReplica: "worker-a" | "worker-b";
  workerATarget: string;
  workerBTarget: string;
  alertmanagerATarget: string;
  alertmanagerBTarget: string;
};

export function renderSchoolCastDistributedMonitoringConfig(input: DistributedMonitoringInput) {
  const workerATarget = validateTarget(input.workerATarget, 9_464);
  const workerBTarget = validateTarget(input.workerBTarget, 9_464);
  const alertmanagerATarget = validateTarget(input.alertmanagerATarget, 9_093);
  const alertmanagerBTarget = validateTarget(input.alertmanagerBTarget, 9_093);
  if (workerATarget === workerBTarget || alertmanagerATarget === alertmanagerBTarget) {
    throw new Error("SCHOOLCAST_MONITOR_TARGETS_MUST_DIFFER");
  }

  const replacements = new Map<string, string>([
    [TOKENS.monitorReplica, input.monitorReplica],
    [TOKENS.workerA, workerATarget],
    [TOKENS.workerB, workerBTarget],
    [TOKENS.alertmanagerA, alertmanagerATarget],
    [TOKENS.alertmanagerB, alertmanagerBTarget]
  ]);
  let rendered = input.template;
  for (const [token, value] of replacements) {
    if (!rendered.includes(token)) throw new Error("SCHOOLCAST_MONITOR_TEMPLATE_INVALID");
    rendered = rendered.replaceAll(token, value);
  }
  if (/__[A-Z0-9_]+__/.test(rendered)) throw new Error("SCHOOLCAST_MONITOR_TEMPLATE_UNRESOLVED");
  return rendered;
}
