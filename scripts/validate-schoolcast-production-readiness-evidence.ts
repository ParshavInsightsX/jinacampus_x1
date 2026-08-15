import { readFile } from "node:fs/promises";
import path from "node:path";

import { ZodError } from "zod";

import { evaluateSchoolCastProductionReadinessEvidence } from "../src/modules/schoolcast/operations/production-readiness-evidence";

async function main() {
  const configuredPath = process.env.SCHOOLCAST_PRODUCTION_READINESS_EVIDENCE_FILE;
  if (!configuredPath) throw new Error("SCHOOLCAST_PRODUCTION_READINESS_EVIDENCE_FILE_REQUIRED");

  const content = await readFile(path.resolve(configuredPath), "utf8");
  const result = evaluateSchoolCastProductionReadinessEvidence(JSON.parse(content) as unknown);
  console.info(JSON.stringify(result));
  if (!result.ok) process.exitCode = 2;
}

main().catch((error: unknown) => {
  const code = error instanceof ZodError
    ? "SCHOOLCAST_PRODUCTION_READINESS_EVIDENCE_INVALID"
    : error instanceof Error && /^SCHOOLCAST_[A-Z0-9_]+$/.test(error.message)
      ? error.message
      : "SCHOOLCAST_PRODUCTION_READINESS_EVIDENCE_VALIDATION_FAILED";
  console.error(JSON.stringify({ ok: false, code }));
  process.exitCode = 1;
});
