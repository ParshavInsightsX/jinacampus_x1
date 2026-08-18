import type { PrismaClient } from "@prisma/client";
import { hashPassword } from "../../src/lib/auth/password";
import { normalizePhone } from "../../src/lib/auth/otp";
import { WHATSAPP_TEMPLATE_KEYS } from "../../src/modules/notifications/templates/whatsapp-template-mapper";
import { seedDefaultRolesForTenant } from "./roles.seed";
import {
  DEMO_ACADEMIC_YEAR,
  DEMO_BRANCH,
  DEMO_CLASSES,
  DEMO_CLASS_SECTIONS,
  DEMO_INSTITUTION,
  DEMO_SECTIONS,
  DEMO_STAFF_ATTENDANCE_TODAY,
  DEMO_STAFF_PROFILES,
  DEMO_STUDENTS,
  DEMO_SUBJECTS,
  DEMO_TENANT,
  DEMO_TODAY_STUDENT_ATTENDANCE,
  DEMO_USERS,
  SEED_ADMIN_EMAIL,
  getAssignableDemoPhone,
  getDemoUserMustChangePassword,
  getDemoUserPassword
} from "./demo-data.seed";

type DemoUserKey = (typeof DEMO_USERS)[number]["key"];
type DemoClassSectionKey = (typeof DEMO_CLASS_SECTIONS)[number]["key"];

const INDIA_TIME_ZONE = "Asia/Kolkata";
const INDIA_OFFSET_MINUTES = 330;
const STUDENT_HISTORY_OFFSETS = [-1, -2, -7] as const;
const STAFF_HISTORY_OFFSETS = [-1, -2, -7] as const;

function dateOnly(offsetDays = 0) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: INDIA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());
  const values = new Map(parts.map((part) => [part.type, part.value]));
  return new Date(Date.UTC(
    Number(values.get("year") ?? "2026"),
    Number(values.get("month") ?? "1") - 1,
    Number(values.get("day") ?? "1") + offsetDays
  ));
}

function indiaDateTime(date: Date, time?: string) {
  if (!time) return null;
  const [hour = "0", minute = "0"] = time.split(":");
  return new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    Number(hour),
    Number(minute)
  ) - INDIA_OFFSET_MINUTES * 60 * 1000);
}

function personName(person: { firstName: string; lastName: string }) {
  return `${person.firstName} ${person.lastName}`;
}

function guardianEmail(admissionNumber: string) {
  return `guardian-${admissionNumber.toLowerCase()}@demo.jinacampus.test`;
}

function demoPrincipalId(user: (typeof DEMO_USERS)[number]) {
  if (!user.roleCodes.some((roleCode) => roleCode === "PRINCIPAL")) return undefined;
  return user.key === "admin" ? "DEMO-PRINCIPAL-ADMIN" : "DEMO-PRINCIPAL-001";
}

async function upsertDemoUsers(db: PrismaClient, tenantId: string, branchId: string) {
  const users = new Map<DemoUserKey, { id: string }>();
  const roles = await db.role.findMany({
    where: { tenantId, code: { in: Array.from(new Set(DEMO_USERS.flatMap((user) => user.roleCodes))) } },
    select: { id: true, code: true }
  });
  const roleByCode = new Map(roles.map((role) => [role.code, role]));

  const configuredAdmin = DEMO_USERS.find((user) => user.key === "admin");
  if (configuredAdmin) {
    const existingConfiguredAdmin = await db.user.findUnique({
      where: { tenantId_email: { tenantId, email: configuredAdmin.email } },
      select: { id: true }
    });
    if (!existingConfiguredAdmin) {
      const seededAdminProfile = await db.staffProfile.findUnique({
        where: { tenantId_employeeCode: { tenantId, employeeCode: "JD-ADM-001" } },
        select: { userId: true }
      });
      const legacyAdmin = seededAdminProfile?.userId
        ? { id: seededAdminProfile.userId }
        : await db.user.findUnique({
            where: { tenantId_email: { tenantId, email: "admin@demo.jinacampus.test" } },
            select: { id: true }
          });
      if (legacyAdmin) {
        await db.user.update({
          where: { id: legacyAdmin.id },
          data: { email: SEED_ADMIN_EMAIL }
        });
      }
    }
  }

  for (const demoUser of DEMO_USERS) {
    const normalizedPhone = demoUser.phone ? normalizePhone(demoUser.phone) : null;
    if (demoUser.key === "admin" && demoUser.phone && !normalizedPhone) {
      console.warn("SEED_ADMIN_PHONE is invalid; the demo administrator phone was not stored.");
    }
    const existingTargetUser = await db.user.findUnique({
      where: { tenantId_email: { tenantId, email: demoUser.email } },
      select: { id: true }
    });
    const existingPhoneOwner = normalizedPhone
      ? await db.user.findUnique({
          where: { tenantId_phone: { tenantId, phone: normalizedPhone } },
          select: { id: true }
        })
      : null;
    const assignablePhone = getAssignableDemoPhone(
      normalizedPhone,
      existingTargetUser?.id ?? null,
      existingPhoneOwner?.id ?? null
    );
    if (normalizedPhone && !assignablePhone) {
      console.warn(`Skipped a duplicate phone while seeding the ${demoUser.key} demo account.`);
    }

    const user = await db.user.upsert({
      where: { tenantId_email: { tenantId, email: demoUser.email } },
      create: {
        tenantId,
        principalId: demoPrincipalId(demoUser),
        email: demoUser.email,
        phone: assignablePhone ?? undefined,
        firstName: demoUser.firstName,
        lastName: demoUser.lastName,
        displayName: demoUser.displayName,
        userType: "STAFF",
        status: "ACTIVE",
        activatedAt: new Date()
      },
      update: {
        ...(demoPrincipalId(demoUser) ? { principalId: demoPrincipalId(demoUser) } : {}),
        firstName: demoUser.firstName,
        lastName: demoUser.lastName,
        displayName: demoUser.displayName,
        ...(assignablePhone ? { phone: assignablePhone } : {}),
        status: "ACTIVE",
        activatedAt: new Date()
      },
      select: { id: true }
    });
    users.set(demoUser.key, user);

    await db.passwordCredential.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        passwordHash: await hashPassword(getDemoUserPassword(demoUser.key)),
        mustChange: getDemoUserMustChangePassword(demoUser.key)
      },
      update: {
        passwordHash: await hashPassword(getDemoUserPassword(demoUser.key)),
        passwordUpdatedAt: new Date(),
        mustChange: getDemoUserMustChangePassword(demoUser.key)
      }
    });

    await db.userBranchAccess.upsert({
      where: { tenantId_userId_branchId: { tenantId, userId: user.id, branchId } },
      create: { tenantId, userId: user.id, branchId, isPrimary: true },
      update: { isActive: true, isPrimary: true }
    });

    const desiredRoleIds = demoUser.roleCodes
      .map((roleCode) => roleByCode.get(roleCode)?.id)
      .filter((roleId): roleId is string => Boolean(roleId));

    await db.userRoleAssignment.updateMany({
      where: {
        tenantId,
        userId: user.id,
        scopeType: "TENANT",
        scopeId: "TENANT",
        isActive: true,
        roleId: { notIn: desiredRoleIds }
      },
      data: { isActive: false }
    });

    for (const roleCode of demoUser.roleCodes) {
      const role = roleByCode.get(roleCode);
      if (!role) continue;
      await db.userRoleAssignment.upsert({
        where: {
          tenantId_userId_roleId_scopeType_scopeId: {
            tenantId,
            userId: user.id,
            roleId: role.id,
            scopeType: "TENANT",
            scopeId: "TENANT"
          }
        },
        create: { tenantId, userId: user.id, roleId: role.id, scopeType: "TENANT", scopeId: "TENANT" },
        update: { isActive: true }
      });
    }
  }

  return users;
}

async function upsertDemoAcademia(
  db: PrismaClient,
  tenantId: string,
  branchId: string,
  academicYearId: string,
  users: Map<DemoUserKey, { id: string }>
) {
  const classes = new Map<string, { id: string }>();
  for (const demoClass of DEMO_CLASSES) {
    const academicClass = await db.class.upsert({
      where: { tenantId_code: { tenantId, code: demoClass.code } },
      create: {
        tenantId,
        code: demoClass.code,
        name: demoClass.name,
        sortOrder: demoClass.sortOrder,
        status: "ACTIVE"
      },
      update: { name: demoClass.name, sortOrder: demoClass.sortOrder, status: "ACTIVE" },
      select: { id: true }
    });
    classes.set(demoClass.code, academicClass);
  }

  const sections = new Map<string, { id: string }>();
  for (const demoSection of DEMO_SECTIONS) {
    const section = await db.section.upsert({
      where: { tenantId_code: { tenantId, code: demoSection.code } },
      create: {
        tenantId,
        code: demoSection.code,
        name: demoSection.name,
        sortOrder: demoSection.sortOrder,
        status: "ACTIVE"
      },
      update: { name: demoSection.name, sortOrder: demoSection.sortOrder, status: "ACTIVE" },
      select: { id: true }
    });
    sections.set(demoSection.code, section);
  }

  const classSections = new Map<DemoClassSectionKey, { id: string; displayName: string }>();
  for (const demoClassSection of DEMO_CLASS_SECTIONS) {
    const academicClass = classes.get(demoClassSection.classCode);
    const section = sections.get(demoClassSection.sectionCode);
    if (!academicClass || !section) continue;
    const classTeacherUserKey = "classTeacherUserKey" in demoClassSection ? demoClassSection.classTeacherUserKey : undefined;
    const classTeacherUserId = classTeacherUserKey
      ? users.get(classTeacherUserKey)?.id
      : undefined;
    const classSection = await db.classSection.upsert({
      where: {
        tenantId_branchId_academicYearId_classId_sectionId: {
          tenantId,
          branchId,
          academicYearId,
          classId: academicClass.id,
          sectionId: section.id
        }
      },
      create: {
        tenantId,
        branchId,
        academicYearId,
        classId: academicClass.id,
        sectionId: section.id,
        classTeacherUserId,
        displayName: demoClassSection.displayName,
        capacity: demoClassSection.capacity,
        status: "ACTIVE"
      },
      update: {
        classTeacherUserId,
        displayName: demoClassSection.displayName,
        capacity: demoClassSection.capacity,
        status: "ACTIVE"
      },
      select: { id: true, displayName: true }
    });
    classSections.set(demoClassSection.key, classSection);
  }

  for (const subject of DEMO_SUBJECTS) {
    await db.subject.upsert({
      where: { tenantId_code: { tenantId, code: subject.code } },
      create: {
        tenantId,
        code: subject.code,
        name: subject.name,
        type: subject.type,
        status: "ACTIVE"
      },
      update: { name: subject.name, type: subject.type, status: "ACTIVE" }
    });
  }

  const students = new Map<string, { id: string; enrollmentId: string; classSectionId: string }>();
  for (const [index, demoStudent] of DEMO_STUDENTS.entries()) {
    const classSection = classSections.get(demoStudent.classSectionKey);
    if (!classSection) continue;
    const studentDisplayName = personName(demoStudent);
    const aadhaarLast4 = String(1000 + index).padStart(4, "0");
    const bankLast4 = String(7000 + index).padStart(4, "0");
    const fatherName =
      demoStudent.guardianRelation === "FATHER"
        ? `${demoStudent.guardianFirstName} ${demoStudent.guardianLastName}`
        : `Demo Father ${index + 1}`;
    const motherName =
      demoStudent.guardianRelation === "MOTHER"
        ? `${demoStudent.guardianFirstName} ${demoStudent.guardianLastName}`
        : `Demo Mother ${index + 1}`;
    const student = await db.student.upsert({
      where: { tenantId_admissionNumber: { tenantId, admissionNumber: demoStudent.admissionNumber } },
      create: {
        tenantId,
        branchId,
        admissionNumber: demoStudent.admissionNumber,
        admissionDate: new Date(DEMO_ACADEMIC_YEAR.startDate),
        fullName: studentDisplayName,
        firstName: demoStudent.firstName,
        lastName: demoStudent.lastName,
        displayName: studentDisplayName,
        dateOfBirth: new Date(`2018-01-${String((index % 27) + 1).padStart(2, "0")}`),
        gender: demoStudent.gender,
        fatherName,
        fatherOccupation: "Demo Occupation",
        motherName,
        aadhaarMasked: `XXXX-XXXX-${aadhaarLast4}`,
        aadhaarLast4,
        familyIdNumber: `FAM-DEMO-${String(index + 1).padStart(3, "0")}`,
        sssmIdNumber: `SSSM-DEMO-${String(index + 1).padStart(3, "0")}`,
        apaarIdNumber: `APAAR-DEMO-${String(index + 1).padStart(3, "0")}`,
        religion: "Hindu",
        caste: "Demo Caste",
        category: index % 4 === 0 ? "General" : index % 4 === 1 ? "OBC" : index % 4 === 2 ? "SC" : "ST",
        nationality: "India",
        currentAddress: `${DEMO_BRANCH.name}, ${DEMO_BRANCH.city}`,
        permanentAddress: `${DEMO_BRANCH.name}, ${DEMO_BRANCH.city}`,
        city: DEMO_BRANCH.city,
        state: DEMO_BRANCH.state,
        pincode: "380015",
        bankAccountMasked: `XXXXXX${bankLast4}`,
        bankAccountLast4: bankLast4,
        bankBranchName: "Demo Bank Main Branch",
        ifscCode: "DEMO0001234",
        status: "ACTIVE",
        joinedAt: new Date(DEMO_ACADEMIC_YEAR.startDate)
      },
      update: {
        branchId,
        admissionDate: new Date(DEMO_ACADEMIC_YEAR.startDate),
        fullName: studentDisplayName,
        firstName: demoStudent.firstName,
        lastName: demoStudent.lastName,
        displayName: studentDisplayName,
        dateOfBirth: new Date(`2018-01-${String((index % 27) + 1).padStart(2, "0")}`),
        gender: demoStudent.gender,
        fatherName,
        fatherOccupation: "Demo Occupation",
        motherName,
        aadhaarMasked: `XXXX-XXXX-${aadhaarLast4}`,
        aadhaarLast4,
        familyIdNumber: `FAM-DEMO-${String(index + 1).padStart(3, "0")}`,
        sssmIdNumber: `SSSM-DEMO-${String(index + 1).padStart(3, "0")}`,
        apaarIdNumber: `APAAR-DEMO-${String(index + 1).padStart(3, "0")}`,
        religion: "Hindu",
        caste: "Demo Caste",
        category: index % 4 === 0 ? "General" : index % 4 === 1 ? "OBC" : index % 4 === 2 ? "SC" : "ST",
        nationality: "India",
        currentAddress: `${DEMO_BRANCH.name}, ${DEMO_BRANCH.city}`,
        permanentAddress: `${DEMO_BRANCH.name}, ${DEMO_BRANCH.city}`,
        city: DEMO_BRANCH.city,
        state: DEMO_BRANCH.state,
        pincode: "380015",
        bankAccountMasked: `XXXXXX${bankLast4}`,
        bankAccountLast4: bankLast4,
        bankBranchName: "Demo Bank Main Branch",
        ifscCode: "DEMO0001234",
        status: "ACTIVE",
        leftAt: null
      },
      select: { id: true }
    });

    const guardian = await db.guardian.upsert({
      where: { tenantId_email: { tenantId, email: guardianEmail(demoStudent.admissionNumber) } },
      create: {
        tenantId,
        firstName: demoStudent.guardianFirstName,
        lastName: demoStudent.guardianLastName,
        displayName: `${demoStudent.guardianFirstName} ${demoStudent.guardianLastName}`,
        email: guardianEmail(demoStudent.admissionNumber),
        occupation: "Demo Guardian",
        city: DEMO_BRANCH.city,
        state: DEMO_BRANCH.state
      },
      update: {
        firstName: demoStudent.guardianFirstName,
        lastName: demoStudent.guardianLastName,
        displayName: `${demoStudent.guardianFirstName} ${demoStudent.guardianLastName}`,
        occupation: "Demo Guardian",
        city: DEMO_BRANCH.city,
        state: DEMO_BRANCH.state
      },
      select: { id: true }
    });

    await db.studentGuardianLink.upsert({
      where: {
        tenantId_studentId_guardianId_relation: {
          tenantId,
          studentId: student.id,
          guardianId: guardian.id,
          relation: demoStudent.guardianRelation
        }
      },
      create: {
        tenantId,
        studentId: student.id,
        guardianId: guardian.id,
        relation: demoStudent.guardianRelation,
        isPrimary: true,
        isEmergencyContact: true,
        hasPickupPermission: true
      },
      update: { isPrimary: true, isEmergencyContact: true, hasPickupPermission: true }
    });

    const enrollment = await db.enrollment.upsert({
      where: { tenantId_academicYearId_studentId: { tenantId, academicYearId, studentId: student.id } },
      create: {
        tenantId,
        branchId,
        academicYearId,
        studentId: student.id,
        classSectionId: classSection.id,
        rollNumber: demoStudent.rollNumber,
        status: "ACTIVE",
        enrolledOn: new Date(DEMO_ACADEMIC_YEAR.startDate)
      },
      update: {
        branchId,
        classSectionId: classSection.id,
        rollNumber: demoStudent.rollNumber,
        status: "ACTIVE",
        leftOn: null
      },
      select: { id: true }
    });

    students.set(demoStudent.admissionNumber, {
      id: student.id,
      enrollmentId: enrollment.id,
      classSectionId: classSection.id
    });
  }

  return { classSections, students };
}

async function upsertDemoStudentAttendance(
  db: PrismaClient,
  tenantId: string,
  branchId: string,
  academicYearId: string,
  students: Map<string, { id: string; enrollmentId: string; classSectionId: string }>,
  users: Map<DemoUserKey, { id: string }>
) {
  const today = dateOnly();
  const markerByClassSection = new Map<DemoClassSectionKey, string | undefined>([
    ["class-1-a", users.get("teacher")?.id],
    ["class-2-a", users.get("admin")?.id],
    ["class-3-a", users.get("admin")?.id]
  ]);

  for (const group of DEMO_TODAY_STUDENT_ATTENDANCE) {
    const groupStudents = DEMO_STUDENTS.filter((student) => student.classSectionKey === group.classSectionKey);
    for (const [index, status] of group.statuses.entries()) {
      const demoStudent = groupStudents[index];
      const student = demoStudent ? students.get(demoStudent.admissionNumber) : null;
      if (!demoStudent || !student) continue;
      const correctionReason = status === "ABSENT" && group.classSectionKey === "class-1-a"
        ? "Demo absence verified by office."
        : null;
      await db.studentAttendanceRecord.upsert({
        where: {
          tenantId_academicYearId_studentId_attendanceDate_sessionType: {
            tenantId,
            academicYearId,
            studentId: student.id,
            attendanceDate: today,
            sessionType: "FULL_DAY"
          }
        },
        create: {
          tenantId,
          branchId,
          academicYearId,
          classSectionId: student.classSectionId,
          enrollmentId: student.enrollmentId,
          studentId: student.id,
          attendanceDate: today,
          sessionType: "FULL_DAY",
          status,
          remarks: status === "LATE" ? "Demo late arrival." : null,
          correctionReason,
          markedById: markerByClassSection.get(group.classSectionKey),
          correctedById: correctionReason ? users.get("admin")?.id : null,
          markedAt: new Date(),
          correctedAt: correctionReason ? new Date() : null
        },
        update: {
          classSectionId: student.classSectionId,
          enrollmentId: student.enrollmentId,
          branchId,
          status,
          remarks: status === "LATE" ? "Demo late arrival." : null,
          correctionReason,
          markedById: markerByClassSection.get(group.classSectionKey),
          correctedById: correctionReason ? users.get("admin")?.id : null,
          markedAt: new Date(),
          correctedAt: correctionReason ? new Date() : null
        }
      });
    }
  }

  for (const offset of STUDENT_HISTORY_OFFSETS) {
    const attendanceDate = dateOnly(offset);
    for (const demoStudent of DEMO_STUDENTS.filter((student) => student.classSectionKey !== "class-3-a")) {
      const student = students.get(demoStudent.admissionNumber);
      if (!student) continue;
      const roll = Number(demoStudent.rollNumber);
      const status = roll % 6 === 0 ? "HALF_DAY" : roll % 5 === 0 ? "LATE" : roll % 4 === 0 ? "ABSENT" : "PRESENT";
      await db.studentAttendanceRecord.upsert({
        where: {
          tenantId_academicYearId_studentId_attendanceDate_sessionType: {
            tenantId,
            academicYearId,
            studentId: student.id,
            attendanceDate,
            sessionType: "FULL_DAY"
          }
        },
        create: {
          tenantId,
          branchId,
          academicYearId,
          classSectionId: student.classSectionId,
          enrollmentId: student.enrollmentId,
          studentId: student.id,
          attendanceDate,
          sessionType: "FULL_DAY",
          status,
          markedById: users.get("admin")?.id,
          markedAt: new Date()
        },
        update: {
          classSectionId: student.classSectionId,
          enrollmentId: student.enrollmentId,
          branchId,
          status,
          markedById: users.get("admin")?.id,
          markedAt: new Date()
        }
      });
    }
  }
}

async function upsertDemoStaffBoard(
  db: PrismaClient,
  tenantId: string,
  branchId: string,
  users: Map<DemoUserKey, { id: string }>
) {
  const staffProfiles = new Map<string, { id: string }>();
  for (const demoStaff of DEMO_STAFF_PROFILES) {
    const staff = await db.staffProfile.upsert({
      where: { tenantId_employeeCode: { tenantId, employeeCode: demoStaff.employeeCode } },
      create: {
        tenantId,
        branchId,
        userId: "userKey" in demoStaff ? users.get(demoStaff.userKey)?.id : null,
        employeeCode: demoStaff.employeeCode,
        firstName: demoStaff.firstName,
        lastName: demoStaff.lastName,
        staffType: demoStaff.staffType,
        designation: demoStaff.designation,
        department: demoStaff.department,
        email: `${demoStaff.employeeCode.toLowerCase()}@demo.jinacampus.test`,
        joiningDate: new Date(DEMO_ACADEMIC_YEAR.startDate),
        employmentStatus: "ACTIVE"
      },
      update: {
        branchId,
        userId: "userKey" in demoStaff ? users.get(demoStaff.userKey)?.id : null,
        firstName: demoStaff.firstName,
        lastName: demoStaff.lastName,
        staffType: demoStaff.staffType,
        designation: demoStaff.designation,
        department: demoStaff.department,
        email: `${demoStaff.employeeCode.toLowerCase()}@demo.jinacampus.test`,
        employmentStatus: "ACTIVE"
      },
      select: { id: true }
    });
    staffProfiles.set(demoStaff.employeeCode, staff);
  }

  return staffProfiles;
}

async function upsertDemoStaffAttendance(
  db: PrismaClient,
  tenantId: string,
  branchId: string,
  academicYearId: string,
  staffProfiles: Map<string, { id: string }>,
  users: Map<DemoUserKey, { id: string }>
) {
  const today = dateOnly();
  const adminUserId = users.get("admin")?.id;
  const officeUserId = users.get("office")?.id;

  for (const record of DEMO_STAFF_ATTENDANCE_TODAY) {
    const staff = staffProfiles.get(record.employeeCode);
    if (!staff) continue;
    const checkIn = "checkIn" in record ? record.checkIn : undefined;
    const checkOut = "checkOut" in record ? record.checkOut : undefined;
    const workingMinutes = "workingMinutes" in record ? record.workingMinutes : undefined;
    const correctionReason = "correctionReason" in record ? record.correctionReason : undefined;
    await db.staffAttendanceRecord.upsert({
      where: { tenantId_branchId_staffId_attendanceDate: { tenantId, branchId, staffId: staff.id, attendanceDate: today } },
      create: {
        tenantId,
        branchId,
        academicYearId,
        staffId: staff.id,
        attendanceDate: today,
        status: record.status,
        checkInAt: indiaDateTime(today, checkIn),
        checkOutAt: indiaDateTime(today, checkOut),
        workingMinutes: workingMinutes ?? null,
        checkInSource: checkIn ? record.source : null,
        checkOutSource: checkOut ? record.source : null,
        markedById: adminUserId,
        updatedById: correctionReason ? officeUserId : adminUserId,
        correctionReason: correctionReason ?? null
      },
      update: {
        academicYearId,
        status: record.status,
        checkInAt: indiaDateTime(today, checkIn),
        checkOutAt: indiaDateTime(today, checkOut),
        workingMinutes: workingMinutes ?? null,
        checkInSource: checkIn ? record.source : null,
        checkOutSource: checkOut ? record.source : null,
        markedById: adminUserId,
        updatedById: correctionReason ? officeUserId : adminUserId,
        correctionReason: correctionReason ?? null
      }
    });
  }

  for (const offset of STAFF_HISTORY_OFFSETS) {
    const attendanceDate = dateOnly(offset);
    for (const demoStaff of DEMO_STAFF_PROFILES.slice(0, 8)) {
      const staff = staffProfiles.get(demoStaff.employeeCode);
      if (!staff) continue;
      const status = demoStaff.staffType === "TEACHER" && offset === -2
        ? "LATE"
        : demoStaff.staffType === "HELPER" && offset === -7
          ? "HALF_DAY"
          : "PRESENT";
      const checkIn = status === "LATE" ? "08:20" : "07:50";
      const checkOut = status === "HALF_DAY" ? "11:45" : "15:50";
      const workingMinutes = status === "HALF_DAY" ? 235 : status === "LATE" ? 450 : 480;
      await db.staffAttendanceRecord.upsert({
        where: { tenantId_branchId_staffId_attendanceDate: { tenantId, branchId, staffId: staff.id, attendanceDate } },
        create: {
          tenantId,
          branchId,
          academicYearId,
          staffId: staff.id,
          attendanceDate,
          status,
          checkInAt: indiaDateTime(attendanceDate, checkIn),
          checkOutAt: indiaDateTime(attendanceDate, checkOut),
          workingMinutes,
          checkInSource: "QR_SCAN",
          checkOutSource: "QR_SCAN",
          markedById: adminUserId,
          updatedById: adminUserId
        },
        update: {
          academicYearId,
          status,
          checkInAt: indiaDateTime(attendanceDate, checkIn),
          checkOutAt: indiaDateTime(attendanceDate, checkOut),
          workingMinutes,
          checkInSource: "QR_SCAN",
          checkOutSource: "QR_SCAN",
          markedById: adminUserId,
          updatedById: adminUserId
        }
      });
    }
  }
}

async function upsertDemoStaffLeaveFoundation(
  db: PrismaClient,
  tenantId: string,
  branchId: string,
  staffProfiles: Map<string, { id: string }>
) {
  await db.staffLeaveSetting.upsert({
    where: { branchId },
    create: {
      tenantId,
      branchId,
      allowHalfDay: true,
      allowBackdatedApplications: false,
      minimumNoticeDays: 0,
      maximumConsecutiveDays: 30,
      nonWorkingWeekdays: [0],
      approvalMode: "PRINCIPAL_OR_DESIGNATED",
      whatsappNotificationsEnabled: false
    },
    update: {
      allowHalfDay: true,
      allowBackdatedApplications: false,
      minimumNoticeDays: 0,
      maximumConsecutiveDays: 30,
      nonWorkingWeekdays: [0],
      approvalMode: "PRINCIPAL_OR_DESIGNATED",
      whatsappNotificationsEnabled: false
    }
  });

  const leaveTypes = [
    { code: "CASUAL", name: "Casual Leave", isPaid: true, balanceTracked: true, annualLimit: 12, allowHalfDay: true, supportingDocumentRequired: false },
    { code: "SICK", name: "Sick Leave", isPaid: true, balanceTracked: true, annualLimit: 12, allowHalfDay: true, supportingDocumentRequired: false, documentRequiredAfterDays: 2 },
    { code: "UNPAID", name: "Unpaid Leave", isPaid: false, balanceTracked: false, annualLimit: 0, allowHalfDay: true, supportingDocumentRequired: false }
  ] as const;
  const year = new Date().getUTCFullYear();
  for (const type of leaveTypes) {
    const leaveType = await db.staffLeaveType.upsert({
      where: { tenantId_branchId_code: { tenantId, branchId, code: type.code } },
      create: { tenantId, branchId, ...type, carryForwardLimit: 0, isActive: true },
      update: { ...type, carryForwardLimit: 0, isActive: true }
    });
    if (!leaveType.balanceTracked) continue;
    for (const staff of staffProfiles.values()) {
      await db.staffLeaveBalance.upsert({
        where: {
          tenantId_branchId_staffId_leaveTypeId_year: {
            tenantId,
            branchId,
            staffId: staff.id,
            leaveTypeId: leaveType.id,
            year
          }
        },
        create: { tenantId, branchId, staffId: staff.id, leaveTypeId: leaveType.id, year, allocatedDays: leaveType.annualLimit },
        update: { allocatedDays: leaveType.annualLimit }
      });
    }
  }
}

async function upsertDemoNotificationFoundation(db: PrismaClient, tenantId: string, branchId: string) {
  const templates = [
    {
      templateKey: WHATSAPP_TEMPLATE_KEYS.STUDENT_DAILY_ATTENDANCE_ALERT,
      providerTemplateName: "student_daily_attendance_alert",
      languageCode: "en"
    },
    {
      templateKey: WHATSAPP_TEMPLATE_KEYS.STAFF_WEEKLY_ATTENDANCE_SUMMARY,
      providerTemplateName: "staff_weekly_attendance_summary",
      languageCode: "en"
    },
    {
      templateKey: WHATSAPP_TEMPLATE_KEYS.STAFF_MONTHLY_ATTENDANCE_SUMMARY,
      providerTemplateName: "staff_monthly_attendance_summary",
      languageCode: "en"
    },
    {
      templateKey: WHATSAPP_TEMPLATE_KEYS.STAFF_LEAVE_STATUS_UPDATE,
      providerTemplateName: "staff_leave_status_update",
      languageCode: "en"
    }
  ];

  for (const template of templates) {
    const existingTemplate = await db.notificationTemplate.findFirst({
      where: {
        tenantId,
        branchId: null,
        channel: "WHATSAPP",
        templateKey: template.templateKey,
        languageCode: template.languageCode
      },
      select: { id: true }
    });
    if (existingTemplate) {
      await db.notificationTemplate.update({
        where: { id: existingTemplate.id },
        data: {
          providerTemplateName: template.providerTemplateName,
          category: "UTILITY",
          isActive: true
        }
      });
    } else {
      await db.notificationTemplate.create({
        data: {
          tenantId,
          branchId: null,
          channel: "WHATSAPP",
          templateKey: template.templateKey,
          providerTemplateName: template.providerTemplateName,
          languageCode: template.languageCode,
          category: "UTILITY",
          isActive: true
        }
      });
    }
  }

  const existingSetting = await db.whatsAppIntegrationSetting.findFirst({
    where: { tenantId, branchId: null, provider: "DRY_RUN" },
    select: { id: true }
  });
  if (existingSetting) {
    await db.whatsAppIntegrationSetting.update({
      where: { id: existingSetting.id },
      data: { isEnabled: false }
    });
  } else {
    await db.whatsAppIntegrationSetting.create({
      data: {
        tenantId,
        branchId: null,
        provider: "DRY_RUN",
        isEnabled: false
      }
    });
  }

  const guardians = await db.guardian.findMany({
    where: { tenantId },
    select: { id: true }
  });
  for (const guardian of guardians) {
    await db.communicationPreference.upsert({
      where: { tenantId_ownerType_ownerId: { tenantId, ownerType: "GUARDIAN", ownerId: guardian.id } },
      create: {
        tenantId,
        branchId,
        ownerType: "GUARDIAN",
        ownerId: guardian.id,
        whatsappEnabled: false,
        attendanceAlertsEnabled: false,
        weeklySummaryEnabled: false,
        monthlySummaryEnabled: false,
        leaveUpdatesEnabled: false,
        consentSource: "demo-disabled-default"
      },
      update: {
        branchId,
        whatsappEnabled: false,
        attendanceAlertsEnabled: false,
        weeklySummaryEnabled: false,
        monthlySummaryEnabled: false,
        leaveUpdatesEnabled: false,
        consentSource: "demo-disabled-default"
      }
    });
  }

  const staffProfiles = await db.staffProfile.findMany({
    where: { tenantId },
    select: { id: true }
  });
  for (const staff of staffProfiles) {
    await db.communicationPreference.upsert({
      where: { tenantId_ownerType_ownerId: { tenantId, ownerType: "STAFF", ownerId: staff.id } },
      create: {
        tenantId,
        branchId,
        ownerType: "STAFF",
        ownerId: staff.id,
        whatsappEnabled: false,
        attendanceAlertsEnabled: false,
        weeklySummaryEnabled: false,
        monthlySummaryEnabled: false,
        leaveUpdatesEnabled: false,
        consentSource: "demo-disabled-default"
      },
      update: {
        branchId,
        whatsappEnabled: false,
        attendanceAlertsEnabled: false,
        weeklySummaryEnabled: false,
        monthlySummaryEnabled: false,
        leaveUpdatesEnabled: false,
        consentSource: "demo-disabled-default"
      }
    });
  }
}

export async function seedDemoTenant(db: PrismaClient) {
  const tenant = await db.tenant.upsert({
    where: { slug: DEMO_TENANT.slug },
    create: {
      name: DEMO_TENANT.name,
      slug: DEMO_TENANT.slug,
      legalName: DEMO_TENANT.legalName,
      status: "ACTIVE"
    },
    update: {
      name: DEMO_TENANT.name,
      legalName: DEMO_TENANT.legalName,
      status: "ACTIVE"
    }
  });

  await db.tenantSettings.upsert({
    where: { tenantId: tenant.id },
    create: { tenantId: tenant.id, brandName: "JinaCampus", timezone: INDIA_TIME_ZONE, locale: "en-IN" },
    update: { brandName: "JinaCampus", timezone: INDIA_TIME_ZONE, locale: "en-IN" }
  });

  const institution = await db.institution.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: DEMO_INSTITUTION.code } },
    create: {
      tenantId: tenant.id,
      name: DEMO_INSTITUTION.name,
      displayName: DEMO_INSTITUTION.displayName,
      code: DEMO_INSTITUTION.code,
      city: DEMO_INSTITUTION.city,
      state: DEMO_INSTITUTION.state,
      status: "ACTIVE"
    },
    update: {
      name: DEMO_INSTITUTION.name,
      displayName: DEMO_INSTITUTION.displayName,
      city: DEMO_INSTITUTION.city,
      state: DEMO_INSTITUTION.state,
      status: "ACTIVE"
    }
  });

  const branch = await db.branch.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: DEMO_BRANCH.code } },
    create: {
      tenantId: tenant.id,
      institutionId: institution.id,
      name: DEMO_BRANCH.name,
      code: DEMO_BRANCH.code,
      city: DEMO_BRANCH.city,
      state: DEMO_BRANCH.state,
      status: "ACTIVE"
    },
    update: {
      institutionId: institution.id,
      name: DEMO_BRANCH.name,
      city: DEMO_BRANCH.city,
      state: DEMO_BRANCH.state,
      status: "ACTIVE"
    }
  });

  await db.attendanceSetting.upsert({
    where: { branchId: branch.id },
    create: {
      tenantId: tenant.id,
      branchId: branch.id,
      staffQrAttendanceEnabled: true,
      staffCheckInStartTime: "07:30",
      staffLateAfterTime: "08:00",
      staffHalfDayBeforeMinutes: 240,
      staffMinimumWorkingMinutes: 360,
      staffQrTokenValiditySeconds: 18000
    },
    update: {
      staffQrAttendanceEnabled: true,
      staffCheckInStartTime: "07:30",
      staffLateAfterTime: "08:00",
      staffHalfDayBeforeMinutes: 240,
      staffMinimumWorkingMinutes: 360,
      staffQrTokenValiditySeconds: 18000
    }
  });

  const academicYear = await db.academicYear.upsert({
    where: {
      tenantId_institutionId_name: {
        tenantId: tenant.id,
        institutionId: institution.id,
        name: DEMO_ACADEMIC_YEAR.name
      }
    },
    create: {
      tenantId: tenant.id,
      institutionId: institution.id,
      name: DEMO_ACADEMIC_YEAR.name,
      startDate: new Date(DEMO_ACADEMIC_YEAR.startDate),
      endDate: new Date(DEMO_ACADEMIC_YEAR.endDate),
      status: "ACTIVE",
      isActive: true
    },
    update: {
      startDate: new Date(DEMO_ACADEMIC_YEAR.startDate),
      endDate: new Date(DEMO_ACADEMIC_YEAR.endDate),
      status: "ACTIVE",
      isActive: true
    }
  });

  await seedDefaultRolesForTenant(db, tenant.id);
  const users = await upsertDemoUsers(db, tenant.id, branch.id);
  const { students } = await upsertDemoAcademia(db, tenant.id, branch.id, academicYear.id, users);
  await upsertDemoStudentAttendance(db, tenant.id, branch.id, academicYear.id, students, users);
  const staffProfiles = await upsertDemoStaffBoard(db, tenant.id, branch.id, users);
  await upsertDemoStaffAttendance(db, tenant.id, branch.id, academicYear.id, staffProfiles, users);
  await upsertDemoStaffLeaveFoundation(db, tenant.id, branch.id, staffProfiles);
  await upsertDemoNotificationFoundation(db, tenant.id, branch.id);
}
