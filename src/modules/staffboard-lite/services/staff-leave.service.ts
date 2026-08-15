import { Prisma, type StaffLeaveApplicationStatus, type StaffType } from "@prisma/client";
import { writeAuditLog } from "@/lib/audit/audit-log";
import { db } from "@/lib/db";
import { AppError, forbidden, getSafeErrorCode, notFound } from "@/lib/errors";
import { requirePermission } from "@/lib/rbac/require-permission";
import { hasPrincipalRole } from "@/lib/rbac/roles";
import type { TenantContext } from "@/lib/tenant/context";
import { listCalendarDateKeysForRange } from "@/modules/campus-core/calendar/calendar-policy";
import { staffCalendarAudience } from "@/modules/campus-core/calendar/calendar-utils";
import { queueNotificationOutboxItem } from "@/modules/notifications/services/notification-outbox.service";
import {
  buildStaffLeaveStatusTemplatePayload,
  WHATSAPP_TEMPLATE_KEYS
} from "@/modules/notifications/templates/whatsapp-template-mapper";
import { STAFFBOARD_LITE_AUDIT_EVENTS } from "@/modules/staffboard-lite/audit-events";
import {
  adjustStaffLeaveBalanceSchema,
  cancelStaffLeaveSchema,
  createStaffLeaveApplicationSchema,
  setStaffLeaveApproverSchema,
  staffLeaveReviewSchema,
  staffLeaveSettingSchema,
  updateStaffLeaveApplicationSchema,
  upsertStaffLeaveTypeSchema,
  withdrawStaffLeaveSchema
} from "@/modules/staffboard-lite/schemas";
import {
  calculateStaffLeaveDays,
  calendarDaySpan,
  enumerateLeaveDates,
  formatLeaveDate,
  todayForTimeZone
} from "@/modules/staffboard-lite/utils/staff-leave-calculator";
import { enqueueStaffLeaveSchoolCastEvent } from "./staff-leave-schoolcast-event";
import { requireBranchPermission, validationError } from "./shared";

type DbClient = typeof db | Prisma.TransactionClient;

const ACTIVE_APPLICATION_STATUSES: StaffLeaveApplicationStatus[] = [
  "PENDING",
  "CLARIFICATION_REQUIRED",
  "APPROVED"
];

const DEFAULT_LEAVE_SETTING = {
  allowHalfDay: true,
  allowBackdatedApplications: false,
  minimumNoticeDays: 0,
  maximumConsecutiveDays: 30,
  nonWorkingWeekdays: [0],
  approvalMode: "PRINCIPAL_OR_DESIGNATED" as const,
  whatsappNotificationsEnabled: false
};

type ApplicationSnapshot = {
  id: string;
  branchId: string;
  staffId: string;
  startDate: Date;
  endDate: Date;
  totalDays: Prisma.Decimal;
  status: StaffLeaveApplicationStatus;
  leaveType: { name: string };
  staff: {
    firstName: string;
    middleName: string | null;
    lastName: string | null;
    userId: string | null;
  };
};

function staffName(staff: ApplicationSnapshot["staff"]) {
  return [staff.firstName, staff.middleName, staff.lastName].filter(Boolean).join(" ");
}

async function requireSelfStaffProfile(ctx: TenantContext, permission: "staffboard.leave.self_apply" | "staffboard.leave.self_view") {
  const staff = await db.staffProfile.findFirst({
    where: {
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      branchId: { in: ctx.accessibleBranchIds },
      employmentStatus: "ACTIVE"
    },
    select: {
      id: true,
      branchId: true,
      staffType: true,
      userId: true,
      firstName: true,
      middleName: true,
      lastName: true,
      branch: { select: { timezone: true, status: true, institutionId: true } }
    }
  });
  if (!staff || staff.branch.status !== "ACTIVE") throw notFound("ACTIVE_STAFF_PROFILE_NOT_FOUND");
  await requirePermission({ ctx, permission, branchId: staff.branchId });
  return staff;
}

async function resolveLeaveSetting(client: DbClient, tenantId: string, branchId: string) {
  return (await client.staffLeaveSetting.findFirst({
    where: { tenantId, branchId },
    select: {
      allowHalfDay: true,
      allowBackdatedApplications: true,
      minimumNoticeDays: true,
      maximumConsecutiveDays: true,
      nonWorkingWeekdays: true,
      approvalMode: true,
      whatsappNotificationsEnabled: true
    }
  })) ?? DEFAULT_LEAVE_SETTING;
}

async function validateApplicationDates(
  client: DbClient,
  ctx: TenantContext,
  input: {
    leaveTypeId: string;
    startDate: Date;
    endDate: Date;
    duration: "FULL_DAY" | "FIRST_HALF" | "SECOND_HALF";
  },
  staff: { branchId: string; staffType: StaffType; branch: { timezone: string; institutionId: string } }
) {
  const [setting, leaveType] = await Promise.all([
    resolveLeaveSetting(client, ctx.tenantId, staff.branchId),
    client.staffLeaveType.findFirst({
      where: { id: input.leaveTypeId, tenantId: ctx.tenantId, branchId: staff.branchId, isActive: true }
    })
  ]);
  if (!leaveType) throw notFound("STAFF_LEAVE_TYPE_NOT_FOUND");

  const today = todayForTimeZone(new Date(), staff.branch.timezone);
  if (!setting.allowBackdatedApplications && input.startDate < today) {
    throw validationError("STAFF_LEAVE_BACKDATED_NOT_ALLOWED");
  }
  const noticeDays = Math.floor((input.startDate.getTime() - today.getTime()) / 86_400_000);
  if (noticeDays < setting.minimumNoticeDays) throw validationError("STAFF_LEAVE_NOTICE_REQUIRED");
  if (calendarDaySpan(input.startDate, input.endDate) > setting.maximumConsecutiveDays) {
    throw validationError("STAFF_LEAVE_MAXIMUM_DAYS_EXCEEDED");
  }
  if (input.duration !== "FULL_DAY" && (!setting.allowHalfDay || !leaveType.allowHalfDay)) {
    throw validationError("STAFF_LEAVE_HALF_DAY_NOT_ALLOWED");
  }

  const holidayDateKeys = await listCalendarDateKeysForRange(client, {
    tenantId: ctx.tenantId,
    institutionId: staff.branch.institutionId,
    branchId: staff.branchId,
    startDate: input.startDate,
    endDate: input.endDate,
    audience: staffCalendarAudience(staff.staffType)
  });
  const totalDays = calculateStaffLeaveDays({
    startDate: input.startDate,
    endDate: input.endDate,
    duration: input.duration,
    nonWorkingWeekdays: setting.nonWorkingWeekdays,
    excludedDateKeys: holidayDateKeys
  });
  if (totalDays <= 0) throw validationError("STAFF_LEAVE_NO_WORKING_DAYS");
  return { setting, leaveType, totalDays };
}

async function ensureNoOverlap(
  client: DbClient,
  input: {
    tenantId: string;
    staffId: string;
    startDate: Date;
    endDate: Date;
    excludeApplicationId?: string;
  }
) {
  const overlapping = await client.staffLeaveApplication.findFirst({
    where: {
      tenantId: input.tenantId,
      staffId: input.staffId,
      id: input.excludeApplicationId ? { not: input.excludeApplicationId } : undefined,
      status: { in: ACTIVE_APPLICATION_STATUSES },
      startDate: { lte: input.endDate },
      endDate: { gte: input.startDate }
    },
    select: { id: true }
  });
  if (overlapping) throw new AppError("STAFF_LEAVE_OVERLAP", "STAFF_LEAVE_OVERLAP", 409);
}

async function approverUserIds(client: DbClient, tenantId: string, branchId: string, mode: string) {
  const userIds = new Set<string>();
  const now = new Date();
  if (mode !== "DESIGNATED_APPROVERS") {
    const principals = await client.user.findMany({
      where: {
        tenantId,
        status: "ACTIVE",
        branchAccesses: { some: { tenantId, branchId, isActive: true } },
        roleAssignments: {
          some: {
            tenantId,
            isActive: true,
            role: { code: { in: ["PRINCIPAL", "TENANT_OWNER", "SUPER_ADMIN", "ADMIN"] }, isActive: true },
            OR: [{ startsAt: null }, { startsAt: { lte: now } }],
            AND: [{ OR: [{ endsAt: null }, { endsAt: { gt: now } }] }]
          }
        }
      },
      select: { id: true }
    });
    principals.forEach((user) => userIds.add(user.id));
  }
  if (mode !== "PRINCIPAL_ONLY") {
    const designated = await client.staffLeaveApprover.findMany({
      where: { tenantId, branchId, isActive: true, user: { status: "ACTIVE" } },
      select: { userId: true }
    });
    designated.forEach((entry) => userIds.add(entry.userId));
  }
  return [...userIds];
}

async function createInAppNotifications(
  client: Prisma.TransactionClient,
  input: {
    tenantId: string;
    branchId: string;
    userIds: readonly string[];
    type: string;
    title: string;
    message: string;
    applicationId: string;
  }
) {
  const userIds = [...new Set(input.userIds.filter(Boolean))];
  if (!userIds.length) return;
  await client.inAppNotification.createMany({
    data: userIds.map((userId) => ({
      tenantId: input.tenantId,
      branchId: input.branchId,
      userId,
      type: input.type,
      title: input.title,
      message: input.message,
      actionUrl: `/staffboard/leave/${input.applicationId}`
    }))
  });
}

async function queueLeaveWhatsAppUpdate(ctx: TenantContext, applicationId: string, actionId: string) {
  try {
    const application = await db.staffLeaveApplication.findFirst({
      where: { id: applicationId, tenantId: ctx.tenantId },
      include: {
        leaveType: { select: { name: true } },
        branch: { select: { institution: { select: { displayName: true, name: true } } } },
        staff: { select: { id: true, firstName: true, middleName: true, lastName: true, userId: true } }
      }
    });
    if (!application?.staff.userId) return;
    const [setting, preference, template] = await Promise.all([
      db.staffLeaveSetting.findFirst({ where: { tenantId: ctx.tenantId, branchId: application.branchId } }),
      db.communicationPreference.findUnique({
        where: { tenantId_ownerType_ownerId: { tenantId: ctx.tenantId, ownerType: "STAFF", ownerId: application.staff.id } }
      }),
      db.notificationTemplate.findFirst({
        where: {
          tenantId: ctx.tenantId,
          channel: "WHATSAPP",
          templateKey: WHATSAPP_TEMPLATE_KEYS.STAFF_LEAVE_STATUS_UPDATE,
          isActive: true,
          OR: [{ branchId: application.branchId }, { branchId: null }]
        },
        orderBy: { branchId: "desc" }
      })
    ]);
    if (
      !setting?.whatsappNotificationsEnabled ||
      !preference?.whatsappEnabled ||
      !preference.leaveUpdatesEnabled ||
      !preference.consentCapturedAt ||
      !preference.whatsappNumber ||
      !template
    ) return;

    await queueNotificationOutboxItem({
      tenantId: ctx.tenantId,
      branchId: application.branchId,
      channel: "WHATSAPP",
      templateKey: WHATSAPP_TEMPLATE_KEYS.STAFF_LEAVE_STATUS_UPDATE,
      recipientType: "STAFF",
      recipientId: application.staff.id,
      recipientPhone: preference.whatsappNumber,
      payload: buildStaffLeaveStatusTemplatePayload({
        staffName: staffName(application.staff),
        leaveType: application.leaveType.name,
        startDate: formatLeaveDate(application.startDate),
        endDate: formatLeaveDate(application.endDate),
        totalDays: application.totalDays.toNumber(),
        status: application.status,
        institutionName: application.branch.institution.displayName ?? application.branch.institution.name
      }),
      idempotencyKey: `staff-leave:${application.id}:${actionId}`,
      actorUserId: ctx.userId
    });
  } catch (error) {
    console.error("Staff leave WhatsApp queue failed", { code: getSafeErrorCode(error), applicationId });
  }
}

function applicationSnapshot<T extends ApplicationSnapshot>(application: T) {
  return {
    id: application.id,
    branchId: application.branchId,
    staffId: application.staffId,
    startDate: formatLeaveDate(application.startDate),
    endDate: formatLeaveDate(application.endDate),
    totalDays: application.totalDays.toNumber(),
    status: application.status,
    leaveType: application.leaveType.name,
    staffName: staffName(application.staff)
  };
}

async function enqueueLeaveSchoolCastEvent(
  tx: Prisma.TransactionClient,
  ctx: TenantContext,
  application: ApplicationSnapshot,
  actionId: string,
  action: string
) {
  return enqueueStaffLeaveSchoolCastEvent(tx, {
    tenantId: ctx.tenantId,
    branchId: application.branchId,
    applicationId: application.id,
    actionId,
    action,
    staffId: application.staffId,
    status: application.status,
    startDate: application.startDate,
    endDate: application.endDate
  });
}
export async function submitStaffLeaveApplication(ctx: TenantContext, input: unknown) {
  const data = createStaffLeaveApplicationSchema.parse(input);
  const staff = await requireSelfStaffProfile(ctx, "staffboard.leave.self_apply");

  const result = await db.$transaction(async (tx) => {
    const validated = await validateApplicationDates(tx, ctx, data, staff);
    await ensureNoOverlap(tx, {
      tenantId: ctx.tenantId,
      staffId: staff.id,
      startDate: data.startDate,
      endDate: data.endDate
    });
    const application = await tx.staffLeaveApplication.create({
      data: {
        tenantId: ctx.tenantId,
        branchId: staff.branchId,
        staffId: staff.id,
        leaveTypeId: validated.leaveType.id,
        startDate: data.startDate,
        endDate: data.endDate,
        duration: data.duration,
        totalDays: new Prisma.Decimal(validated.totalDays),
        reason: data.reason
      },
      include: { leaveType: { select: { name: true } }, staff: { select: { firstName: true, middleName: true, lastName: true, userId: true } } }
    });
    const action = await tx.staffLeaveApplicationAction.create({
      data: {
        tenantId: ctx.tenantId,
        branchId: staff.branchId,
        applicationId: application.id,
        actorUserId: ctx.userId,
        action: "SUBMITTED",
        nextStatus: "PENDING"
      }
    });
    const approvers = await approverUserIds(tx, ctx.tenantId, staff.branchId, validated.setting.approvalMode);
    await createInAppNotifications(tx, {
      tenantId: ctx.tenantId,
      branchId: staff.branchId,
      userIds: [ctx.userId, ...approvers],
      type: "STAFF_LEAVE_SUBMITTED",
      title: "Leave application submitted",
      message: `${staffName(application.staff)} submitted ${validated.totalDays} day(s) of ${validated.leaveType.name}.`,
      applicationId: application.id
    });
    await writeAuditLog({
      ctx,
      action: STAFFBOARD_LITE_AUDIT_EVENTS.STAFF_LEAVE_SUBMITTED,
      entityType: "StaffLeaveApplication",
      entityId: application.id,
      branchId: staff.branchId,
      after: applicationSnapshot(application)
    }, tx);
    await enqueueLeaveSchoolCastEvent(tx, ctx, application, action.id, "SUBMITTED");
    return { application, actionId: action.id };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  await queueLeaveWhatsAppUpdate(ctx, result.application.id, result.actionId);
  return applicationSnapshot(result.application);
}

export async function updateStaffLeaveApplication(ctx: TenantContext, input: unknown) {
  const data = updateStaffLeaveApplicationSchema.parse(input);
  const staff = await requireSelfStaffProfile(ctx, "staffboard.leave.self_apply");

  const result = await db.$transaction(async (tx) => {
    const before = await tx.staffLeaveApplication.findFirst({
      where: { id: data.applicationId, tenantId: ctx.tenantId, staffId: staff.id },
      include: { leaveType: { select: { name: true } }, staff: { select: { firstName: true, middleName: true, lastName: true, userId: true } } }
    });
    if (!before) throw notFound("STAFF_LEAVE_APPLICATION_NOT_FOUND");
    if (!(["PENDING", "CLARIFICATION_REQUIRED"] as StaffLeaveApplicationStatus[]).includes(before.status)) {
      throw new AppError("STAFF_LEAVE_NOT_EDITABLE", "STAFF_LEAVE_NOT_EDITABLE", 409);
    }
    const validated = await validateApplicationDates(tx, ctx, data, staff);
    await ensureNoOverlap(tx, {
      tenantId: ctx.tenantId,
      staffId: staff.id,
      startDate: data.startDate,
      endDate: data.endDate,
      excludeApplicationId: before.id
    });
    const actionType = before.status === "CLARIFICATION_REQUIRED" ? "CLARIFICATION_PROVIDED" : "MODIFIED";
    const after = await tx.staffLeaveApplication.update({
      where: { id: before.id },
      data: {
        leaveTypeId: validated.leaveType.id,
        startDate: data.startDate,
        endDate: data.endDate,
        duration: data.duration,
        totalDays: new Prisma.Decimal(validated.totalDays),
        reason: data.reason,
        staffClarification: data.staffClarification,
        status: "PENDING",
        approverRemarks: null,
        actionedById: null,
        actionedAt: null
      },
      include: { leaveType: { select: { name: true } }, staff: { select: { firstName: true, middleName: true, lastName: true, userId: true } } }
    });
    const action = await tx.staffLeaveApplicationAction.create({
      data: {
        tenantId: ctx.tenantId,
        branchId: staff.branchId,
        applicationId: after.id,
        actorUserId: ctx.userId,
        action: actionType,
        previousStatus: before.status,
        nextStatus: "PENDING",
        remarks: data.staffClarification
      }
    });
    const approvers = await approverUserIds(tx, ctx.tenantId, staff.branchId, validated.setting.approvalMode);
    await createInAppNotifications(tx, {
      tenantId: ctx.tenantId,
      branchId: staff.branchId,
      userIds: [ctx.userId, ...approvers],
      type: actionType === "MODIFIED" ? "STAFF_LEAVE_MODIFIED" : "STAFF_LEAVE_CLARIFIED",
      title: actionType === "MODIFIED" ? "Leave application updated" : "Leave clarification submitted",
      message: `${staffName(after.staff)} updated the ${validated.leaveType.name} application.`,
      applicationId: after.id
    });
    await writeAuditLog({
      ctx,
      action: actionType === "MODIFIED"
        ? STAFFBOARD_LITE_AUDIT_EVENTS.STAFF_LEAVE_MODIFIED
        : STAFFBOARD_LITE_AUDIT_EVENTS.STAFF_LEAVE_CLARIFICATION_PROVIDED,
      entityType: "StaffLeaveApplication",
      entityId: after.id,
      branchId: staff.branchId,
      before: applicationSnapshot(before),
      after: applicationSnapshot(after)
    }, tx);
    await enqueueLeaveSchoolCastEvent(tx, ctx, after, action.id, actionType);
    return { application: after, actionId: action.id };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  await queueLeaveWhatsAppUpdate(ctx, result.application.id, result.actionId);
  return applicationSnapshot(result.application);
}

async function requireLeaveApprover(ctx: TenantContext, branchId: string, client: DbClient) {
  await requirePermission({ ctx, permission: "staffboard.leave.approve", branchId });
  const setting = await resolveLeaveSetting(client, ctx.tenantId, branchId);
  const principal = hasPrincipalRole(ctx.roleCodes ?? []);
  const designated = await client.staffLeaveApprover.findFirst({
    where: { tenantId: ctx.tenantId, branchId, userId: ctx.userId, isActive: true },
    select: { id: true }
  });
  if (setting.approvalMode === "PRINCIPAL_ONLY" && !principal) throw forbidden("STAFF_LEAVE_APPROVER_REQUIRED");
  if (setting.approvalMode === "DESIGNATED_APPROVERS" && !designated) throw forbidden("STAFF_LEAVE_APPROVER_REQUIRED");
  if (setting.approvalMode === "PRINCIPAL_OR_DESIGNATED" && !principal && !designated) {
    throw forbidden("STAFF_LEAVE_APPROVER_REQUIRED");
  }
  return setting;
}

async function approveApplication(
  tx: Prisma.TransactionClient,
  ctx: TenantContext,
  application: Awaited<ReturnType<typeof loadReviewApplication>>
) {
  if (!application) throw notFound("STAFF_LEAVE_APPLICATION_NOT_FOUND");
  const requiresDocument = application.leaveType.supportingDocumentRequired || (
    typeof application.leaveType.documentRequiredAfterDays === "number" &&
    application.totalDays.toNumber() >= application.leaveType.documentRequiredAfterDays
  );
  if (requiresDocument && application.documents.length === 0) {
    throw validationError("STAFF_LEAVE_DOCUMENT_REQUIRED");
  }

  if (application.leaveType.balanceTracked) {
    const year = application.startDate.getUTCFullYear();
    const balance = await tx.staffLeaveBalance.upsert({
      where: {
        tenantId_branchId_staffId_leaveTypeId_year: {
          tenantId: ctx.tenantId,
          branchId: application.branchId,
          staffId: application.staffId,
          leaveTypeId: application.leaveTypeId,
          year
        }
      },
      create: {
        tenantId: ctx.tenantId,
        branchId: application.branchId,
        staffId: application.staffId,
        leaveTypeId: application.leaveTypeId,
        year,
        allocatedDays: application.leaveType.annualLimit,
        updatedById: ctx.userId
      },
      update: {},
      select: { id: true, allocatedDays: true, adjustedDays: true, usedDays: true }
    });
    const available = balance.allocatedDays.plus(balance.adjustedDays).minus(balance.usedDays);
    if (available.lessThan(application.totalDays)) throw new AppError("STAFF_LEAVE_BALANCE_INSUFFICIENT", "STAFF_LEAVE_BALANCE_INSUFFICIENT", 409);
    await tx.staffLeaveBalance.update({
      where: { id: balance.id },
      data: { usedDays: { increment: application.totalDays }, updatedById: ctx.userId }
    });
  }

  const [setting, staffScope] = await Promise.all([
    resolveLeaveSetting(tx, ctx.tenantId, application.branchId),
    tx.staffProfile.findFirst({
      where: { id: application.staffId, tenantId: ctx.tenantId, branchId: application.branchId },
      select: { staffType: true, branch: { select: { institutionId: true } } }
    })
  ]);
  if (!staffScope) throw notFound("ACTIVE_STAFF_PROFILE_NOT_FOUND");
  const holidayDateKeys = await listCalendarDateKeysForRange(tx, {
    tenantId: ctx.tenantId,
    institutionId: staffScope.branch.institutionId,
    branchId: application.branchId,
    startDate: application.startDate,
    endDate: application.endDate,
    audience: staffCalendarAudience(staffScope.staffType)
  });
  const leaveDates = enumerateLeaveDates(
    application.startDate,
    application.endDate,
    setting.nonWorkingWeekdays,
    holidayDateKeys
  );
  const existingRows = await tx.staffAttendanceRecord.findMany({
    where: {
      tenantId: ctx.tenantId,
      branchId: application.branchId,
      staffId: application.staffId,
      attendanceDate: { in: leaveDates }
    }
  });
  for (const row of existingRows) {
    const safePlaceholder = !row.checkInAt && !row.checkOutAt &&
      (["ABSENT", "NOT_MARKED"] as string[]).includes(row.status) &&
      (!row.leaveApplicationId || row.leaveApplicationId === application.id);
    if (!safePlaceholder) throw new AppError("STAFF_LEAVE_ATTENDANCE_CONFLICT", "STAFF_LEAVE_ATTENDANCE_CONFLICT", 409);
  }

  const status = application.duration === "FULL_DAY" ? "ON_LEAVE" : "HALF_DAY";
  for (const attendanceDate of leaveDates) {
    await tx.staffAttendanceRecord.upsert({
      where: {
        tenantId_branchId_staffId_attendanceDate: {
          tenantId: ctx.tenantId,
          branchId: application.branchId,
          staffId: application.staffId,
          attendanceDate
        }
      },
      create: {
        tenantId: ctx.tenantId,
        branchId: application.branchId,
        academicYearId: ctx.activeAcademicYearId,
        staffId: application.staffId,
        attendanceDate,
        status,
        leaveApplicationId: application.id,
        markedById: ctx.userId,
        updatedById: ctx.userId
      },
      update: {
        status,
        leaveApplicationId: application.id,
        correctionReason: null,
        markedById: ctx.userId,
        updatedById: ctx.userId
      }
    });
  }
}

async function loadReviewApplication(client: DbClient, ctx: TenantContext, applicationId: string) {
  return client.staffLeaveApplication.findFirst({
    where: { id: applicationId, tenantId: ctx.tenantId, branchId: { in: ctx.accessibleBranchIds } },
    include: {
      leaveType: true,
      staff: { select: { firstName: true, middleName: true, lastName: true, userId: true } },
      documents: { where: { deletedAt: null }, select: { id: true } }
    }
  });
}

export async function reviewStaffLeaveApplication(ctx: TenantContext, input: unknown) {
  const data = staffLeaveReviewSchema.parse(input);
  const result = await db.$transaction(async (tx) => {
    const before = await loadReviewApplication(tx, ctx, data.applicationId);
    if (!before) throw notFound("STAFF_LEAVE_APPLICATION_NOT_FOUND");
    await requireLeaveApprover(ctx, before.branchId, tx);
    if (!(["PENDING", "CLARIFICATION_REQUIRED"] as StaffLeaveApplicationStatus[]).includes(before.status)) {
      throw new AppError("STAFF_LEAVE_ALREADY_ACTIONED", "STAFF_LEAVE_ALREADY_ACTIONED", 409);
    }

    const nextStatus = data.decision === "APPROVE"
      ? "APPROVED"
      : data.decision === "REJECT"
        ? "REJECTED"
        : "CLARIFICATION_REQUIRED";
    if (nextStatus === "APPROVED") await approveApplication(tx, ctx, before);
    const after = await tx.staffLeaveApplication.update({
      where: { id: before.id },
      data: {
        status: nextStatus,
        approverRemarks: data.remarks,
        actionedById: ctx.userId,
        actionedAt: new Date()
      },
      include: { leaveType: { select: { name: true } }, staff: { select: { firstName: true, middleName: true, lastName: true, userId: true } } }
    });
    const actionType = data.decision === "APPROVE"
      ? "APPROVED"
      : data.decision === "REJECT"
        ? "REJECTED"
        : "CLARIFICATION_REQUESTED";
    const action = await tx.staffLeaveApplicationAction.create({
      data: {
        tenantId: ctx.tenantId,
        branchId: before.branchId,
        applicationId: before.id,
        actorUserId: ctx.userId,
        action: actionType,
        previousStatus: before.status,
        nextStatus,
        remarks: data.remarks
      }
    });
    if (after.staff.userId) {
      await createInAppNotifications(tx, {
        tenantId: ctx.tenantId,
        branchId: after.branchId,
        userIds: [after.staff.userId],
        type: `STAFF_LEAVE_${actionType}`,
        title: nextStatus === "CLARIFICATION_REQUIRED" ? "Leave clarification requested" : `Leave application ${nextStatus.toLowerCase()}`,
        message: `${after.leaveType.name} leave for ${formatLeaveDate(after.startDate)} to ${formatLeaveDate(after.endDate)} is ${nextStatus.toLowerCase().replaceAll("_", " ")}.`,
        applicationId: after.id
      });
    }
    const auditAction = data.decision === "APPROVE"
      ? STAFFBOARD_LITE_AUDIT_EVENTS.STAFF_LEAVE_APPROVED
      : data.decision === "REJECT"
        ? STAFFBOARD_LITE_AUDIT_EVENTS.STAFF_LEAVE_REJECTED
        : STAFFBOARD_LITE_AUDIT_EVENTS.STAFF_LEAVE_CLARIFICATION_REQUESTED;
    await writeAuditLog({
      ctx,
      action: auditAction,
      entityType: "StaffLeaveApplication",
      entityId: after.id,
      branchId: after.branchId,
      before: applicationSnapshot(before),
      after: applicationSnapshot(after),
      metadata: { decision: data.decision, hasRemarks: Boolean(data.remarks) }
    }, tx);
    await enqueueLeaveSchoolCastEvent(tx, ctx, after, action.id, actionType);
    return { application: after, actionId: action.id };
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    maxWait: 10_000,
    timeout: 30_000
  });

  await queueLeaveWhatsAppUpdate(ctx, result.application.id, result.actionId);
  return applicationSnapshot(result.application);
}

export async function withdrawStaffLeaveApplication(ctx: TenantContext, input: unknown) {
  const data = withdrawStaffLeaveSchema.parse(input);
  const staff = await requireSelfStaffProfile(ctx, "staffboard.leave.self_apply");
  const result = await db.$transaction(async (tx) => {
    const before = await tx.staffLeaveApplication.findFirst({
      where: { id: data.applicationId, tenantId: ctx.tenantId, staffId: staff.id },
      include: { leaveType: { select: { name: true } }, staff: { select: { firstName: true, middleName: true, lastName: true, userId: true } } }
    });
    if (!before) throw notFound("STAFF_LEAVE_APPLICATION_NOT_FOUND");
    if (!(["PENDING", "CLARIFICATION_REQUIRED"] as StaffLeaveApplicationStatus[]).includes(before.status)) {
      throw new AppError("STAFF_LEAVE_NOT_WITHDRAWABLE", "STAFF_LEAVE_NOT_WITHDRAWABLE", 409);
    }
    const after = await tx.staffLeaveApplication.update({
      where: { id: before.id },
      data: { status: "WITHDRAWN", withdrawnAt: new Date(), actionedById: ctx.userId, actionedAt: new Date() },
      include: { leaveType: { select: { name: true } }, staff: { select: { firstName: true, middleName: true, lastName: true, userId: true } } }
    });
    const action = await tx.staffLeaveApplicationAction.create({
      data: {
        tenantId: ctx.tenantId,
        branchId: before.branchId,
        applicationId: before.id,
        actorUserId: ctx.userId,
        action: "WITHDRAWN",
        previousStatus: before.status,
        nextStatus: "WITHDRAWN",
        remarks: data.remarks
      }
    });
    await createInAppNotifications(tx, {
      tenantId: ctx.tenantId,
      branchId: after.branchId,
      userIds: [ctx.userId],
      type: "STAFF_LEAVE_WITHDRAWN",
      title: "Leave application withdrawn",
      message: `${after.leaveType.name} leave was withdrawn.`,
      applicationId: after.id
    });
    await writeAuditLog({
      ctx,
      action: STAFFBOARD_LITE_AUDIT_EVENTS.STAFF_LEAVE_WITHDRAWN,
      entityType: "StaffLeaveApplication",
      entityId: after.id,
      branchId: after.branchId,
      before: applicationSnapshot(before),
      after: applicationSnapshot(after),
      metadata: { hasRemarks: Boolean(data.remarks) }
    }, tx);
    await enqueueLeaveSchoolCastEvent(tx, ctx, after, action.id, "WITHDRAWN");
    return { application: after, actionId: action.id };
  });
  await queueLeaveWhatsAppUpdate(ctx, result.application.id, result.actionId);
  return applicationSnapshot(result.application);
}

export async function cancelApprovedStaffLeave(ctx: TenantContext, input: unknown) {
  const data = cancelStaffLeaveSchema.parse(input);
  const result = await db.$transaction(async (tx) => {
    const before = await loadReviewApplication(tx, ctx, data.applicationId);
    if (!before) throw notFound("STAFF_LEAVE_APPLICATION_NOT_FOUND");
    await requireLeaveApprover(ctx, before.branchId, tx);
    if (before.status !== "APPROVED") throw new AppError("STAFF_LEAVE_NOT_CANCELLABLE", "STAFF_LEAVE_NOT_CANCELLABLE", 409);
    const branch = await tx.branch.findFirst({ where: { id: before.branchId, tenantId: ctx.tenantId }, select: { timezone: true } });
    if (!branch) throw notFound("BRANCH_NOT_FOUND");
    const today = todayForTimeZone(new Date(), branch.timezone);
    if (before.startDate < today) throw new AppError("STAFF_LEAVE_PAST_CANCELLATION_BLOCKED", "STAFF_LEAVE_PAST_CANCELLATION_BLOCKED", 409);
    const records = await tx.staffAttendanceRecord.findMany({
      where: { tenantId: ctx.tenantId, leaveApplicationId: before.id }
    });
    if (records.some((record) => record.checkInAt || record.checkOutAt)) {
      throw new AppError("STAFF_LEAVE_ATTENDANCE_CONFLICT", "STAFF_LEAVE_ATTENDANCE_CONFLICT", 409);
    }
    if (before.leaveType.balanceTracked) {
      const balance = await tx.staffLeaveBalance.findUnique({
        where: {
          tenantId_branchId_staffId_leaveTypeId_year: {
            tenantId: ctx.tenantId,
            branchId: before.branchId,
            staffId: before.staffId,
            leaveTypeId: before.leaveTypeId,
            year: before.startDate.getUTCFullYear()
          }
        }
      });
      if (!balance || balance.usedDays.lessThan(before.totalDays)) throw new AppError("STAFF_LEAVE_BALANCE_CONFLICT", "STAFF_LEAVE_BALANCE_CONFLICT", 409);
      await tx.staffLeaveBalance.update({
        where: { id: balance.id },
        data: { usedDays: { decrement: before.totalDays }, updatedById: ctx.userId }
      });
    }
    await tx.staffAttendanceRecord.updateMany({
      where: { tenantId: ctx.tenantId, leaveApplicationId: before.id },
      data: { status: "NOT_MARKED", leaveApplicationId: null, markedById: null, updatedById: ctx.userId }
    });
    const after = await tx.staffLeaveApplication.update({
      where: { id: before.id },
      data: { status: "CANCELLED", cancelledAt: new Date(), actionedById: ctx.userId, actionedAt: new Date(), approverRemarks: data.remarks },
      include: { leaveType: { select: { name: true } }, staff: { select: { firstName: true, middleName: true, lastName: true, userId: true } } }
    });
    const action = await tx.staffLeaveApplicationAction.create({
      data: {
        tenantId: ctx.tenantId,
        branchId: before.branchId,
        applicationId: before.id,
        actorUserId: ctx.userId,
        action: "CANCELLED",
        previousStatus: before.status,
        nextStatus: "CANCELLED",
        remarks: data.remarks
      }
    });
    if (after.staff.userId) {
      await createInAppNotifications(tx, {
        tenantId: ctx.tenantId,
        branchId: after.branchId,
        userIds: [after.staff.userId],
        type: "STAFF_LEAVE_CANCELLED",
        title: "Approved leave cancelled",
        message: `${after.leaveType.name} leave was cancelled by an approver.`,
        applicationId: after.id
      });
    }
    await writeAuditLog({
      ctx,
      action: STAFFBOARD_LITE_AUDIT_EVENTS.STAFF_LEAVE_CANCELLED,
      entityType: "StaffLeaveApplication",
      entityId: after.id,
      branchId: after.branchId,
      before: applicationSnapshot(before),
      after: applicationSnapshot(after),
      metadata: { attendanceRecordsReset: records.length, hasRemarks: true }
    }, tx);
    await enqueueLeaveSchoolCastEvent(tx, ctx, after, action.id, "CANCELLED");
    return { application: after, actionId: action.id };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  await queueLeaveWhatsAppUpdate(ctx, result.application.id, result.actionId);
  return applicationSnapshot(result.application);
}

export async function updateStaffLeaveSetting(ctx: TenantContext, input: unknown) {
  const data = staffLeaveSettingSchema.parse(input);
  await requireBranchPermission(ctx, "staffboard.leave.settings.manage", data.branchId);
  if (data.approvalMode === "DESIGNATED_APPROVERS") {
    const approverCount = await db.staffLeaveApprover.count({
      where: { tenantId: ctx.tenantId, branchId: data.branchId, isActive: true }
    });
    if (approverCount === 0) throw validationError("STAFF_LEAVE_DESIGNATED_APPROVER_REQUIRED");
  }
  return db.$transaction(async (tx) => {
    const before = await tx.staffLeaveSetting.findFirst({ where: { tenantId: ctx.tenantId, branchId: data.branchId } });
    const { branchId, ...settingValues } = data;
    const after = await tx.staffLeaveSetting.upsert({
      where: { branchId },
      create: { tenantId: ctx.tenantId, branchId, ...settingValues, createdById: ctx.userId, updatedById: ctx.userId },
      update: { ...settingValues, updatedById: ctx.userId }
    });
    await writeAuditLog({
      ctx,
      action: STAFFBOARD_LITE_AUDIT_EVENTS.STAFF_LEAVE_SETTING_UPDATED,
      entityType: "StaffLeaveSetting",
      entityId: after.id,
      branchId,
      before,
      after
    }, tx);
    return after;
  });
}

export async function upsertStaffLeaveType(ctx: TenantContext, input: unknown) {
  const data = upsertStaffLeaveTypeSchema.parse(input);
  await requireBranchPermission(ctx, "staffboard.leave.settings.manage", data.branchId);
  return db.$transaction(async (tx) => {
    const before = data.leaveTypeId
      ? await tx.staffLeaveType.findFirst({ where: { id: data.leaveTypeId, tenantId: ctx.tenantId, branchId: data.branchId } })
      : null;
    if (data.leaveTypeId && !before) throw notFound("STAFF_LEAVE_TYPE_NOT_FOUND");
    const values = {
      code: data.code,
      name: data.name,
      isPaid: data.isPaid,
      balanceTracked: data.balanceTracked,
      annualLimit: new Prisma.Decimal(data.annualLimit),
      carryForwardLimit: new Prisma.Decimal(data.carryForwardLimit),
      allowHalfDay: data.allowHalfDay,
      supportingDocumentRequired: data.supportingDocumentRequired,
      documentRequiredAfterDays: data.documentRequiredAfterDays,
      isActive: data.isActive,
      updatedById: ctx.userId
    };
    const after = before
      ? await tx.staffLeaveType.update({ where: { id: before.id }, data: values })
      : await tx.staffLeaveType.create({
        data: { tenantId: ctx.tenantId, branchId: data.branchId, ...values, createdById: ctx.userId }
      });
    await writeAuditLog({
      ctx,
      action: STAFFBOARD_LITE_AUDIT_EVENTS.STAFF_LEAVE_TYPE_UPSERTED,
      entityType: "StaffLeaveType",
      entityId: after.id,
      branchId: data.branchId,
      before,
      after
    }, tx);
    return after;
  });
}

export async function setStaffLeaveApprover(ctx: TenantContext, input: unknown) {
  const data = setStaffLeaveApproverSchema.parse(input);
  await requireBranchPermission(ctx, "staffboard.leave.settings.manage", data.branchId);
  const user = await db.user.findFirst({
    where: {
      id: data.userId,
      tenantId: ctx.tenantId,
      status: "ACTIVE",
      branchAccesses: { some: { tenantId: ctx.tenantId, branchId: data.branchId, isActive: true } },
      roleAssignments: { some: { tenantId: ctx.tenantId, isActive: true, role: { code: { in: ["PRINCIPAL", "OFFICE_STAFF", "TENANT_OWNER", "SUPER_ADMIN", "ADMIN"] } } } }
    },
    select: { id: true }
  });
  if (!user) throw notFound("STAFF_LEAVE_APPROVER_USER_NOT_FOUND");
  return db.$transaction(async (tx) => {
    const before = await tx.staffLeaveApprover.findUnique({
      where: { tenantId_branchId_userId: { tenantId: ctx.tenantId, branchId: data.branchId, userId: data.userId } }
    });
    const after = await tx.staffLeaveApprover.upsert({
      where: { tenantId_branchId_userId: { tenantId: ctx.tenantId, branchId: data.branchId, userId: data.userId } },
      create: { tenantId: ctx.tenantId, branchId: data.branchId, userId: data.userId, isActive: data.isActive, createdById: ctx.userId },
      update: { isActive: data.isActive }
    });
    await writeAuditLog({
      ctx,
      action: STAFFBOARD_LITE_AUDIT_EVENTS.STAFF_LEAVE_APPROVER_UPDATED,
      entityType: "StaffLeaveApprover",
      entityId: after.id,
      branchId: data.branchId,
      before: before ? { userId: before.userId, isActive: before.isActive } : null,
      after: { userId: after.userId, isActive: after.isActive }
    }, tx);
    return after;
  });
}

export async function adjustStaffLeaveBalance(ctx: TenantContext, input: unknown) {
  const data = adjustStaffLeaveBalanceSchema.parse(input);
  await requireBranchPermission(ctx, "staffboard.leave.balance.manage", data.branchId);
  const [staff, leaveType] = await Promise.all([
    db.staffProfile.findFirst({ where: { id: data.staffId, tenantId: ctx.tenantId, branchId: data.branchId }, select: { id: true } }),
    db.staffLeaveType.findFirst({ where: { id: data.leaveTypeId, tenantId: ctx.tenantId, branchId: data.branchId, balanceTracked: true }, select: { id: true, annualLimit: true } })
  ]);
  if (!staff) throw notFound("STAFF_PROFILE_NOT_FOUND");
  if (!leaveType) throw notFound("STAFF_LEAVE_TYPE_NOT_FOUND");
  return db.$transaction(async (tx) => {
    const before = await tx.staffLeaveBalance.findUnique({
      where: { tenantId_branchId_staffId_leaveTypeId_year: { tenantId: ctx.tenantId, branchId: data.branchId, staffId: data.staffId, leaveTypeId: data.leaveTypeId, year: data.year } }
    });
    const after = await tx.staffLeaveBalance.upsert({
      where: { tenantId_branchId_staffId_leaveTypeId_year: { tenantId: ctx.tenantId, branchId: data.branchId, staffId: data.staffId, leaveTypeId: data.leaveTypeId, year: data.year } },
      create: {
        tenantId: ctx.tenantId,
        branchId: data.branchId,
        staffId: data.staffId,
        leaveTypeId: data.leaveTypeId,
        year: data.year,
        allocatedDays: leaveType.annualLimit,
        adjustedDays: new Prisma.Decimal(data.adjustmentDays),
        updatedById: ctx.userId
      },
      update: { adjustedDays: { increment: new Prisma.Decimal(data.adjustmentDays) }, updatedById: ctx.userId }
    });
    if (after.allocatedDays.plus(after.adjustedDays).lessThan(after.usedDays)) {
      throw new AppError("STAFF_LEAVE_BALANCE_BELOW_USED", "STAFF_LEAVE_BALANCE_BELOW_USED", 409);
    }
    await writeAuditLog({
      ctx,
      action: STAFFBOARD_LITE_AUDIT_EVENTS.STAFF_LEAVE_BALANCE_ADJUSTED,
      entityType: "StaffLeaveBalance",
      entityId: after.id,
      branchId: data.branchId,
      before,
      after,
      metadata: { adjustmentDays: data.adjustmentDays, reason: data.reason }
    }, tx);
    return after;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
