import { readFile } from "node:fs/promises";
import path from "node:path";

import { ZodError } from "zod";

import { validateSchoolCastHostInventory } from "../src/modules/schoolcast/operations/host-inventory";

async function main() {
  const configuredPath = process.env.SCHOOLCAST_HOST_INVENTORY_FILE;
  if (!configuredPath) throw new Error("SCHOOLCAST_HOST_INVENTORY_FILE_REQUIRED");

  const content = await readFile(path.resolve(configuredPath), "utf8");
  const result = validateSchoolCastHostInventory(JSON.parse(content) as unknown);
  console.info(JSON.stringify({
    ...result,
    productionMigrationAuthorized: false,
    productionWorkerActivationAuthorized: false
  }));
}

main().catch((error: unknown) => {
  const code = error instanceof ZodError
    ? "SCHOOLCAST_HOST_INVENTORY_INVALID"
    : error instanceof Error && /^SCHOOLCAST_[A-Z0-9_]+$/.test(error.message)
      ? error.message
      : "SCHOOLCAST_HOST_INVENTORY_VALIDATION_FAILED";
  console.error(JSON.stringify({ ok: false, code }));
  process.exitCode = 1;
});
