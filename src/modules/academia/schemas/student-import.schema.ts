import { z } from "zod";
import {
  INDIAN_STATE_OPTIONS,
  NATIONALITY_OPTIONS,
  STUDENT_CATEGORY_OPTIONS,
  STUDENT_RELIGION_OPTIONS
} from "@/modules/academia/student-registration-options";
import {
  bloodGroupSchema,
  emailSchema,
  genderSchema,
  idSchema,
  optionalTrimmedString,
  trimmedString
} from "./shared";
import {
  optionalBankAccountNumberSchema,
  optionalIfscSchema,
  optionalPincodeSchema
} from "./student.schema";

const indianMobilePattern = /^(?:\+91)?[6-9]\d{9}$/;

function emptyStringToUndefined(value: unknown) {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : undefined;
}

function normalizePhoneInput(value: unknown) {
  if (typeof value !== "string") return value;
  const compact = value.trim().replace(/[\s()\-]/g, "");
  if (!compact) return undefined;
  return /^91[6-9]\d{9}$/.test(compact) ? `+${compact}` : compact;
}

function normalizeAadhaarInput(value: unknown) {
  if (typeof value !== "string") return value;
  const compact = value.replace(/[\s-]/g, "");
  return compact.length ? compact : undefined;
}

function strictImportDate(message: string) {
  return z.string().regex(/^\d{4}-\d{2}-\d{2}$/, message).transform((value, ctx) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== value) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message });
      return z.NEVER;
    }
    return date;
  });
}

const requiredImportDateSchema = strictImportDate("Enter a valid date in YYYY-MM-DD format.");
const optionalImportDateSchema = z.preprocess(
  emptyStringToUndefined,
  strictImportDate("Enter a valid date in YYYY-MM-DD format.").optional()
);
const dateOfBirthSchema = requiredImportDateSchema.refine(
  (date) => date <= new Date(),
  "Date of birth cannot be in the future."
);
const requiredContactNumberSchema = z.preprocess(
  normalizePhoneInput,
  z.string({ required_error: "Contact Number is required." })
    .regex(indianMobilePattern, "Enter a valid 10-digit Indian contact number.")
);
const optionalAadhaarNumberSchema = z.preprocess(
  normalizeAadhaarInput,
  z.string().regex(/^\d{12}$/, "Enter a valid 12-digit Aadhaar number.").optional()
);

export const studentBulkImportRegistrationSchema = z.object({
  student: z.object({
    branchId: idSchema,
    admissionNumber: trimmedString(1, 60),
    admissionDate: optionalImportDateSchema,
    fullName: trimmedString(1, 180),
    displayName: optionalTrimmedString(180),
    dateOfBirth: dateOfBirthSchema,
    gender: genderSchema.default("NOT_SPECIFIED"),
    bloodGroup: bloodGroupSchema.optional(),
    fatherName: trimmedString(1, 120),
    fatherOccupation: optionalTrimmedString(120),
    motherName: trimmedString(1, 120),
    guardianName: optionalTrimmedString(120),
    aadhaarNumber: optionalAadhaarNumberSchema,
    familyIdNumber: optionalTrimmedString(80),
    sssmIdNumber: optionalTrimmedString(80),
    apaarIdNumber: optionalTrimmedString(80),
    religion: z.enum(STUDENT_RELIGION_OPTIONS).optional(),
    caste: optionalTrimmedString(80),
    category: z.enum(STUDENT_CATEGORY_OPTIONS).optional(),
    nationality: z.enum(NATIONALITY_OPTIONS).optional(),
    currentAddress: optionalTrimmedString(500),
    permanentAddress: optionalTrimmedString(500),
    city: optionalTrimmedString(80),
    state: z.enum(INDIAN_STATE_OPTIONS).optional(),
    pincode: optionalPincodeSchema,
    bankAccountNumber: optionalBankAccountNumberSchema,
    bankBranchName: optionalTrimmedString(120),
    ifscCode: optionalIfscSchema,
    status: z.literal("ACTIVE").default("ACTIVE")
  }).strict(),
  primaryGuardian: z.object({
    relation: z.enum(["FATHER", "MOTHER", "GUARDIAN"]).default("FATHER"),
    phone: requiredContactNumberSchema,
    email: emailSchema,
    isEmergencyContact: z.boolean().default(true),
    hasPickupPermission: z.boolean().default(true)
  }).strict()
}).strict().superRefine((value, ctx) => {
  if (value.primaryGuardian.relation === "GUARDIAN" && !value.student.guardianName) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Enter the guardian name when Other Guardian is selected.",
      path: ["student", "guardianName"]
    });
  }
});

export type StudentBulkImportRegistrationInput = z.infer<typeof studentBulkImportRegistrationSchema>;
