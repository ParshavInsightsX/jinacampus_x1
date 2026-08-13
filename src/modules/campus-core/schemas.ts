import { z } from "zod";
import { isPermissionCode } from "@/lib/rbac/permissions";
import { isValidTimeZone } from "@/lib/dates/time-zone";
import { principalPasswordRecoveryRequestSchema } from "@/modules/campus-core/principal-password-recovery.schemas";

const hhmm = /^([01]\d|2[0-3]):[0-5]\d$/;
const tenantSlug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const uuid = z.string().uuid();
const roleCode = z.string().min(2).max(80).regex(/^[A-Z0-9_]+$/);
const permissionCode = z.string().min(3).refine(isPermissionCode, { message: "Unknown permission code" });
const timeZone = z.string().trim().min(2).max(80).refine(isValidTimeZone, {
  message: "Enter a valid IANA time zone, for example Asia/Kolkata."
});
const phone = z.string().min(6).max(20).optional();
const password = z.string().min(8, "Password must be at least 8 characters.").max(200);
const displayName = z.preprocess(
  (value) => typeof value === "string" && value.trim() === "" ? null : value,
  z.string().trim().min(2).max(160).nullable().optional()
);
const logoUrl = z.preprocess(
  (value) => typeof value === "string" && value.trim() === "" ? null : value,
  z.string().trim().url("Enter a valid logo URL.").max(500).nullable().optional()
);
const statusFields = {
  tenant: z.enum(["ACTIVE", "SUSPENDED", "ARCHIVED"]),
  institution: z.enum(["ACTIVE", "INACTIVE", "ARCHIVED"]),
  branch: z.enum(["ACTIVE", "INACTIVE", "ARCHIVED"]),
  academicYear: z.enum(["DRAFT", "ACTIVE", "LOCKED", "ARCHIVED"]),
  user: z.enum(["INVITED", "ACTIVE", "SUSPENDED", "DEACTIVATED"])
};

function atLeastOneValue(value: Record<string, unknown>) {
  return Object.values(value).some((field) => field !== undefined);
}

export const createTenantSchema = z.object({
  name: z.string().min(2).max(160),
  slug: z.string().min(2).max(80).regex(tenantSlug),
  legalName: z.string().max(180).optional(),
  supportEmail: z.string().email().optional(),
  phone,
  website: z.string().url().optional()
});

export const updateTenantSchema = createTenantSchema.partial().extend({
  tenantId: uuid,
  status: statusFields.tenant.optional()
}).refine(({ tenantId: _tenantId, ...value }) => atLeastOneValue(value), {
  message: "At least one tenant field is required"
});

export const createInstitutionSchema = z.object({
  name: z.string().min(2).max(160),
  displayName,
  code: z.string().min(2).max(40).regex(/^[A-Z0-9_-]+$/),
  board: z.string().max(80).optional(),
  medium: z.string().max(80).optional(),
  logoUrl,
  logoObjectKey: z.string().max(500).optional(),
  addressLine1: z.string().max(180).optional(),
  addressLine2: z.string().max(180).optional(),
  city: z.string().max(80).optional(),
  state: z.string().max(80).optional(),
  postalCode: z.string().max(20).optional(),
  country: z.string().max(80).default("India")
});

export const updateInstitutionSchema = createInstitutionSchema.partial().extend({
  institutionId: uuid,
  status: statusFields.institution.optional()
}).refine(({ institutionId: _institutionId, ...value }) => atLeastOneValue(value), {
  message: "At least one institution field is required"
});

export const updateInstitutionProfileSchema = updateInstitutionSchema;
export const updateInstitutionBrandingSchema = z.object({
  institutionId: uuid,
  displayName,
  logoUrl,
  logoObjectKey: z.string().max(500).optional()
}).refine(({ institutionId: _institutionId, ...value }) => atLeastOneValue(value), {
  message: "At least one branding field is required"
});

export const createBranchSchema = z.object({
  institutionId: uuid,
  name: z.string().min(2).max(160),
  code: z.string().min(2).max(40).regex(/^[A-Z0-9_-]+$/),
  addressLine1: z.string().max(180).optional(),
  addressLine2: z.string().max(180).optional(),
  city: z.string().max(80).optional(),
  state: z.string().max(80).optional(),
  postalCode: z.string().max(20).optional(),
  phone,
  email: z.string().email().optional(),
  timezone: timeZone.default("Asia/Kolkata")
});

export const updateBranchSchema = createBranchSchema.partial().extend({
  branchId: uuid,
  status: statusFields.branch.optional()
}).refine(({ branchId: _branchId, ...value }) => atLeastOneValue(value), {
  message: "At least one branch field is required"
});

export const createAcademicYearSchema = z.object({
  institutionId: uuid,
  name: z.string().min(4).max(40),
  startDate: z.coerce.date(),
  endDate: z.coerce.date()
}).refine((value) => value.endDate > value.startDate, {
  message: "End date must be after start date",
  path: ["endDate"]
});

export const updateAcademicYearSchema = z.object({
  academicYearId: uuid,
  name: z.string().min(4).max(40).optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  status: statusFields.academicYear.optional()
}).refine(({ academicYearId: _academicYearId, ...value }) => atLeastOneValue(value), {
  message: "At least one academic year field is required"
}).refine((value) => {
  if (!value.startDate || !value.endDate) return true;
  return value.endDate > value.startDate;
}, {
  message: "End date must be after start date",
  path: ["endDate"]
});

export const activateAcademicYearSchema = z.object({
  academicYearId: uuid
});

const userProfileSchema = z.object({
  email: z.string().email().transform((value) => value.toLowerCase()),
  phone,
  firstName: z.string().min(1).max(80),
  middleName: z.string().max(80).optional(),
  lastName: z.string().max(80).optional(),
  userType: z.enum(["OWNER", "STAFF", "PARENT", "STUDENT", "SYSTEM"]).default("STAFF")
});

export const createUserSchema = userProfileSchema.extend({
  branchIds: z.array(uuid).default([]),
  roleCodes: z.array(roleCode).default([]),
  initialPassword: password.optional(),
  confirmInitialPassword: z.string().max(200).optional()
}).superRefine((value, ctx) => {
  const hasPassword = Boolean(value.initialPassword || value.confirmInitialPassword);
  if (!hasPassword) return;

  if (!value.initialPassword) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Password must be at least 8 characters.",
      path: ["initialPassword"]
    });
  }
  if (value.initialPassword !== value.confirmInitialPassword) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "New password and confirmation do not match.",
      path: ["confirmInitialPassword"]
    });
  }
});

export const updateUserSchema = userProfileSchema.partial().extend({
  userId: uuid,
  status: statusFields.user.optional()
}).refine(({ userId: _userId, ...value }) => atLeastOneValue(value), {
  message: "At least one user field is required"
});

export const deactivateUserSchema = z.object({
  userId: uuid,
  confirmDeactivation: z.boolean().refine((value) => value, {
    message: "Confirm that this user account should be deactivated."
  })
});

export const adminResetPasswordSchema = z.object({
  userId: uuid,
  newPassword: password,
  confirmNewPassword: z.string().max(200)
}).refine((value) => value.newPassword === value.confirmNewPassword, {
  message: "New password and confirmation do not match.",
  path: ["confirmNewPassword"]
});

export const changeOwnPasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required.").max(200),
  newPassword: password,
  confirmNewPassword: z.string().max(200)
}).refine((value) => value.newPassword === value.confirmNewPassword, {
  message: "New password and confirmation do not match.",
  path: ["confirmNewPassword"]
});

export const forgotPasswordSchema = principalPasswordRecoveryRequestSchema;

export const createRoleSchema = z.object({
  code: roleCode,
  name: z.string().min(2).max(120),
  description: z.string().max(300).optional(),
  scope: z.enum(["TENANT", "BRANCH", "ACADEMIC_YEAR"]).default("TENANT"),
  permissionCodes: z.array(permissionCode).default([])
});

export const updateRoleSchema = createRoleSchema.partial().extend({
  roleId: uuid,
  isActive: z.boolean().optional()
}).refine(({ roleId: _roleId, ...value }) => atLeastOneValue(value), {
  message: "At least one role field is required"
});

export const roleAssignmentSchema = z.object({
  userId: uuid,
  roleId: uuid,
  scopeType: z.enum(["TENANT", "BRANCH", "ACADEMIC_YEAR"]).default("TENANT"),
  scopeId: z.string().min(1).max(80).default("TENANT"),
  startsAt: z.coerce.date().optional(),
  endsAt: z.coerce.date().optional()
}).refine((value) => {
  if (value.scopeType === "TENANT") return value.scopeId === "TENANT";
  return z.string().uuid().safeParse(value.scopeId).success;
}, {
  message: "Scope id must match the role assignment scope",
  path: ["scopeId"]
}).refine((value) => {
  if (!value.startsAt || !value.endsAt) return true;
  return value.endsAt > value.startsAt;
}, {
  message: "End date must be after start date",
  path: ["endsAt"]
});

export const assignUserRoleSchema = roleAssignmentSchema;

export const removeUserRoleSchema = z.object({
  userId: uuid,
  roleId: uuid,
  scopeType: z.enum(["TENANT", "BRANCH", "ACADEMIC_YEAR"]).default("TENANT"),
  scopeId: z.string().min(1).max(80).default("TENANT")
}).refine((value) => {
  if (value.scopeType === "TENANT") return value.scopeId === "TENANT";
  return z.string().uuid().safeParse(value.scopeId).success;
}, {
  message: "Scope id must match the role assignment scope",
  path: ["scopeId"]
});

export const assignUserBranchSchema = z.object({
  userId: uuid,
  branchId: uuid
});

export const removeUserBranchSchema = assignUserBranchSchema;

export const updateTenantSettingsSchema = z.object({
  brandName: z.string().min(2).max(120),
  brandByline: z.string().max(160).optional(),
  timezone: timeZone.default("Asia/Kolkata"),
  locale: z.string().min(2).max(20).default("en-IN"),
  dateFormat: z.string().min(4).max(30).default("dd/MM/yyyy"),
  currency: z.string().length(3).default("INR"),
  allowMultipleActiveAcademicYears: z.boolean().default(false)
});

export const updateAttendanceSettingsSchema = z.object({
  branchId: uuid,
  studentAttendanceMode: z.enum(["DAILY", "PERIOD"]).default("DAILY"),
  studentDefaultSessionType: z.enum(["FULL_DAY", "MORNING", "AFTERNOON", "PERIOD"]).default("FULL_DAY"),
  studentAutoLockEnabled: z.boolean().default(true),
  studentAutoLockTime: z.string().regex(hhmm).default("15:00"),
  sendStudentAbsentAlert: z.boolean().default(true),
  sendStudentLateAlert: z.boolean().default(false),
  studentAttendanceWhatsAppEnabled: z.boolean().default(false),
  studentAttendanceNotificationMode: z.enum(["DISABLED", "EXCEPTION_ONLY", "ALL_STATUSES"]).default("EXCEPTION_ONLY"),
  minimumAttendancePercentage: z.number().int().min(0).max(100).default(75),
  staffQrAttendanceEnabled: z.boolean().default(true),
  staffCheckInStartTime: z.string().regex(hhmm).default("07:30"),
  staffLateAfterTime: z.string().regex(hhmm).default("08:00"),
  staffHalfDayBeforeMinutes: z.number().int().min(0).max(720).default(240),
  staffMinimumWorkingMinutes: z.number().int().min(0).max(900).default(360),
  staffQrTokenValiditySeconds: z.literal(18000).default(18000),
  staffWeeklySummaryWhatsAppEnabled: z.boolean().default(false),
  staffWeeklySummarySendDay: z.number().int().min(1).max(7).default(1),
  staffWeeklySummarySendTime: z.string().regex(hhmm).default("09:00"),
  staffMonthlySummaryWhatsAppEnabled: z.boolean().default(false),
  staffMonthlySummarySendDay: z.number().int().min(1).max(28).default(1),
  staffMonthlySummarySendTime: z.string().regex(hhmm).default("09:00")
});
