import { createHmac } from "node:crypto";
import type { InstitutionIdentifierType } from "@prisma/client";
import { env } from "@/lib/env";

export function normalizeOfficialIdentifier(type: InstitutionIdentifierType, value: string) {
  const trimmed = value.trim().toUpperCase();
  if (type === "UDISE" || type === "LEGACY_DISE") {
    return trimmed.replace(/\s+/g, "");
  }
  return trimmed.replace(/[^A-Z0-9]/g, "");
}

export function normalizeAuthorizationNumber(value: string) {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function officialIdentifierClaimFingerprint(input: {
  authorityId: string;
  type: InstitutionIdentifierType;
  normalizedValue: string;
}) {
  const derivedKey = createHmac("sha256", env.PASSWORD_PEPPER)
    .update("jinacampus/regulatory-identifier-claims/v1")
    .digest();
  return createHmac("sha256", derivedKey)
    .update(`${input.authorityId}|${input.type}|${input.normalizedValue}`)
    .digest("hex");
}

export function maskOfficialValue(value: string | null | undefined) {
  if (!value) return null;
  if (value.length <= 4) return "****";
  return `${"*".repeat(Math.min(8, value.length - 4))}${value.slice(-4)}`;
}
