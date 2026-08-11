export type StudentProfileStatus = "COMPLETE" | "INCOMPLETE";

type StudentProfileCompletenessSource = {
  admissionDate?: Date | null;
  fullName?: string | null;
  dateOfBirth?: Date | null;
  fatherName?: string | null;
  motherName?: string | null;
  aadhaarMasked?: string | null;
  aadhaarNumber?: string | null;
  religion?: string | null;
  caste?: string | null;
  category?: string | null;
  nationality?: string | null;
  city?: string | null;
  state?: string | null;
};

function hasText(value: string | null | undefined) {
  return Boolean(value?.trim());
}

export function missingStudentProfileFields(student: StudentProfileCompletenessSource) {
  return [
    ["Admission date", Boolean(student.admissionDate)],
    ["Student name", hasText(student.fullName)],
    ["Date of birth", Boolean(student.dateOfBirth)],
    ["Father's name", hasText(student.fatherName)],
    ["Mother's name", hasText(student.motherName)],
    ["Aadhaar reference", hasText(student.aadhaarMasked) || hasText(student.aadhaarNumber)],
    ["Religion", hasText(student.religion)],
    ["Caste", hasText(student.caste)],
    ["Category", hasText(student.category)],
    ["Nationality", hasText(student.nationality)],
    ["City", hasText(student.city)],
    ["State / UT", hasText(student.state)]
  ].flatMap(([label, present]) => present ? [] : [String(label)]);
}

export function getStudentProfileStatus(
  student: StudentProfileCompletenessSource
): StudentProfileStatus {
  return missingStudentProfileFields(student).length ? "INCOMPLETE" : "COMPLETE";
}
