import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { db } from "../src/lib/db";
import {
  enqueueSchoolCastDomainEvent,
  SCHOOLCAST_SOURCE_EVENTS
} from "../src/modules/schoolcast/services/domain-event.service";
import {
  processGradebookSchoolCastEvents,
  processSchoolCastSourceEvents
} from "../src/modules/schoolcast/services/source-event-worker.service";

const STAGING_REF = "clmbwnulotrviqvnwvvj";
const PRODUCTION_REF = "jcqpmdslmydxjsfdwenc";
const PILOT_SLUG = "jinacampus-demo";
let qaPhase = "startup";
let qaDiagnostic: Record<string, unknown> = {};

function assertStagingTarget() {
  if (process.env.NODE_ENV === "production") throw new Error("SCHOOLCAST_SOURCE_QA_PRODUCTION_MODE_REFUSED");
  if (process.env.SCHOOLCAST_STAGING_PROJECT_REF !== STAGING_REF) {
    throw new Error("SCHOOLCAST_SOURCE_QA_STAGING_REF_INVALID");
  }
  for (const name of ["DATABASE_URL", "DIRECT_URL"] as const) {
    const value = process.env[name] ?? "";
    if (!value.includes(STAGING_REF) || value.includes(PRODUCTION_REF)) {
      throw new Error(`SCHOOLCAST_SOURCE_QA_${name}_TARGET_INVALID`);
    }
  }
}

async function main() {
  assertStagingTarget();
  const runId = randomUUID();
  const workerInput = {
    limit: 20,
    concurrency: 5,
    leaseSeconds: 60,
    workerId: `schoolcast-source-qa-${runId}`
  };

  const tenant = await db.tenant.findUnique({
    where: { slug: PILOT_SLUG },
    select: {
      id: true,
      tenantSettings: {
        select: {
          schoolCastEnabled: true,
          schoolCastInAppEnabled: true,
          schoolCastEmailEnabled: true,
          schoolCastWhatsAppEnabled: true,
          schoolCastAutomationEnabled: true,
          schoolCastDeliveryMode: true,
          gradebookEnabled: true,
          gradebookPublicationEnabled: true
        }
      }
    }
  });
  assert(tenant?.tenantSettings, "Synthetic SchoolCast pilot settings are missing.");
  const settings = tenant.tenantSettings;
  assert.equal(settings.schoolCastEnabled, true);
  assert.equal(settings.schoolCastInAppEnabled, true);
  assert.equal(settings.schoolCastEmailEnabled, false);
  assert.equal(settings.schoolCastWhatsAppEnabled, false);
  assert.equal(settings.schoolCastDeliveryMode, "DRY_RUN");
  assert.equal(settings.gradebookEnabled, true);
  assert.equal(settings.gradebookPublicationEnabled, true);

  qaPhase = "fixture-selection";
  const [studentAttendance, staffAttendance, existingLeaveAction, calendarEntries, existingPublication] = await Promise.all([
    db.studentAttendanceRecord.findFirst({
      where: {
        tenantId: tenant.id,
        markedById: { not: null },
        branch: { status: "ACTIVE" }
      },
      select: {
        id: true,
        branchId: true,
        academicYearId: true,
        markedById: true,
        branch: { select: { institutionId: true } },
        academicYear: { select: { startDate: true, endDate: true } }
      },
      orderBy: { updatedAt: "desc" }
    }),
    db.staffAttendanceRecord.findFirst({
      where: {
        tenantId: tenant.id,
        OR: [{ markedById: { not: null } }, { updatedById: { not: null } }],
        branch: { status: "ACTIVE" },
        staff: { employmentStatus: "ACTIVE", userId: { not: null } }
      },
      select: {
        id: true,
        branchId: true,
        academicYearId: true,
        staffId: true,
        markedById: true,
        updatedById: true,
        branch: { select: { institutionId: true } }
      },
      orderBy: { updatedAt: "desc" }
    }),
    db.staffLeaveApplicationAction.findFirst({
      where: { tenantId: tenant.id, actorUserId: { not: null }, branch: { status: "ACTIVE" } },
      select: {
        id: true,
        branchId: true,
        applicationId: true,
        branch: { select: { institutionId: true } }
      },
      orderBy: { createdAt: "desc" }
    }),
    db.academicCalendarEntry.findMany({
      where: { tenantId: tenant.id, createdById: { not: null } },
      select: {
        id: true,
        branchId: true,
        academicYearId: true,
        institutionId: true,
        audiences: true
      },
      orderBy: { updatedAt: "desc" },
      take: 20
    }),
    db.gradebookResultPublication.findFirst({
      where: {
        tenantId: tenant.id,
        status: "PUBLISHED",
        publishedById: { not: null },
        studentPublications: { some: { isEligible: true, publishedAt: { not: null } } }
      },
      select: { id: true, branchId: true, academicYearId: true, resultRunId: true, audience: true },
      orderBy: { publishedAt: "desc" }
    })
  ]);

  assert(studentAttendance?.markedById, "Synthetic student attendance fixture is missing.");
  assert(staffAttendance, "Synthetic staff attendance fixture is missing.");
  const actorUserId = studentAttendance.markedById;
  const qaCode = `SCQA${runId.replaceAll("-", "").slice(0, 12).toUpperCase()}`;
  const temporary = {
    leaveTypeId: null as string | null,
    leaveApplicationId: null as string | null,
    calendarId: null as string | null,
    gradebookTermId: null as string | null,
    gradebookExamTypeId: null as string | null,
    gradebookExamId: null as string | null,
    gradebookResultRunId: null as string | null,
    gradebookPublicationId: null as string | null
  };
  const createdEventIds: string[] = [];
  let gradebookEventId: string | null = null;
  let communicationIds: string[] = [];
  let outboxIds: string[] = [];
  const previousAutomation = settings.schoolCastAutomationEnabled;
  let result: Record<string, unknown> | null = null;

  try {
    qaPhase = "fixture-creation";
    let leaveAction = existingLeaveAction;
  if (!leaveAction) {
    let leaveType = await db.staffLeaveType.findFirst({
      where: { tenantId: tenant.id, branchId: staffAttendance.branchId, isActive: true },
      select: { id: true }
    });
    if (!leaveType) {
      leaveType = await db.staffLeaveType.create({
        data: {
          tenantId: tenant.id,
          branchId: staffAttendance.branchId,
          code: qaCode,
          name: "Synthetic source QA leave",
          balanceTracked: false,
          createdById: actorUserId
        },
        select: { id: true }
      });
      temporary.leaveTypeId = leaveType.id;
    }
    const application = await db.staffLeaveApplication.create({
      data: {
        tenantId: tenant.id,
        branchId: staffAttendance.branchId,
        staffId: staffAttendance.staffId,
        leaveTypeId: leaveType.id,
        startDate: new Date(),
        endDate: new Date(),
        totalDays: 1,
        reason: "Synthetic SchoolCast source integration QA",
        status: "PENDING"
      },
      select: { id: true }
    });
    temporary.leaveApplicationId = application.id;
    leaveAction = await db.staffLeaveApplicationAction.create({
      data: {
        tenantId: tenant.id,
        branchId: staffAttendance.branchId,
        applicationId: application.id,
        actorUserId: staffAttendance.updatedById ?? staffAttendance.markedById ?? actorUserId,
        action: "SUBMITTED",
        nextStatus: "PENDING",
        remarks: "Synthetic source integration QA"
      },
      select: {
        id: true,
        branchId: true,
        applicationId: true,
        branch: { select: { institutionId: true } }
      }
    });
  }

  let calendar = calendarEntries.find((entry) => entry.audiences.length > 0);
  if (!calendar) {
    calendar = await db.academicCalendarEntry.create({
      data: {
        tenantId: tenant.id,
        institutionId: studentAttendance.branch.institutionId,
        branchId: studentAttendance.branchId,
        academicYearId: studentAttendance.academicYearId,
        entryType: "HOLIDAY",
        name: "Synthetic SchoolCast source QA calendar",
        description: "Temporary staging-only integration fixture.",
        startDate: new Date(),
        endDate: new Date(),
        audiences: ["TEACHING_STAFF", "NON_TEACHING_STAFF"],
        createdById: actorUserId,
        updatedById: actorUserId
      },
      select: {
        id: true,
        branchId: true,
        academicYearId: true,
        institutionId: true,
        audiences: true
      }
    });
    temporary.calendarId = calendar.id;
  }

  let publication = existingPublication;
  if (!publication) {
    const enrollment = await db.enrollment.findFirst({
      where: {
        tenantId: tenant.id,
        branchId: studentAttendance.branchId,
        academicYearId: studentAttendance.academicYearId,
        status: "ACTIVE"
      },
      select: { id: true, studentId: true }
    });
    assert(enrollment, "Synthetic GradeBook publication fixture needs an active enrollment.");
    const fixture = await db.$transaction(async (tx) => {
      const term = await tx.gradebookExamTerm.create({
        data: {
          tenantId: tenant.id,
          institutionId: studentAttendance.branch.institutionId,
          branchId: studentAttendance.branchId,
          academicYearId: studentAttendance.academicYearId,
          code: qaCode,
          name: "Synthetic Source QA Term",
          sequence: 99,
          startDate: studentAttendance.academicYear.startDate,
          endDate: studentAttendance.academicYear.endDate,
          status: "ACTIVE",
          createdById: actorUserId,
          updatedById: actorUserId,
          activatedById: actorUserId,
          activatedAt: new Date()
        }
      });
      const examType = await tx.gradebookExamType.create({
        data: {
          tenantId: tenant.id,
          code: qaCode,
          name: "Synthetic Source QA Exam Type",
          category: "OTHER",
          requiresSchedule: false,
          status: "ACTIVE",
          createdById: actorUserId,
          updatedById: actorUserId,
          activatedAt: new Date()
        }
      });
      const exam = await tx.gradebookExam.create({
        data: {
          tenantId: tenant.id,
          institutionId: studentAttendance.branch.institutionId,
          branchId: studentAttendance.branchId,
          academicYearId: studentAttendance.academicYearId,
          termId: term.id,
          examTypeId: examType.id,
          code: qaCode,
          name: "Synthetic Source QA Examination",
          status: "APPROVED",
          createdById: actorUserId,
          updatedById: actorUserId,
          activatedById: actorUserId,
          activatedAt: new Date()
        }
      });
      const resultRun = await tx.gradebookResultRun.create({
        data: {
          tenantId: tenant.id,
          branchId: studentAttendance.branchId,
          academicYearId: studentAttendance.academicYearId,
          examId: exam.id,
          inputSnapshotHash: qaCode,
          configurationHash: qaCode,
          engineVersion: "synthetic-source-qa-v1",
          idempotencyKey: `schoolcast-source-qa:${runId}:result-run`,
          status: "APPROVED",
          startedById: actorUserId,
          approvedById: actorUserId,
          startedAt: new Date(),
          completedAt: new Date(),
          approvedAt: new Date(),
          configurationSnapshotJson: { syntheticQaRun: runId }
        }
      });
      const createdPublication = await tx.gradebookResultPublication.create({
        data: {
          tenantId: tenant.id,
          branchId: studentAttendance.branchId,
          academicYearId: studentAttendance.academicYearId,
          examId: exam.id,
          resultRunId: resultRun.id,
          audience: "STUDENT_AND_GUARDIAN",
          publicationVersion: 1,
          publishAt: new Date(),
          status: "PUBLISHED",
          readinessSnapshotJson: { syntheticQaRun: runId },
          preparedById: actorUserId,
          publishedById: actorUserId,
          publishedAt: new Date()
        }
      });
      await tx.gradebookStudentResultPublication.create({
        data: {
          tenantId: tenant.id,
          publicationId: createdPublication.id,
          enrollmentId: enrollment.id,
          studentId: enrollment.studentId,
          isEligible: true,
          publishedAt: new Date()
        }
      });
      return {
        termId: term.id,
        examTypeId: examType.id,
        examId: exam.id,
        resultRunId: resultRun.id,
        publication: {
          id: createdPublication.id,
          branchId: createdPublication.branchId,
          academicYearId: createdPublication.academicYearId,
          resultRunId: createdPublication.resultRunId,
          audience: createdPublication.audience
        }
      };
    });
    temporary.gradebookTermId = fixture.termId;
    temporary.gradebookExamTypeId = fixture.examTypeId;
    temporary.gradebookExamId = fixture.examId;
    temporary.gradebookResultRunId = fixture.resultRunId;
    temporary.gradebookPublicationId = fixture.publication.id;
    publication = fixture.publication;
  }

  const leaveAcademicYear = await db.academicYear.findFirst({
    where: { tenantId: tenant.id, institutionId: leaveAction.branch.institutionId },
    select: { id: true },
    orderBy: [{ isActive: "desc" }, { startDate: "desc" }]
  });
  assert(leaveAcademicYear, "Synthetic leave fixture has no academic year in its institution.");

  const calendarBranchId = calendar.branchId
    ?? await db.branch.findFirst({
      where: { tenantId: tenant.id, institutionId: calendar.institutionId, status: "ACTIVE" },
      select: { id: true }
    }).then((branch) => branch?.id ?? null);
  assert(calendarBranchId, "Synthetic calendar fixture has no active target branch.");
    qaPhase = "automation-enable";
    await db.tenantSettings.update({
      where: { tenantId: tenant.id },
      data: { schoolCastAutomationEnabled: true }
    });

    qaPhase = "source-enqueue";
    const eventInputs = [
      {
        tenantId: tenant.id,
        branchId: studentAttendance.branchId,
        academicYearId: studentAttendance.academicYearId,
        sourceModule: "ACADEMIA" as const,
        sourceEventId: `${studentAttendance.id}:qa:${runId}`,
        eventType: SCHOOLCAST_SOURCE_EVENTS.STUDENT_ATTENDANCE_RECORDED,
        sourceEntityType: "StudentAttendanceRecord",
        sourceEntityId: studentAttendance.id,
        payload: { syntheticQaRun: runId }
      },
      {
        tenantId: tenant.id,
        branchId: staffAttendance.branchId,
        academicYearId: staffAttendance.academicYearId,
        sourceModule: "STAFFBOARD" as const,
        sourceEventId: `${staffAttendance.id}:qa:${runId}`,
        eventType: SCHOOLCAST_SOURCE_EVENTS.STAFF_ATTENDANCE_RECORDED,
        sourceEntityType: "StaffAttendanceRecord",
        sourceEntityId: staffAttendance.id,
        payload: { syntheticQaRun: runId }
      },
      {
        tenantId: tenant.id,
        branchId: leaveAction.branchId,
        academicYearId: leaveAcademicYear.id,
        sourceModule: "STAFFBOARD" as const,
        sourceEventId: leaveAction.id,
        eventType: SCHOOLCAST_SOURCE_EVENTS.STAFF_LEAVE_CHANGED,
        sourceEntityType: "StaffLeaveApplication",
        sourceEntityId: leaveAction.applicationId,
        payload: { syntheticQaRun: runId }
      },
      {
        tenantId: tenant.id,
        branchId: calendarBranchId,
        academicYearId: calendar.academicYearId,
        sourceModule: "CAMPUSCORE" as const,
        sourceEventId: `${calendar.id}:qa:${runId}`,
        eventType: SCHOOLCAST_SOURCE_EVENTS.CALENDAR_CHANGED,
        sourceEntityType: "AcademicCalendarEntry",
        sourceEntityId: calendar.id,
        payload: { syntheticQaRun: runId }
      }
    ];

    for (const eventInput of eventInputs) {
      const queued = await db.$transaction((tx) => enqueueSchoolCastDomainEvent(tx, eventInput));
      assert.equal(queued.queued, true);
      assert(queued.eventId);
      createdEventIds.push(queued.eventId);
    }

    const duplicate = await db.$transaction((tx) => enqueueSchoolCastDomainEvent(tx, eventInputs[0]));
    assert.equal(duplicate.eventId, createdEventIds[0], "Duplicate source event created a second durable row.");

    const gradebookEvent = await db.gradebookDomainEventOutbox.create({
      data: {
        tenantId: tenant.id,
        branchId: publication.branchId,
        academicYearId: publication.academicYearId,
        eventType: SCHOOLCAST_SOURCE_EVENTS.GRADEBOOK_RESULT_PUBLISHED,
        aggregateType: "GradebookResultPublication",
        aggregateId: publication.id,
        payloadJson: {
          publicationId: publication.id,
          resultRunId: publication.resultRunId,
          audience: publication.audience,
          syntheticQaRun: runId
        },
        idempotencyKey: `schoolcast-source-qa:${runId}:gradebook`,
        correlationId: `schoolcast-source-qa:${runId}`
      },
      select: { id: true }
    });
    gradebookEventId = gradebookEvent.id;

    qaPhase = "gradebook-bridge";
    const gradebookBridge = await processGradebookSchoolCastEvents(workerInput);
    qaDiagnostic = { gradebookBridge };
    assert.equal(gradebookBridge.bridged, 1);
    assert.equal(gradebookBridge.workerErrors, 0);

    const gradebookDomainEvent = await db.schoolCastDomainEvent.findFirst({
      where: { tenantId: tenant.id, sourceModule: "GRADEBOOK", sourceEventId: gradebookEvent.id },
      select: { id: true }
    });
    assert(gradebookDomainEvent);
    createdEventIds.push(gradebookDomainEvent.id);

    qaPhase = "source-worker";
    const sourceRuns: Awaited<ReturnType<typeof processSchoolCastSourceEvents>>[] = [];
    for (let round = 0; round < 3; round += 1) {
      const run = await processSchoolCastSourceEvents({
        ...workerInput,
        workerId: `${workerInput.workerId}:round:${round}`
      });
      sourceRuns.push(run);
      const remaining = await db.schoolCastDomainEvent.count({
        where: { tenantId: tenant.id, id: { in: createdEventIds }, status: { in: ["PENDING", "PROCESSING"] } }
      });
      if (remaining === 0) break;
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 31_000));
    }
    const sourceRun = sourceRuns.reduce((summary, run) => ({
      claimed: summary.claimed + run.claimed,
      processed: summary.processed + run.processed,
      ignored: summary.ignored + run.ignored,
      retrying: summary.retrying + run.retrying,
      failed: summary.failed + run.failed,
      leaseLost: summary.leaseLost + run.leaseLost,
      workerErrors: summary.workerErrors + run.workerErrors
    }), {
      claimed: 0,
      processed: 0,
      ignored: 0,
      retrying: 0,
      failed: 0,
      leaseLost: 0,
      workerErrors: 0
    });
    qaDiagnostic = { ...qaDiagnostic, sourceRun, sourceRunCount: sourceRuns.length };
    assert.equal(sourceRun.processed, 5);
    assert.equal(sourceRun.workerErrors, 0);
    assert.equal(sourceRun.failed, 0);
    const events = await db.schoolCastDomainEvent.findMany({
      where: { tenantId: tenant.id, id: { in: createdEventIds } },
      select: { id: true, sourceModule: true, status: true }
    });
    assert.equal(events.length, 5);
    assert(events.every((event) => event.status === "PROCESSED"));

    qaPhase = "communication-verification";
    const communications = await db.schoolCastCommunication.findMany({
      where: { tenantId: tenant.id, sourceEntityVersionId: { in: createdEventIds } },
      select: { id: true, status: true }
    });
    communicationIds = communications.map((communication) => communication.id);
    qaDiagnostic = {
      ...qaDiagnostic,
      communicationCount: communications.length,
      communicationStatuses: communications.reduce<Record<string, number>>((counts, communication) => {
        counts[communication.status] = (counts[communication.status] ?? 0) + 1;
        return counts;
      }, {})
    };
    assert.equal(communications.length, 5);
    assert(communications.every((communication) => communication.status === "PUBLISHED"));

    qaPhase = "recipient-resolution";
    const [recipientSnapshots, inAppNotifications, outboxRows] = await db.$transaction([
      db.schoolCastRecipientSnapshot.findMany({
        where: { tenantId: tenant.id, communicationId: { in: communicationIds } },
        select: { id: true, communicationId: true }
      }),
      db.inAppNotification.findMany({
        where: { tenantId: tenant.id, communicationId: { in: communicationIds } },
        select: { id: true, communicationId: true }
      }),
      db.notificationOutbox.findMany({
        where: { tenantId: tenant.id, schoolCastCommunicationId: { in: communicationIds } },
        select: { id: true, channel: true, mode: true }
      })
    ]);
    outboxIds = outboxRows.map((row) => row.id);
    const snapshottedCommunicationIds = new Set(recipientSnapshots.map((snapshot) => snapshot.communicationId));
    qaDiagnostic = {
      ...qaDiagnostic,
      recipientSnapshotCount: recipientSnapshots.length,
      inAppNotificationCount: inAppNotifications.length,
      outboxCount: outboxRows.length,
      outboxChannels: outboxRows.reduce<Record<string, number>>((counts, row) => {
        counts[row.channel] = (counts[row.channel] ?? 0) + 1;
        return counts;
      }, {})
    };
    assert.equal(snapshottedCommunicationIds.size, communications.length, "Every source communication must resolve recipients.");
    assert(inAppNotifications.length > 0, "Synthetic source events produced no in-app notifications.");
    assert.equal(outboxRows.length, 0, "IN_APP-only staging must not create external-provider outbox rows.");

    qaPhase = "idempotent-replay";
    const replaySource = await processSchoolCastSourceEvents(workerInput);
    const replayGradebook = await processGradebookSchoolCastEvents(workerInput);
    assert.equal(replaySource.claimed, 0);
    assert.equal(replayGradebook.claimed, 0);

    result = {
      ok: true,
      target: "gradebook-mvp-staging",
      pilotTenant: PILOT_SLUG,
      sourceModules: ["ACADEMIA", "STAFFBOARD_ATTENDANCE", "STAFFBOARD_LEAVE", "CAMPUSCORE", "GRADEBOOK"],
      processedEvents: events.length,
      publishedCommunications: communications.length,
      recipientSnapshots: recipientSnapshots.length,
      inAppNotifications: inAppNotifications.length,
      externalDeliveryRows: outboxRows.length,
      inAppOnly: true,
      deliveryMode: "DRY_RUN",
      idempotentReplay: "pass",
      externalProviderRequests: 0,
      feeDesk: "excluded"
    };
  } finally {
    await db.tenantSettings.update({
      where: { tenantId: tenant.id },
      data: { schoolCastAutomationEnabled: previousAutomation }
    });

    if (createdEventIds.length > 0) {
      const linkedCommunications = await db.schoolCastCommunication.findMany({
        where: { tenantId: tenant.id, sourceEntityVersionId: { in: createdEventIds } },
        select: { id: true }
      });
      communicationIds = Array.from(new Set([
        ...communicationIds,
        ...linkedCommunications.map((communication) => communication.id)
      ]));
    }
    if (communicationIds.length > 0) {
      const linkedOutbox = await db.notificationOutbox.findMany({
        where: { tenantId: tenant.id, schoolCastCommunicationId: { in: communicationIds } },
        select: { id: true }
      });
      outboxIds = Array.from(new Set([...outboxIds, ...linkedOutbox.map((row) => row.id)]));
    }

    const auditEntityIds = [...createdEventIds, ...communicationIds, ...outboxIds];
    if (gradebookEventId) auditEntityIds.push(gradebookEventId);
    if (auditEntityIds.length > 0) {
      await db.auditLog.deleteMany({ where: { tenantId: tenant.id, entityId: { in: auditEntityIds } } });
    }
    if (communicationIds.length > 0) {
      await db.schoolCastCommunication.deleteMany({ where: { tenantId: tenant.id, id: { in: communicationIds } } });
    }
    if (createdEventIds.length > 0) {
      await db.schoolCastDomainEvent.deleteMany({ where: { tenantId: tenant.id, id: { in: createdEventIds } } });
    }
    if (gradebookEventId) {
      await db.gradebookDomainEventOutbox.deleteMany({ where: { tenantId: tenant.id, id: gradebookEventId } });
    }

    if (temporary.gradebookPublicationId) {
      await db.gradebookStudentResultPublication.deleteMany({
        where: { tenantId: tenant.id, publicationId: temporary.gradebookPublicationId }
      });
      await db.gradebookResultPublication.deleteMany({
        where: { tenantId: tenant.id, id: temporary.gradebookPublicationId }
      });
    }
    if (temporary.gradebookResultRunId) {
      await db.gradebookResultRun.deleteMany({ where: { tenantId: tenant.id, id: temporary.gradebookResultRunId } });
    }
    if (temporary.gradebookExamId) {
      await db.gradebookExam.deleteMany({ where: { tenantId: tenant.id, id: temporary.gradebookExamId } });
    }
    if (temporary.gradebookTermId) {
      await db.gradebookExamTerm.deleteMany({ where: { tenantId: tenant.id, id: temporary.gradebookTermId } });
    }
    if (temporary.gradebookExamTypeId) {
      await db.gradebookExamType.deleteMany({ where: { tenantId: tenant.id, id: temporary.gradebookExamTypeId } });
    }
    if (temporary.calendarId) {
      await db.academicCalendarEntry.deleteMany({ where: { tenantId: tenant.id, id: temporary.calendarId } });
    }
    if (temporary.leaveApplicationId) {
      await db.staffLeaveApplication.deleteMany({ where: { tenantId: tenant.id, id: temporary.leaveApplicationId } });
    }
    if (temporary.leaveTypeId) {
      await db.staffLeaveType.deleteMany({ where: { tenantId: tenant.id, id: temporary.leaveTypeId } });
    }
  }

  assert(result);
  await db.auditLog.create({
    data: {
      tenantId: tenant.id,
      actorUserId: null,
      action: "schoolcast.qa.source_cutover_certified",
      entityType: "SchoolCastQaRun",
      entityId: runId,
      metadataJson: {
        syntheticOnly: true,
        sourceModules: ["ACADEMIA", "STAFFBOARD", "CAMPUSCORE", "GRADEBOOK"],
        inAppOnly: true,
        deliveryMode: "DRY_RUN",
        externalProviderRequests: 0,
        feeDeskExcluded: true
      }
    }
  });

  return result;
}

main()
  .then((result) => console.log(JSON.stringify(result)))
  .catch((error: unknown) => {
    const prismaCode = error && typeof error === "object" && "code" in error
      && typeof error.code === "string" && /^P\d{4}$/.test(error.code)
      ? error.code
      : null;
    console.error(JSON.stringify({
      ok: false,
      phase: qaPhase,
      errorClass: error instanceof Error ? error.name : "UnknownError",
      diagnostic: qaDiagnostic,
      code: error instanceof Error && /^SCHOOLCAST_[A-Z0-9_]+$/.test(error.message)
        ? error.message
        : prismaCode
          ? `SCHOOLCAST_SOURCE_QA_${prismaCode}`
          : "SCHOOLCAST_SOURCE_QA_FAILED"
    }));
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
