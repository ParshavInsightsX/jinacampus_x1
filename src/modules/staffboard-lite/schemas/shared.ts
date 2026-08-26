import { z } from "zod";

const indianMobilePattern = /^(?:\+91)?[6-9]\d{9}$/;

function emptyStringToUndefined(value: unknown) {
  if (typeof value !== "string") return value;

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizePhoneInput(value: unknown) {
  if (typeof value !== "string") return value;

  const trimmed = value.trim();
  if (!trimmed) return undefined;

  return trimmed.replace(/[\s-]/g, "");
}

function cleanDateInput(value: unknown) {
  if (value === null || value === "") return undefined;
  return value;
}

export function hasAtLeastOneUpdateValue(value: Record<string, unknown>) {
  return Object.values(value).some((field) => field !== undefined);
}

export const idSchema = z.string().uuid();

export function trimmedString(minLength: number, maxLength: number) {
  return z.string().trim().min(minLength).max(maxLength);
}

export function optionalTrimmedString(maxLength: number) {
  return z.preprocess(emptyStringToUndefined, z.string().max(maxLength).optional());
}

export const optionalDateSchema = z.preprocess(cleanDateInput, z.coerce.date().optional());

export const emailSchema = z.preprocess(
  emptyStringToUndefined,
  z.string().trim().toLowerCase().email().max(180).optional()
);

export const phoneSchema = z.preprocess(
  normalizePhoneInput,
  z.string().regex(indianMobilePattern, "Enter a valid Indian mobile number").optional()
);

export const paginationFields = {
  page: z.coerce.number().int().min(1).max(10000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20)
} as const;

export const searchSchema = optionalTrimmedString(120);

export const staffTypeSchema = z.enum([
  "TEACHER",
  "ADMIN",
  "ACCOUNTANT",
  "LIBRARIAN",
  "DRIVER",
  "HELPER",
  "SECURITY",
  "PEON",
  "CLEANING_STAFF",
  "MANAGEMENT",
  "OTHER"
]);

export const employmentStatusSchema = z.enum(["ACTIVE", "INACTIVE", "RESIGNED", "TERMINATED"]);

export const staffAttendanceStatusSchema = z.enum([
  "PRESENT",
  "ABSENT",
  "LATE",
  "HALF_DAY",
  "ON_LEAVE",
  "OFFICIAL_DUTY",
  "WEEK_OFF",
  "HOLIDAY",
  "INCOMPLETE",
  "NOT_MARKED"
]);

export const staffAttendanceCorrectionStatusSchema = z.enum([
  "PRESENT",
  "ABSENT",
  "LATE",
  "HALF_DAY",
  "ON_LEAVE",
  "OFFICIAL_DUTY",
  "WEEK_OFF",
  "HOLIDAY"
]);

export const staffQrPurposeSchema = z.enum(["CHECK_IN", "CHECK_OUT"]);
