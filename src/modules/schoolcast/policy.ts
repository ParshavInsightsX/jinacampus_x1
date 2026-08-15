import { createHash } from "node:crypto";

const UNSAFE_HTML = /<\s*(script|iframe|object|embed|style|link|meta)|\son\w+\s*=|javascript\s*:/i;

export function assertSafeSchoolCastText(value: string) {
  if (UNSAFE_HTML.test(value)) throw new Error("SCHOOLCAST_UNSAFE_CONTENT");
  return value.trim();
}

export function renderSchoolCastPlainTextHtml(value: string) {
  const safe = assertSafeSchoolCastText(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
  return safe.split(/\r?\n/).map((line) => `<p>${line || "&nbsp;"}</p>`).join("");
}

export function schoolCastHash(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function schoolCastContentHash(input: Record<string, unknown>) {
  return schoolCastHash(JSON.stringify(input));
}

export function maskSchoolCastEmail(value: string | null | undefined) {
  if (!value) return null;
  const [name, domain] = value.trim().toLowerCase().split("@");
  if (!name || !domain) return null;
  return `${name.slice(0, 2)}${"*".repeat(Math.max(2, name.length - 2))}@${domain}`;
}

export function maskSchoolCastPhone(value: string | null | undefined) {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  if (digits.length < 4) return "****";
  return `${"*".repeat(Math.max(4, digits.length - 4))}${digits.slice(-4)}`;
}

export function schoolCastContactHash(value: string | null | undefined) {
  if (!value) return null;
  return schoolCastHash(value.trim().toLowerCase());
}

export function schoolCastIdempotencyKey(parts: readonly (string | number | null | undefined)[]) {
  return `schoolcast:${schoolCastHash(parts.map((part) => String(part ?? "-")).join(":"))}`;
}

export function assertSchoolCastTransition(
  from: string,
  allowedFrom: readonly string[],
  errorCode = "SCHOOLCAST_INVALID_STATUS"
) {
  if (!allowedFrom.includes(from)) throw new Error(errorCode);
}

export function sanitizeSchoolCastError(error: unknown) {
  const value = error instanceof Error ? error.message : "SCHOOLCAST_UNKNOWN_ERROR";
  return value
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [redacted]")
    .replace(/token[=:]\s*[^&\s]+/gi, "token=[redacted]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted-email]")
    .slice(0, 500);
}