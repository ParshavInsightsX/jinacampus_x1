import { z } from "zod";
import {
  bloodGroupSchema,
  dateSchema,
  genderSchema,
  hasAtLeastOneUpdateValue,
  idSchema,
  optionalDateSchema,
  optionalTrimmedString,
  paginationFields,
  searchSchema,
  studentStatusSchema,
  trimmedString
} from "./shared";
import {
  INDIAN_STATE_OPTIONS,
  NATIONALITY_OPTIONS,
  STUDENT_CATEGORY_OPTIONS,
  STUDENT_RELIGION_OPTIONS
} from "@/modules/academia/student-registration-options";

function leftDateIsNotBeforeStartDate(value: { joinedAt?: Date; leftAt?: Date }) {
  if (!value.joinedAt || !value.leftAt) return true;
  return value.leftAt >= value.joinedAt;
}

function removeSpacesAndHyphens(value: unknown) {
  if (typeof value !== "string") return value;
  const normalized = value.replace(/[\s-]/g, "");
  return normalized.length ? normalized : undefined;
}

function uppercaseIfsc(value: unknown) {
  if (typeof value !== "string") return value;
  const normalized = value.trim().toUpperCase();
  return normalized.length ? normalized : undefined;
}

function digitsOnly(value: string) {
  return value.replace(/\D/g, "");
}

function lastFourDigits(value: string) {
  return digitsOnly(value).slice(-4);
}

export function maskAadhaarNumber(value: string) {
  const last4 = lastFourDigits(value);
  return last4 ? `XXXX-XXXX-${last4}` : undefined;
}

export function maskBankAccountNumber(value: string) {
  const last4 = lastFourDigits(value);
  return last4 ? `XXXXXX${last4}` : undefined;
}

export const religionSchema = z.enum(STUDENT_RELIGION_OPTIONS);
export const categorySchema = z.enum(STUDENT_CATEGORY_OPTIONS);
export const indianStateSchema = z.enum(INDIAN_STATE_OPTIONS);
export const nationalitySchema = z.enum(NATIONALITY_OPTIONS).default("India");
export const aadhaarNumberSchema = z.preprocess(
  removeSpacesAndHyphens,
  z.string().regex(/^\d{12}$/, "Enter a valid 12-digit Aadhaar number")
);
export const optionalBankAccountNumberSchema = z.preprocess(
  removeSpacesAndHyphens,
  z.string().regex(/^\d{6,18}$/, "Enter a valid bank account number").optional()
);
export const optionalPincodeSchema = z.preprocess(
  removeSpacesAndHyphens,
  z.string().regex(/^\d{6}$/, "Enter a valid 6-digit pincode").optional()
);
export const optionalIfscSchema = z.preprocess(
  uppercaseIfsc,
  z.string().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, "Enter a valid IFSC code").optional()
);

export const createStudentSchema = z.object({
  branchId: idSchema,
  admissionNumber: trimmedString(1, 60),
  admissionDate: dateSchema,
  fullName: trimmedString(1, 180),
  firstName: optionalTrimmedString(80),
  middleName: optionalTrimmedString(80),
  lastName: optionalTrimmedString(80),
  displayName: optionalTrimmedString(180),
  dateOfBirth: dateSchema,
  gender: genderSchema.optional(),
  bloodGroup: bloodGroupSchema.optional(),
  fatherName: trimmedString(1, 120),
  fatherOccupation: optionalTrimmedString(120),
  motherName: trimmedString(1, 120),
  guardianName: optionalTrimmedString(120),
  aadhaarNumber: aadhaarNumberSchema.optional(),
  familyIdNumber: optionalTrimmedString(80),
  sssmIdNumber: optionalTrimmedString(80),
  apaarIdNumber: optionalTrimmedString(80),
  religion: religionSchema,
  caste: trimmedString(1, 80),
  category: categorySchema,
  nationality: nationalitySchema,
  currentAddress: optionalTrimmedString(500),
  permanentAddress: optionalTrimmedString(500),
  city: trimmedString(1, 80),
  state: indianStateSchema,
  pincode: optionalPincodeSchema,
  bankAccountNumber: optionalBankAccountNumberSchema,
  bankBranchName: optionalTrimmedString(120),
  ifscCode: optionalIfscSchema,
  status: studentStatusSchema.optional(),
  joinedAt: optionalDateSchema,
  leftAt: optionalDateSchema
}).strict().refine(leftDateIsNotBeforeStartDate, {
  message: "Left date must not be before joined date",
  path: ["leftAt"]
});

export const updateStudentSchema = z.object({
  studentId: idSchema,
  branchId: idSchema.optional(),
  admissionNumber: optionalTrimmedString(60),
  admissionDate: optionalDateSchema,
  fullName: optionalTrimmedString(180),
  firstName: optionalTrimmedString(80),
  middleName: optionalTrimmedString(80),
  lastName: optionalTrimmedString(80),
  displayName: optionalTrimmedString(180),
  dateOfBirth: optionalDateSchema,
  gender: genderSchema.optional(),
  bloodGroup: bloodGroupSchema.optional(),
  fatherName: optionalTrimmedString(120),
  fatherOccupation: optionalTrimmedString(120),
  motherName: optionalTrimmedString(120),
  guardianName: optionalTrimmedString(120),
  aadhaarNumber: aadhaarNumberSchema.optional(),
  familyIdNumber: optionalTrimmedString(80),
  sssmIdNumber: optionalTrimmedString(80),
  apaarIdNumber: optionalTrimmedString(80),
  religion: religionSchema.optional(),
  caste: optionalTrimmedString(80),
  category: categorySchema.optional(),
  nationality: nationalitySchema.optional(),
  currentAddress: optionalTrimmedString(500),
  permanentAddress: optionalTrimmedString(500),
  city: optionalTrimmedString(80),
  state: indianStateSchema.optional(),
  pincode: optionalPincodeSchema,
  bankAccountNumber: optionalBankAccountNumberSchema,
  bankBranchName: optionalTrimmedString(120),
  ifscCode: optionalIfscSchema,
  status: studentStatusSchema.optional(),
  joinedAt: optionalDateSchema,
  leftAt: optionalDateSchema
}).strict().refine(({ studentId: _studentId, ...value }) => hasAtLeastOneUpdateValue(value), {
  message: "At least one student field is required"
}).refine(leftDateIsNotBeforeStartDate, {
  message: "Left date must not be before joined date",
  path: ["leftAt"]
});

export const listStudentsSchema = z.object({
  branchId: idSchema.optional(),
  classSectionId: idSchema.optional(),
  search: searchSchema,
  status: studentStatusSchema.optional(),
  gender: genderSchema.optional(),
  bloodGroup: bloodGroupSchema.optional(),
  category: categorySchema.optional(),
  ...paginationFields
}).strict();

export type CreateStudentInput = z.infer<typeof createStudentSchema>;
export type UpdateStudentInput = z.infer<typeof updateStudentSchema>;
export type ListStudentsInput = z.infer<typeof listStudentsSchema>;
