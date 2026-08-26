"use server";

import { revalidatePath } from "next/cache";
import { mapActionError } from "@/lib/errors";
import { getTenantContext } from "@/lib/tenant/context";
import {
  assignStudentClassSchema,
  createClassSchema,
  createClassSectionSchema,
  createSectionSchema,
  createStudentRegistrationSchema,
  createSubjectSchema,
  updateEnrollmentSchema,
  updateClassSchema,
  updateClassSectionSchema,
  updateGuardianSchema,
  updateSectionSchema,
  updateStudentSchema,
  updateSubjectSchema
} from "@/modules/academia/schemas";
import { createClass, deactivateClass, updateClass } from "@/modules/academia/services/class.service";
import {
  createClassSection,
  deactivateClassSection,
  updateClassSection
} from "@/modules/academia/services/class-section.service";
import {
  assignStudentToClass,
  cancelEnrollment,
  updateEnrollment
} from "@/modules/academia/services/enrollment.service";
import { updateGuardian } from "@/modules/academia/services/guardian.service";
import { createSection, deactivateSection, updateSection } from "@/modules/academia/services/section.service";
import { deactivateStudent, updateStudent } from "@/modules/academia/services/student.service";
import { createStudentRegistration } from "@/modules/academia/services/student-registration.service";
import { createSubject, deactivateSubject, updateSubject } from "@/modules/academia/services/subject.service";

export type ProfileFormActionState = {
  ok: boolean;
  message?: string;
  error?: string;
  fieldErrors?: Record<string, string[]>;
  studentId?: string;
};

const duplicateStudentAdmissionMessage =
  "A student with this admission number already exists. Please use a different admission number.";

function stringValue(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function requiredStringValue(formData: FormData, key: string) {
  const value = stringValue(formData, key);
  if (!value) throw new Error(`Missing field: ${key}`);
  return value;
}

function numberValue(formData: FormData, key: string) {
  const value = stringValue(formData, key);
  return value ? Number(value) : undefined;
}

function checkboxValue(formData: FormData, key: string) {
  return formData.get(key) === "on";
}

function confirmedLifecycleAction(formData: FormData, label: string): ProfileFormActionState | null {
  if (formData.get("confirmLifecycleAction") === "on") return null;
  return {
    ok: false,
    error: `Confirm that this ${label} lifecycle action should be applied.`,
    fieldErrors: {
      confirmLifecycleAction: [`Confirm that this ${label} lifecycle action should be applied.`]
    }
  };
}

function profileFormError(error: unknown, fallbackMessage: string): ProfileFormActionState {
  const result = mapActionError(error, {
    fallbackMessage,
    validationMessage: "Please check the highlighted fields and try again."
  });

  return {
    ok: false,
    error: result.error,
    fieldErrors: result.fieldErrors
  };
}

function createStudentFormError(error: unknown): ProfileFormActionState {
  const result = mapActionError(error, {
    fallbackMessage: "Unable to create student. Please try again.",
    validationMessage: "Please check the highlighted fields and try again."
  });

  if (result.code === "STUDENT_ADMISSION_NUMBER_EXISTS") {
    return {
      ok: false,
      error: duplicateStudentAdmissionMessage,
      fieldErrors: {
        ...(result.fieldErrors ?? {}),
        admissionNumber: [duplicateStudentAdmissionMessage],
        admissionNo: [duplicateStudentAdmissionMessage]
      }
    };
  }

  return {
    ok: false,
    error: result.error,
    fieldErrors: result.fieldErrors
  };
}

function revalidateAcademicSetup() {
  revalidatePath("/academia");
  revalidatePath("/academia/setup");
  revalidatePath("/academia/classes");
  revalidatePath("/academia/sections");
  revalidatePath("/academia/subjects");
  revalidatePath("/academia/class-sections");
  revalidatePath("/dashboard");
}

export async function createClassAction(
  _state: ProfileFormActionState,
  formData: FormData
): Promise<ProfileFormActionState> {
  try {
    const input = createClassSchema.parse({
      code: requiredStringValue(formData, "code").toUpperCase(),
      name: requiredStringValue(formData, "name"),
      description: stringValue(formData, "description"),
      sortOrder: numberValue(formData, "sortOrder"),
      status: stringValue(formData, "status")
    });
    const ctx = await getTenantContext();
    await createClass(ctx, input);
    revalidateAcademicSetup();
    return { ok: true, message: "Class created." };
  } catch (error) {
    return profileFormError(error, "Unable to create class. Please try again.");
  }
}

export async function createSectionAction(
  _state: ProfileFormActionState,
  formData: FormData
): Promise<ProfileFormActionState> {
  try {
    const input = createSectionSchema.parse({
      code: requiredStringValue(formData, "code").toUpperCase(),
      name: requiredStringValue(formData, "name"),
      description: stringValue(formData, "description"),
      sortOrder: numberValue(formData, "sortOrder"),
      status: stringValue(formData, "status")
    });
    const ctx = await getTenantContext();
    await createSection(ctx, input);
    revalidateAcademicSetup();
    return { ok: true, message: "Section created." };
  } catch (error) {
    return profileFormError(error, "Unable to create section. Please try again.");
  }
}

export async function createSubjectAction(
  _state: ProfileFormActionState,
  formData: FormData
): Promise<ProfileFormActionState> {
  try {
    const input = createSubjectSchema.parse({
      code: requiredStringValue(formData, "code").toUpperCase(),
      name: requiredStringValue(formData, "name"),
      type: stringValue(formData, "type"),
      description: stringValue(formData, "description"),
      status: stringValue(formData, "status")
    });
    const ctx = await getTenantContext();
    await createSubject(ctx, input);
    revalidateAcademicSetup();
    return { ok: true, message: "Subject created." };
  } catch (error) {
    return profileFormError(error, "Unable to create subject. Please try again.");
  }
}

export async function createClassSectionAction(
  _state: ProfileFormActionState,
  formData: FormData
): Promise<ProfileFormActionState> {
  try {
    const ctx = await getTenantContext();
    if (!ctx.activeBranchId || !ctx.activeAcademicYearId) {
      return {
        ok: false,
        error: "Select an active branch and academic year before creating a class section."
      };
    }
    const input = createClassSectionSchema.parse({
      branchId: ctx.activeBranchId,
      academicYearId: ctx.activeAcademicYearId,
      classId: requiredStringValue(formData, "classId"),
      sectionId: requiredStringValue(formData, "sectionId"),
      classTeacherUserId: stringValue(formData, "classTeacherUserId"),
      displayName: requiredStringValue(formData, "displayName"),
      capacity: numberValue(formData, "capacity"),
      status: stringValue(formData, "status")
    });
    await createClassSection(ctx, input);
    revalidateAcademicSetup();
    return { ok: true, message: "Class section created." };
  } catch (error) {
    return profileFormError(error, "Unable to create class section. Please try again.");
  }
}

export async function updateClassSectionAction(
  _state: ProfileFormActionState,
  formData: FormData
): Promise<ProfileFormActionState> {
  try {
    const input = updateClassSectionSchema.parse({
      classSectionId: requiredStringValue(formData, "classSectionId"),
      classId: requiredStringValue(formData, "classId"),
      sectionId: requiredStringValue(formData, "sectionId"),
      classTeacherUserId: stringValue(formData, "classTeacherUserId"),
      displayName: requiredStringValue(formData, "displayName"),
      capacity: numberValue(formData, "capacity"),
      status: stringValue(formData, "status")
    });
    const ctx = await getTenantContext();
    await updateClassSection(ctx, input);
    revalidateAcademicSetup();
    revalidatePath(`/academia/class-sections/${input.classSectionId}/edit`);
    return { ok: true, message: "Class section updated." };
  } catch (error) {
    return profileFormError(error, "Unable to update class section. Please try again.");
  }
}

export async function deactivateClassSectionAction(
  _state: ProfileFormActionState,
  formData: FormData
): Promise<ProfileFormActionState> {
  try {
    const confirmationError = confirmedLifecycleAction(formData, "class section");
    if (confirmationError) return confirmationError;
    const classSectionId = requiredStringValue(formData, "classSectionId");
    const ctx = await getTenantContext();
    await deactivateClassSection(ctx, classSectionId);
    revalidateAcademicSetup();
    revalidatePath(`/academia/class-sections/${classSectionId}/edit`);
    return { ok: true, message: "Class section deactivated." };
  } catch (error) {
    return profileFormError(error, "Unable to deactivate class section. Please try again.");
  }
}

export async function updateClassAction(
  _state: ProfileFormActionState,
  formData: FormData
): Promise<ProfileFormActionState> {
  try {
    const input = updateClassSchema.parse({
      classId: requiredStringValue(formData, "classId"),
      code: requiredStringValue(formData, "code"),
      name: requiredStringValue(formData, "name"),
      description: stringValue(formData, "description"),
      sortOrder: numberValue(formData, "sortOrder"),
      status: stringValue(formData, "status")
    });
    const ctx = await getTenantContext();
    await updateClass(ctx, input);
    revalidatePath("/academia");
    revalidatePath("/academia/classes");
    revalidatePath(`/academia/classes/${input.classId}/edit`);
    revalidatePath("/dashboard");
    return { ok: true, message: "Class updated." };
  } catch (error) {
    return profileFormError(error, "Unable to update class. Please try again.");
  }
}

export async function deactivateClassAction(
  _state: ProfileFormActionState,
  formData: FormData
): Promise<ProfileFormActionState> {
  try {
    const confirmationError = confirmedLifecycleAction(formData, "class");
    if (confirmationError) return confirmationError;
    const classId = requiredStringValue(formData, "classId");
    const ctx = await getTenantContext();
    await deactivateClass(ctx, classId);
    revalidatePath("/academia");
    revalidatePath("/academia/classes");
    revalidatePath(`/academia/classes/${classId}/edit`);
    revalidatePath("/dashboard");
    return { ok: true, message: "Class deactivated." };
  } catch (error) {
    return profileFormError(error, "Unable to deactivate class. Please try again.");
  }
}

export async function updateSectionAction(
  _state: ProfileFormActionState,
  formData: FormData
): Promise<ProfileFormActionState> {
  try {
    const input = updateSectionSchema.parse({
      sectionId: requiredStringValue(formData, "sectionId"),
      code: requiredStringValue(formData, "code"),
      name: requiredStringValue(formData, "name"),
      description: stringValue(formData, "description"),
      sortOrder: numberValue(formData, "sortOrder"),
      status: stringValue(formData, "status")
    });
    const ctx = await getTenantContext();
    await updateSection(ctx, input);
    revalidatePath("/academia");
    revalidatePath("/academia/sections");
    revalidatePath(`/academia/sections/${input.sectionId}/edit`);
    revalidatePath("/dashboard");
    return { ok: true, message: "Section updated." };
  } catch (error) {
    return profileFormError(error, "Unable to update section. Please try again.");
  }
}

export async function deactivateSectionAction(
  _state: ProfileFormActionState,
  formData: FormData
): Promise<ProfileFormActionState> {
  try {
    const confirmationError = confirmedLifecycleAction(formData, "section");
    if (confirmationError) return confirmationError;
    const sectionId = requiredStringValue(formData, "sectionId");
    const ctx = await getTenantContext();
    await deactivateSection(ctx, sectionId);
    revalidatePath("/academia");
    revalidatePath("/academia/sections");
    revalidatePath(`/academia/sections/${sectionId}/edit`);
    revalidatePath("/dashboard");
    return { ok: true, message: "Section deactivated." };
  } catch (error) {
    return profileFormError(error, "Unable to deactivate section. Please try again.");
  }
}

export async function updateSubjectAction(
  _state: ProfileFormActionState,
  formData: FormData
): Promise<ProfileFormActionState> {
  try {
    const input = updateSubjectSchema.parse({
      subjectId: requiredStringValue(formData, "subjectId"),
      code: requiredStringValue(formData, "code"),
      name: requiredStringValue(formData, "name"),
      type: stringValue(formData, "type"),
      description: stringValue(formData, "description"),
      status: stringValue(formData, "status")
    });
    const ctx = await getTenantContext();
    await updateSubject(ctx, input);
    revalidatePath("/academia");
    revalidatePath("/academia/subjects");
    revalidatePath(`/academia/subjects/${input.subjectId}/edit`);
    revalidatePath("/dashboard");
    return { ok: true, message: "Subject updated." };
  } catch (error) {
    return profileFormError(error, "Unable to update subject. Please try again.");
  }
}

export async function deactivateSubjectAction(
  _state: ProfileFormActionState,
  formData: FormData
): Promise<ProfileFormActionState> {
  try {
    const confirmationError = confirmedLifecycleAction(formData, "subject");
    if (confirmationError) return confirmationError;
    const subjectId = requiredStringValue(formData, "subjectId");
    const ctx = await getTenantContext();
    await deactivateSubject(ctx, subjectId);
    revalidatePath("/academia");
    revalidatePath("/academia/subjects");
    revalidatePath(`/academia/subjects/${subjectId}/edit`);
    revalidatePath("/dashboard");
    return { ok: true, message: "Subject deactivated." };
  } catch (error) {
    return profileFormError(error, "Unable to deactivate subject. Please try again.");
  }
}

export async function createStudentAction(
  _state: ProfileFormActionState,
  formData: FormData
): Promise<ProfileFormActionState> {
  try {
    const initialClassSectionId = stringValue(formData, "initialClassSectionId");
    const input = createStudentRegistrationSchema.parse({
      student: {
        branchId: requiredStringValue(formData, "branchId"),
        admissionNumber: requiredStringValue(formData, "admissionNumber"),
        admissionDate: requiredStringValue(formData, "admissionDate"),
        fullName: requiredStringValue(formData, "fullName"),
        firstName: stringValue(formData, "firstName"),
        middleName: stringValue(formData, "middleName"),
        lastName: stringValue(formData, "lastName"),
        displayName: stringValue(formData, "displayName"),
        dateOfBirth: requiredStringValue(formData, "dateOfBirth"),
        gender: stringValue(formData, "gender"),
        bloodGroup: stringValue(formData, "bloodGroup"),
        fatherName: requiredStringValue(formData, "fatherName"),
        fatherOccupation: stringValue(formData, "fatherOccupation"),
        motherName: requiredStringValue(formData, "motherName"),
        guardianName: stringValue(formData, "guardianName"),
        aadhaarNumber: stringValue(formData, "aadhaarNumber"),
        familyIdNumber: stringValue(formData, "familyIdNumber"),
        sssmIdNumber: stringValue(formData, "sssmIdNumber"),
        apaarIdNumber: stringValue(formData, "apaarIdNumber"),
        religion: requiredStringValue(formData, "religion"),
        caste: requiredStringValue(formData, "caste"),
        category: requiredStringValue(formData, "category"),
        nationality: requiredStringValue(formData, "nationality"),
        currentAddress: stringValue(formData, "currentAddress"),
        permanentAddress: stringValue(formData, "permanentAddress"),
        city: requiredStringValue(formData, "city"),
        state: requiredStringValue(formData, "state"),
        pincode: stringValue(formData, "pincode"),
        bankAccountNumber: stringValue(formData, "bankAccountNumber"),
        bankBranchName: stringValue(formData, "bankBranchName"),
        ifscCode: stringValue(formData, "ifscCode"),
        status: stringValue(formData, "status"),
        joinedAt: stringValue(formData, "joinedAt"),
        leftAt: stringValue(formData, "leftAt")
      },
      primaryGuardian: {
        relation: requiredStringValue(formData, "primaryGuardianRelation"),
        phone: stringValue(formData, "primaryGuardianPhone"),
        email: stringValue(formData, "primaryGuardianEmail"),
        isEmergencyContact: checkboxValue(formData, "primaryGuardianEmergencyContact"),
        hasPickupPermission: checkboxValue(formData, "primaryGuardianPickupPermission")
      },
      initialClassAssignment: initialClassSectionId
        ? {
            classSectionId: initialClassSectionId,
            rollNumber: stringValue(formData, "initialRollNumber"),
            enrolledOn: stringValue(formData, "initialEnrolledOn")
          }
        : undefined
    });
    const ctx = await getTenantContext();
    const registration = await createStudentRegistration(ctx, input);
    revalidatePath("/academia");
    revalidatePath("/academia/students");
    revalidatePath(`/academia/students/${registration.student.id}`);
    revalidatePath("/dashboard");
    return {
      ok: true,
      message: "Student created.",
      studentId: registration.student.id
    };
  } catch (error) {
    return createStudentFormError(error);
  }
}

export async function assignStudentClassAction(
  _state: ProfileFormActionState,
  formData: FormData
): Promise<ProfileFormActionState> {
  try {
    const input = assignStudentClassSchema.parse({
      studentId: requiredStringValue(formData, "studentId"),
      classSectionId: requiredStringValue(formData, "classSectionId"),
      rollNumber: stringValue(formData, "rollNumber"),
      enrolledOn: requiredStringValue(formData, "enrolledOn")
    });
    const ctx = await getTenantContext();
    await assignStudentToClass(ctx, input);
    revalidatePath("/academia/students");
    revalidatePath(`/academia/students/${input.studentId}`);
    revalidatePath("/academia/enrollments");
    revalidatePath("/academia/attendance");
    revalidatePath("/academia/attendance/mark");
    revalidatePath("/dashboard");
    return { ok: true, message: "Student assigned to class." };
  } catch (error) {
    return profileFormError(error, "Unable to assign this student to a class. Please try again.");
  }
}

export async function updateStudentAction(
  _state: ProfileFormActionState,
  formData: FormData
): Promise<ProfileFormActionState> {
  try {
    const input = updateStudentSchema.parse({
      studentId: requiredStringValue(formData, "studentId"),
      branchId: requiredStringValue(formData, "branchId"),
      admissionNumber: requiredStringValue(formData, "admissionNumber"),
      admissionDate: requiredStringValue(formData, "admissionDate"),
      fullName: requiredStringValue(formData, "fullName"),
      firstName: stringValue(formData, "firstName"),
      middleName: stringValue(formData, "middleName"),
      lastName: stringValue(formData, "lastName"),
      displayName: stringValue(formData, "displayName"),
      dateOfBirth: requiredStringValue(formData, "dateOfBirth"),
      gender: stringValue(formData, "gender"),
      bloodGroup: stringValue(formData, "bloodGroup"),
      fatherName: requiredStringValue(formData, "fatherName"),
      fatherOccupation: stringValue(formData, "fatherOccupation"),
      motherName: requiredStringValue(formData, "motherName"),
      guardianName: stringValue(formData, "guardianName"),
      aadhaarNumber: stringValue(formData, "aadhaarNumber"),
      familyIdNumber: stringValue(formData, "familyIdNumber"),
      sssmIdNumber: stringValue(formData, "sssmIdNumber"),
      apaarIdNumber: stringValue(formData, "apaarIdNumber"),
      religion: requiredStringValue(formData, "religion"),
      caste: requiredStringValue(formData, "caste"),
      category: requiredStringValue(formData, "category"),
      nationality: requiredStringValue(formData, "nationality"),
      currentAddress: stringValue(formData, "currentAddress"),
      permanentAddress: stringValue(formData, "permanentAddress"),
      city: requiredStringValue(formData, "city"),
      state: requiredStringValue(formData, "state"),
      pincode: stringValue(formData, "pincode"),
      bankAccountNumber: stringValue(formData, "bankAccountNumber"),
      bankBranchName: stringValue(formData, "bankBranchName"),
      ifscCode: stringValue(formData, "ifscCode"),
      status: stringValue(formData, "status"),
      joinedAt: stringValue(formData, "joinedAt"),
      leftAt: stringValue(formData, "leftAt")
    });
    const ctx = await getTenantContext();
    await updateStudent(ctx, input);
    revalidatePath("/academia");
    revalidatePath("/academia/students");
    revalidatePath(`/academia/students/${input.studentId}`);
    revalidatePath(`/academia/students/${input.studentId}/edit`);
    revalidatePath("/dashboard");
    return { ok: true, message: "Student updated." };
  } catch (error) {
    return profileFormError(error, "Unable to update student. Please try again.");
  }
}

export async function deactivateStudentAction(
  _state: ProfileFormActionState,
  formData: FormData
): Promise<ProfileFormActionState> {
  try {
    const confirmationError = confirmedLifecycleAction(formData, "student");
    if (confirmationError) return confirmationError;
    const studentId = requiredStringValue(formData, "studentId");
    const ctx = await getTenantContext();
    await deactivateStudent(ctx, studentId);
    revalidatePath("/academia");
    revalidatePath("/academia/students");
    revalidatePath(`/academia/students/${studentId}`);
    revalidatePath(`/academia/students/${studentId}/edit`);
    revalidatePath("/academia/attendance");
    revalidatePath("/academia/attendance/mark");
    revalidatePath("/academia/attendance/reports");
    revalidatePath("/dashboard");
    return { ok: true, message: "Student deactivated." };
  } catch (error) {
    return profileFormError(error, "Unable to deactivate student. Please try again.");
  }
}

export async function updateGuardianAction(
  _state: ProfileFormActionState,
  formData: FormData
): Promise<ProfileFormActionState> {
  try {
    const input = updateGuardianSchema.parse({
      guardianId: requiredStringValue(formData, "guardianId"),
      firstName: requiredStringValue(formData, "firstName"),
      middleName: stringValue(formData, "middleName"),
      lastName: stringValue(formData, "lastName"),
      displayName: stringValue(formData, "displayName"),
      phone: stringValue(formData, "phone"),
      email: stringValue(formData, "email"),
      occupation: stringValue(formData, "occupation"),
      addressLine1: stringValue(formData, "addressLine1"),
      addressLine2: stringValue(formData, "addressLine2"),
      city: stringValue(formData, "city"),
      state: stringValue(formData, "state"),
      postalCode: stringValue(formData, "postalCode"),
      country: stringValue(formData, "country")
    });
    const ctx = await getTenantContext();
    await updateGuardian(ctx, input);
    revalidatePath("/academia");
    revalidatePath("/academia/guardians");
    revalidatePath(`/academia/guardians/${input.guardianId}/edit`);
    revalidatePath("/dashboard");
    return { ok: true, message: "Guardian updated." };
  } catch (error) {
    return profileFormError(error, "Unable to update guardian. Please try again.");
  }
}

export async function updateEnrollmentAction(
  _state: ProfileFormActionState,
  formData: FormData
): Promise<ProfileFormActionState> {
  try {
    const input = updateEnrollmentSchema.parse({
      enrollmentId: requiredStringValue(formData, "enrollmentId"),
      rollNumber: stringValue(formData, "rollNumber"),
      status: stringValue(formData, "status"),
      enrolledOn: stringValue(formData, "enrolledOn"),
      leftOn: stringValue(formData, "leftOn")
    });
    const ctx = await getTenantContext();
    await updateEnrollment(ctx, input);
    revalidatePath("/academia");
    revalidatePath("/academia/enrollments");
    revalidatePath(`/academia/enrollments/${input.enrollmentId}/edit`);
    revalidatePath("/academia/attendance");
    revalidatePath("/academia/attendance/mark");
    revalidatePath("/academia/attendance/reports");
    revalidatePath("/dashboard");
    return { ok: true, message: "Enrollment updated." };
  } catch (error) {
    return profileFormError(error, "Unable to update enrollment. Please try again.");
  }
}

export async function cancelEnrollmentAction(
  _state: ProfileFormActionState,
  formData: FormData
): Promise<ProfileFormActionState> {
  try {
    const confirmationError = confirmedLifecycleAction(formData, "enrollment");
    if (confirmationError) return confirmationError;
    const enrollmentId = requiredStringValue(formData, "enrollmentId");
    const ctx = await getTenantContext();
    await cancelEnrollment(ctx, enrollmentId);
    revalidatePath("/academia");
    revalidatePath("/academia/enrollments");
    revalidatePath(`/academia/enrollments/${enrollmentId}/edit`);
    revalidatePath("/academia/attendance");
    revalidatePath("/academia/attendance/mark");
    revalidatePath("/academia/attendance/reports");
    revalidatePath("/dashboard");
    return { ok: true, message: "Enrollment cancelled." };
  } catch (error) {
    return profileFormError(error, "Unable to cancel enrollment. Please try again.");
  }
}
