type StudentImportColumnDefinition = {
  key: string;
  label: string;
  required: boolean;
  aliases: readonly string[];
};

export const STUDENT_IMPORT_COLUMNS = [
  {
    key: "admissionNumber",
    label: "Scholar Number",
    required: true,
    aliases: ["Scholar No", "Scholar No.", "Scholar Number", "Admission No", "Admission Number"]
  },
  {
    key: "fullName",
    label: "Student Name",
    required: true,
    aliases: ["Student Name", "Name of Student", "Full Name", "Name"]
  },
  {
    key: "dateOfBirth",
    label: "Date of Birth",
    required: true,
    aliases: ["DOB", "D.O.B.", "Date of Birth", "Birth Date"]
  },
  {
    key: "classSection",
    label: "Current Class",
    required: true,
    aliases: ["Class", "Current Class", "Class Name", "Grade", "Standard", "Class Section"]
  },
  {
    key: "guardianPhone",
    label: "Contact Number",
    required: true,
    aliases: ["Contact", "Contact Number", "Mobile", "Mobile Number", "Phone Number", "Guardian Mobile", "Parent Mobile", "WhatsApp Number"]
  },
  {
    key: "fatherName",
    label: "Father's Name",
    required: true,
    aliases: ["Father Name", "Father's Name", "Name of Father"]
  },
  {
    key: "motherName",
    label: "Mother's Name",
    required: true,
    aliases: ["Mother Name", "Mother's Name", "Name of Mother"]
  },
  { key: "section", label: "Section", required: false, aliases: ["Current Section", "Division"] },
  { key: "admissionDate", label: "Admission Date", required: false, aliases: ["Date of Admission", "Joining Date"] },
  { key: "displayName", label: "Display Name", required: false, aliases: ["Preferred Name"] },
  { key: "gender", label: "Gender", required: false, aliases: ["Sex"] },
  { key: "bloodGroup", label: "Blood Group", required: false, aliases: ["Blood Type"] },
  { key: "fatherOccupation", label: "Father Occupation", required: false, aliases: ["Father's Occupation"] },
  { key: "guardianName", label: "Other Guardian Name", required: false, aliases: ["Guardian Name"] },
  { key: "guardianRelation", label: "Primary Guardian Relation", required: false, aliases: ["Guardian Relation", "Relation"] },
  { key: "guardianEmail", label: "Guardian Email", required: false, aliases: ["Parent Email", "Email"] },
  { key: "aadhaarNumber", label: "Aadhaar Number", required: false, aliases: ["Aadhaar", "Aadhar", "Aadhar Number"] },
  { key: "familyIdNumber", label: "Family ID", required: false, aliases: ["Family ID Number"] },
  { key: "sssmIdNumber", label: "SSSM ID", required: false, aliases: ["SSSM"] },
  { key: "apaarIdNumber", label: "APAAR ID", required: false, aliases: ["APAAR"] },
  { key: "religion", label: "Religion", required: false, aliases: [] },
  { key: "caste", label: "Caste", required: false, aliases: [] },
  { key: "category", label: "Category", required: false, aliases: ["Student Category"] },
  { key: "nationality", label: "Nationality", required: false, aliases: [] },
  { key: "currentAddress", label: "Current Address", required: false, aliases: ["Present Address"] },
  { key: "permanentAddress", label: "Permanent Address", required: false, aliases: [] },
  { key: "city", label: "City", required: false, aliases: ["Town"] },
  { key: "state", label: "State / UT", required: false, aliases: ["State", "Union Territory"] },
  { key: "pincode", label: "Pincode", required: false, aliases: ["PIN Code", "Postal Code"] },
  { key: "bankAccountNumber", label: "Bank Account Number", required: false, aliases: ["Account Number"] },
  { key: "bankBranchName", label: "Bank Branch", required: false, aliases: ["Bank Branch Name"] },
  { key: "ifscCode", label: "IFSC", required: false, aliases: ["IFSC Code"] },
  { key: "rollNumber", label: "Roll Number", required: false, aliases: ["Roll No", "Roll No."] },
  { key: "enrollmentDate", label: "Enrollment Date", required: false, aliases: ["Class Joining Date"] }
] as const satisfies readonly StudentImportColumnDefinition[];

export type StudentImportColumnKey = (typeof STUDENT_IMPORT_COLUMNS)[number]["key"];

export const MINIMUM_STUDENT_IMPORT_COLUMNS = STUDENT_IMPORT_COLUMNS.filter(
  (column) => column.required
);

export const REQUIRED_STUDENT_IMPORT_COLUMNS = MINIMUM_STUDENT_IMPORT_COLUMNS.map(
  (column) => column.key
);

export const MAX_STUDENT_IMPORT_ROWS = 5_000;
export const MAX_STUDENT_IMPORT_FILE_BYTES = 4_000_000;
