import { createHash } from "node:crypto";

function normalise(value: unknown): unknown {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(normalise);
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(record)
        .filter((key) => record[key] !== undefined)
        .sort()
        .map((key) => [key, normalise(record[key])])
    );
  }
  return String(value);
}

export function canonicalJson(value: unknown) {
  return JSON.stringify(normalise(value));
}

export function hashCanonicalJson(value: unknown) {
  return createHash("sha256").update(canonicalJson(value), "utf8").digest("hex");
}
