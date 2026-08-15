import { readFile } from "node:fs/promises";
import path from "node:path";

import { ZodError } from "zod";

import { evaluateSchoolCastRehearsalEvidence } from "../src/modules/schoolcast/operations/rehearsal-evidence";

async function main() {
  const configuredPath = process.env.SCHOOLCAST_REHEARSAL_EVIDENCE_FILE;
  if (!configuredPath) throw new Error("SCHOOLCAST_REHEARSAL_EVIDENCE_FILE_REQUIRED");

  const content = await readFile(path.resolve(configuredPath), "utf8");
  const result = evaluateSchoolCastRehearsalEvidence(JSON.parse(content) as unknown);
  console.info(JSON.stringify(result));
  if (!result.ok) process.exitCode = 2;
}

main().catch((error: unknown) => {
  const code = error instanceof ZodError
    ? "SCHOOLCAST_REHEARSAL_EVIDENCE_INVALID"
    : error instanceof Error && /^SCHOOLCAST_[A-Z0-9_]+$/.test(error.message)
      ? error.message
      : "SCHOOLCAST_REHEARSAL_EVIDENCE_VALIDATION_FAILED";
  console.error(JSON.stringify({ ok: false, code }));
  process.exitCode = 1;
});
