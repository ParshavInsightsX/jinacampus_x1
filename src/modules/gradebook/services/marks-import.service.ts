import { createHash, randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import ExcelJS from "exceljs";
import { Prisma, type GradebookSpecialExamStatus } from "@prisma/client";
import type { TenantContext } from "@/lib/tenant/context";
import { writeAuditLog } from "@/lib/audit/audit-log";
import { db } from "@/lib/db";
import { AppError, notFound } from "@/lib/errors";
import { ensureGradebookStorageBucket, getGradebookStorageClient } from "@/lib/storage/supabase-storage";
import { GRADEBOOK_AUDIT_EVENTS } from "@/modules/gradebook/audit-events";
import {
  marksImportApplySchema,
  marksImportJobSchema,
  marksImportUploadSchema,
  marksTemplateRequestSchema
} from "@/modules/gradebook/schemas/import.schemas";
import { persistPreparedMarksDraft, prepareMarksDraft } from "@/modules/gradebook/services/marks-entry.service";
import { resolveGradebookRequestContext, type GradebookRequestContext } from "@/modules/gradebook/services/request-context.service";

const TEMPLATE_VERSION = 1;
const EDITABLE_BATCH_STATUSES = ["NOT_STARTED", "IN_PROGRESS", "RETURNED"] as const;
const SPECIAL_STATUSES = new Set<GradebookSpecialExamStatus>([
  "ABSENT",
  "MEDICAL_LEAVE",
  "EXEMPTED",
  "NOT_APPLICABLE",
  "WITHHELD",
  "RESULT_PENDING"
]);
const SPECIAL_STATUS_ALIASES: Readonly<Record<string, GradebookSpecialExamStatus>> = {
  MEDICAL: "MEDICAL_LEAVE",
  EXEMPT: "EXEMPTED",
  PENDING: "RESULT_PENDING",
  NA: "NOT_APPLICABLE",
  N_A: "NOT_APPLICABLE"
};

type ImportCell = {
  componentId: string;
  marksObtained: number | null;
  specialStatus: GradebookSpecialExamStatus | null;
};

type StagedRow = {
  rowNumber: number;
  enrollmentId: string | null;
  parsedValue: Record<string, unknown>;
  normalisedValue: { entries: ImportCell[] } | null;
  errors: string[];
  warnings: string[];
};

function conflict(code: string) {
  return new AppError(code, code, 409);
}

function safeSpreadsheetText(value: string) {
  return /^[=+\-@]/.test(value) ? `'${value}` : value;
}

function safeObjectName(name: string) {
  const extension = name.toLowerCase().endsWith(".csv") ? ".csv" : ".xlsx";
  const stem = name.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "marks-import";
  return `${stem.slice(0, 80)}${extension}`;
}

function studentName(student: { displayName: string | null; fullName: string | null; firstName: string; middleName: string | null; lastName: string | null }) {
  return student.displayName || student.fullName || [student.firstName, student.middleName, student.lastName].filter(Boolean).join(" ");
}

async function loadImportBatch(request: GradebookRequestContext, batchId: string) {
  const batch = await db.gradebookMarkEntryBatch.findFirst({
    where: {
      id: batchId,
      tenantId: request.tenantId,
      branchId: request.branchId,
      academicYearId: request.academicYearId
    },
    include: {
      teacherAssignment: true,
      exam: { select: { id: true, code: true, name: true } },
      examClassSection: {
        include: { classSection: { include: { academicClass: true, section: true } } }
      },
      examSubject: {
        include: { subject: true, components: { orderBy: { displayOrder: "asc" } } }
      }
    }
  });
  if (!batch) throw notFound("GRADEBOOK_MARK_BATCH_NOT_FOUND");
  const canManage = request.permissions.has("gradebook.marks.verify") || request.permissions.has("gradebook.assignment.manage");
  if (!canManage && batch.teacherAssignment.teacherUserId !== request.userId) {
    throw notFound("GRADEBOOK_MARK_BATCH_NOT_FOUND");
  }
  if (!EDITABLE_BATCH_STATUSES.includes(batch.status as (typeof EDITABLE_BATCH_STATUSES)[number])) {
    throw conflict("GRADEBOOK_MARK_BATCH_NOT_EDITABLE");
  }
  return batch;
}

async function loadRoster(request: GradebookRequestContext, batch: Awaited<ReturnType<typeof loadImportBatch>>) {
  const rosterIds = Array.isArray(batch.rosterSnapshotJson)
    ? batch.rosterSnapshotJson.flatMap((value) => {
      if (typeof value === "string") return [value];
      if (value && typeof value === "object" && "enrollmentId" in value && typeof value.enrollmentId === "string") return [value.enrollmentId];
      return [];
    })
    : [];
  if (rosterIds.length === 0) throw conflict("GRADEBOOK_FROZEN_ROSTER_EMPTY");
  const enrollments = await db.enrollment.findMany({
    where: { tenantId: request.tenantId, id: { in: rosterIds } },
    include: { student: true },
    orderBy: [{ rollNumber: "asc" }, { student: { firstName: "asc" } }]
  });
  if (enrollments.length !== rosterIds.length) throw conflict("GRADEBOOK_FROZEN_ROSTER_MISMATCH");
  return enrollments;
}

function componentHeader(component: { componentCode: string; componentName: string }) {
  return `${component.componentCode} - ${component.componentName}`;
}

export async function buildMarksImportTemplate(ctx: TenantContext, input: unknown) {
  const request = await resolveGradebookRequestContext(ctx, { permission: "gradebook.import.download_template", feature: "import" });
  const data = marksTemplateRequestSchema.parse(input);
  const batch = await loadImportBatch(request, data.batchId);
  const roster = await loadRoster(request, batch);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "JinaCampus GradeBook";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Marks", { views: [{ state: "frozen", ySplit: 1 }] });
  sheet.columns = [
    { header: "Enrollment ID", key: "enrollmentId", width: 38 },
    { header: "Scholar Number", key: "scholarNumber", width: 18 },
    { header: "Student Name", key: "studentName", width: 34 },
    ...batch.examSubject.components.map((component) => ({
      header: componentHeader(component),
      key: component.id,
      width: 22
    }))
  ];
  sheet.getRow(1).font = { bold: true };
  sheet.getColumn(1).hidden = true;
  for (const enrollment of roster) {
    const row: Record<string, string> = {
      enrollmentId: enrollment.id,
      scholarNumber: safeSpreadsheetText(enrollment.student.admissionNumber),
      studentName: safeSpreadsheetText(studentName(enrollment.student))
    };
    for (const component of batch.examSubject.components) row[component.id] = "";
    sheet.addRow(row);
  }
  sheet.protect("jinacampus-template", {
    selectLockedCells: true,
    selectUnlockedCells: true,
    formatColumns: false,
    formatRows: false,
    insertRows: false,
    deleteRows: false
  });
  for (let column = 4; column <= sheet.columnCount; column += 1) {
    sheet.getColumn(column).eachCell((cell, rowNumber) => {
      if (rowNumber > 1) cell.protection = { locked: false };
    });
  }

  const instructions = workbook.addWorksheet("Instructions");
  instructions.addRows([
    ["JinaCampus GradeBook marks import"],
    ["Exam", `${batch.exam.code} - ${batch.exam.name}`],
    ["Class-section", `${batch.examClassSection.classSection.academicClass.name} - ${batch.examClassSection.classSection.section.name}`],
    ["Subject", batch.examSubject.subject.name],
    ["Template version", TEMPLATE_VERSION],
    ["Rules", "Enter a number within the component maximum or one of: ABSENT, MEDICAL, EXEMPT, NOT_APPLICABLE, WITHHELD, PENDING."],
    ["Security", "Do not change protected identifiers, headers, worksheet names, or add formulas."]
  ]);
  instructions.getColumn(1).width = 22;
  instructions.getColumn(2).width = 90;
  const metadata = workbook.addWorksheet("_JinaCampus");
  metadata.state = "veryHidden";
  metadata.addRows([["templateVersion", TEMPLATE_VERSION], ["batchId", batch.id], ["batchVersion", batch.version]]);

  const content = data.format === "csv"
    ? Buffer.from(await workbook.csv.writeBuffer({ sheetName: "Marks" }))
    : Buffer.from(await workbook.xlsx.writeBuffer());
  await writeAuditLog({
    ctx: request,
    action: "gradebook.import.template_downloaded",
    entityType: "GradebookMarkEntryBatch",
    entityId: batch.id,
    branchId: request.branchId,
    academicYearId: request.academicYearId,
    metadata: { format: data.format, templateVersion: TEMPLATE_VERSION, correlationId: request.correlationId }
  });
  return {
    content,
    contentType: data.format === "csv" ? "text/csv" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    fileName: `${batch.exam.code}-${batch.examSubject.subject.code}-marks.${data.format}`
  };
}

function textCell(cell: ExcelJS.Cell) {
  if (cell.type === ExcelJS.ValueType.Formula || (typeof cell.value === "object" && cell.value !== null && "formula" in cell.value)) {
    return { value: "", formula: true };
  }
  return { value: cell.text.trim(), formula: false };
}

export function parseMarkCell(value: string, maximumMarks: number): { entry: Omit<ImportCell, "componentId"> | null; error: string | null } {
  if (!value) return { entry: null, error: "A mark or special status is required." };
  const upper = value.toUpperCase().replace(/\s+/g, "_");
  const status = SPECIAL_STATUS_ALIASES[upper] ?? (SPECIAL_STATUSES.has(upper as GradebookSpecialExamStatus) ? upper as GradebookSpecialExamStatus : null);
  if (status) {
    return { entry: { marksObtained: null, specialStatus: status }, error: null };
  }
  if (/^[=+@]/.test(value)) return { entry: null, error: "Spreadsheet formulas are not allowed." };
  const number = Number(value);
  if (!Number.isFinite(number)) return { entry: null, error: "Enter a valid number or recognised special status." };
  if (number < 0 || number > maximumMarks) return { entry: null, error: `Marks must be between 0 and ${maximumMarks}.` };
  return { entry: { marksObtained: number, specialStatus: null }, error: null };
}

async function parseImportFile(
  bytes: Buffer,
  originalFileName: string,
  batch: Awaited<ReturnType<typeof loadImportBatch>>,
  roster: Awaited<ReturnType<typeof loadRoster>>
) {
  const workbook = new ExcelJS.Workbook();
  if (originalFileName.toLowerCase().endsWith(".csv")) await workbook.csv.read(Readable.from(bytes));
  else await workbook.xlsx.load(bytes as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  const sheet = workbook.getWorksheet("Marks") ?? workbook.worksheets.find((candidate) => candidate.state === "visible");
  if (!sheet) throw new AppError("GRADEBOOK_IMPORT_WORKSHEET_MISSING", "GRADEBOOK_IMPORT_WORKSHEET_MISSING", 400);
  const metadata = workbook.getWorksheet("_JinaCampus");
  if (metadata) {
    const batchId = metadata.getRow(2).getCell(2).text.trim();
    const version = Number(metadata.getRow(1).getCell(2).value);
    if (batchId !== batch.id || version !== TEMPLATE_VERSION) throw conflict("GRADEBOOK_IMPORT_TEMPLATE_MISMATCH");
  }

  const headers = new Map<string, number>();
  sheet.getRow(1).eachCell((cell, column) => headers.set(cell.text.trim().toLowerCase(), column));
  const enrollmentColumn = headers.get("enrollment id");
  const scholarColumn = headers.get("scholar number");
  if (!enrollmentColumn && !scholarColumn) throw new AppError("GRADEBOOK_IMPORT_IDENTIFIER_COLUMN_MISSING", "GRADEBOOK_IMPORT_IDENTIFIER_COLUMN_MISSING", 400);
  const componentColumns = batch.examSubject.components.map((component) => ({
    component,
    column: headers.get(componentHeader(component).toLowerCase())
  }));
  if (componentColumns.some(({ column }) => !column)) throw conflict("GRADEBOOK_IMPORT_COMPONENT_HEADERS_MISMATCH");

  const byId = new Map(roster.map((enrollment) => [enrollment.id, enrollment]));
  const byScholar = new Map(roster.map((enrollment) => [enrollment.student.admissionNumber.toLowerCase(), enrollment]));
  const seen = new Set<string>();
  const rows: StagedRow[] = [];
  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    if (!row.hasValues) continue;
    const enrollmentId = enrollmentColumn ? row.getCell(enrollmentColumn).text.trim() : "";
    const scholarNumber = scholarColumn ? row.getCell(scholarColumn).text.trim() : "";
    const enrollment = byId.get(enrollmentId) ?? byScholar.get(scholarNumber.toLowerCase());
    const errors: string[] = [];
    const warnings: string[] = [];
    if (!enrollment) errors.push("Student is not in this batch's frozen roster.");
    else if (seen.has(enrollment.id)) errors.push("Duplicate student row.");
    else seen.add(enrollment.id);

    const entries: ImportCell[] = [];
    const parsedComponents: Record<string, string> = {};
    for (const { component, column } of componentColumns) {
      if (!column) continue;
      const cell = textCell(row.getCell(column));
      parsedComponents[component.componentCode] = cell.value;
      if (cell.formula) {
        errors.push(`${component.componentCode}: spreadsheet formulas are not allowed.`);
        continue;
      }
      const parsed = parseMarkCell(cell.value, Number(component.maximumMarks));
      if (parsed.error) errors.push(`${component.componentCode}: ${parsed.error}`);
      if (parsed.entry) entries.push({ componentId: component.id, ...parsed.entry });
    }
    rows.push({
      rowNumber,
      enrollmentId: enrollment?.id ?? null,
      parsedValue: { enrollmentId, scholarNumber, components: parsedComponents },
      normalisedValue: enrollment && errors.length === 0 ? { entries } : null,
      errors,
      warnings
    });
  }
  if (rows.length === 0) throw new AppError("GRADEBOOK_IMPORT_EMPTY", "GRADEBOOK_IMPORT_EMPTY", 400);
  return rows;
}

export async function uploadAndValidateMarksImport(ctx: TenantContext, input: { batchId: string; file: File }) {
  const request = await resolveGradebookRequestContext(ctx, { permission: "gradebook.import.create", feature: "import" });
  const data = marksImportUploadSchema.parse({ batchId: input.batchId });
  const batch = await loadImportBatch(request, data.batchId);
  const roster = await loadRoster(request, batch);
  const { client, bucket, importMaxBytes } = getGradebookStorageClient();
  if (!(input.file instanceof File) || input.file.size === 0) throw new AppError("GRADEBOOK_IMPORT_FILE_REQUIRED", "GRADEBOOK_IMPORT_FILE_REQUIRED", 400);
  if (input.file.size > importMaxBytes) throw new AppError("GRADEBOOK_IMPORT_FILE_TOO_LARGE", "GRADEBOOK_IMPORT_FILE_TOO_LARGE", 400);
  const name = input.file.name.toLowerCase();
  if (!name.endsWith(".xlsx") && !name.endsWith(".csv")) throw new AppError("GRADEBOOK_IMPORT_FILE_TYPE_NOT_ALLOWED", "GRADEBOOK_IMPORT_FILE_TYPE_NOT_ALLOWED", 400);
  const bytes = Buffer.from(await input.file.arrayBuffer());
  const fileHash = createHash("sha256").update(bytes).digest("hex");
  const existing = await db.gradebookExamImportJob.findFirst({ where: { tenantId: request.tenantId, markEntryBatchId: batch.id, fileHash } });
  if (existing) return existing;

  const rows = await parseImportFile(bytes, input.file.name, batch, roster);
  await ensureGradebookStorageBucket();
  const jobId = randomUUID();
  const objectKey = `${request.tenantId}/${request.branchId}/${request.academicYearId}/imports/${jobId}/${safeObjectName(input.file.name)}`;
  const contentType = name.endsWith(".csv") ? "text/csv" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  const { error: uploadError } = await client.storage.from(bucket).upload(objectKey, bytes, { contentType, cacheControl: "0", upsert: false });
  if (uploadError) throw new AppError("GRADEBOOK_IMPORT_UPLOAD_FAILED", "GRADEBOOK_IMPORT_UPLOAD_FAILED", 503);

  const validRowCount = rows.filter((row) => row.errors.length === 0).length;
  const invalidRowCount = rows.length - validRowCount;
  const warningRowCount = rows.filter((row) => row.warnings.length > 0).length;
  try {
    return await db.$transaction(async (tx) => {
      const job = await tx.gradebookExamImportJob.create({
        data: {
          id: jobId,
          tenantId: request.tenantId,
          branchId: request.branchId,
          academicYearId: request.academicYearId,
          markEntryBatchId: batch.id,
          originalFileName: input.file.name.slice(0, 255),
          originalObjectKey: objectKey,
          fileHash,
          templateVersion: TEMPLATE_VERSION,
          status: invalidRowCount === 0 ? "READY_TO_APPLY" : "VALIDATED",
          totalRowCount: rows.length,
          validRowCount,
          invalidRowCount,
          warningRowCount,
          uploadedById: request.userId,
          rows: {
            create: rows.map((row) => ({
              tenantId: request.tenantId,
              rowNumber: row.rowNumber,
              enrollmentId: row.enrollmentId,
              parsedValueJson: row.parsedValue as Prisma.InputJsonValue,
              normalisedValueJson: row.normalisedValue as Prisma.InputJsonValue | undefined,
              validationErrorsJson: row.errors as Prisma.InputJsonValue,
              validationWarningsJson: row.warnings as Prisma.InputJsonValue,
              isValid: row.errors.length === 0
            }))
          }
        }
      });
      await writeAuditLog({
        ctx: request,
        action: GRADEBOOK_AUDIT_EVENTS.IMPORT_VALIDATED,
        entityType: "GradebookExamImportJob",
        entityId: job.id,
        branchId: request.branchId,
        academicYearId: request.academicYearId,
        after: { status: job.status, totalRowCount: rows.length, validRowCount, invalidRowCount, warningRowCount, fileHash },
        metadata: { correlationId: request.correlationId, templateVersion: TEMPLATE_VERSION }
      }, tx);
      return job;
    });
  } catch (error) {
    await client.storage.from(bucket).remove([objectKey]);
    throw error;
  }
}

export async function getMarksImportJob(ctx: TenantContext, input: unknown) {
  const request = await resolveGradebookRequestContext(ctx, { permission: "gradebook.import.validate", feature: "import" });
  const { importJobId } = marksImportJobSchema.parse(input);
  const job = await db.gradebookExamImportJob.findFirst({
    where: { id: importJobId, tenantId: request.tenantId, branchId: request.branchId, academicYearId: request.academicYearId },
    include: { rows: { orderBy: { rowNumber: "asc" } }, batch: { include: { teacherAssignment: true } } }
  });
  if (!job) throw notFound("GRADEBOOK_IMPORT_JOB_NOT_FOUND");
  const canManage = request.permissions.has("gradebook.marks.verify") || request.permissions.has("gradebook.assignment.manage");
  if (!canManage && job.batch.teacherAssignment.teacherUserId !== request.userId) throw notFound("GRADEBOOK_IMPORT_JOB_NOT_FOUND");
  return job;
}

export async function applyMarksImport(ctx: TenantContext, input: unknown) {
  const request = await resolveGradebookRequestContext(ctx, { permission: "gradebook.import.apply", feature: "import" });
  const data = marksImportApplySchema.parse(input);
  const job = await getMarksImportJob(ctx, { importJobId: data.importJobId });
  if (job.status === "APPLIED") return job;
  if (job.status !== "READY_TO_APPLY" || job.invalidRowCount !== 0) throw conflict("GRADEBOOK_IMPORT_NOT_READY");
  const entries = job.rows.flatMap((row) => {
    if (!row.enrollmentId || !row.isValid || !row.normalisedValueJson || typeof row.normalisedValueJson !== "object") return [];
    const value = row.normalisedValueJson as { entries?: ImportCell[] };
    return (value.entries ?? []).map((entry) => ({
      enrollmentId: row.enrollmentId!,
      componentId: entry.componentId,
      value: entry.specialStatus
        ? { kind: "SPECIAL_STATUS" as const, status: entry.specialStatus, reason: "Imported special examination status." }
        : { kind: "NUMERIC" as const, marksObtained: entry.marksObtained! }
    }));
  });
  const applyIdempotencyKey = createHash("sha256").update(`${request.tenantId}:${job.id}:${job.fileHash}`).digest("hex");
  const prepared = await prepareMarksDraft(ctx, {
    batchId: job.markEntryBatchId,
    expectedVersion: data.expectedBatchVersion,
    entries
  });
  try {
    return await db.$transaction(async (tx) => {
      const claimed = await tx.gradebookExamImportJob.updateMany({
        where: { id: job.id, tenantId: request.tenantId, status: "READY_TO_APPLY", applyIdempotencyKey: null },
        data: { status: "APPLYING", applyIdempotencyKey }
      });
      if (claimed.count !== 1) {
        const current = await tx.gradebookExamImportJob.findFirst({ where: { id: job.id, tenantId: request.tenantId } });
        if (current?.status === "APPLIED") return current;
        throw conflict("GRADEBOOK_IMPORT_ALREADY_PROCESSING");
      }
      await persistPreparedMarksDraft(tx, prepared);
      const appliedAt = new Date();
      const updated = await tx.gradebookExamImportJob.update({ where: { id: job.id }, data: { status: "APPLIED", appliedAt, appliedById: request.userId } });
      await tx.gradebookExamImportRow.updateMany({ where: { tenantId: request.tenantId, importJobId: job.id, isValid: true }, data: { appliedAt } });
      await writeAuditLog({
        ctx: request,
        action: GRADEBOOK_AUDIT_EVENTS.IMPORT_APPLIED,
        entityType: "GradebookExamImportJob",
        entityId: job.id,
        branchId: request.branchId,
        academicYearId: request.academicYearId,
        before: { status: job.status },
        after: { status: updated.status, appliedRowCount: job.validRowCount, applyIdempotencyKey },
        metadata: { correlationId: request.correlationId, fileHash: job.fileHash }
      }, tx);
      return updated;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    await db.gradebookExamImportJob.updateMany({
      where: { id: job.id, tenantId: request.tenantId, status: { in: ["READY_TO_APPLY", "APPLYING"] } },
      data: {
        status: "FAILED",
        applyIdempotencyKey,
        failureCode: "GRADEBOOK_IMPORT_APPLY_FAILED",
        failureSummary: "The validated import could not be applied. No marks were changed."
      }
    });
    throw error;
  }
}

export async function cancelMarksImport(ctx: TenantContext, input: unknown) {
  const request = await resolveGradebookRequestContext(ctx, { permission: "gradebook.import.cancel", feature: "import" });
  const { importJobId } = marksImportJobSchema.parse(input);
  const job = await getMarksImportJob(ctx, { importJobId });
  if (["APPLIED", "APPLYING", "CANCELLED"].includes(job.status)) throw conflict("GRADEBOOK_IMPORT_NOT_CANCELLABLE");
  return db.$transaction(async (tx) => {
    const cancelledAt = new Date();
    const updated = await tx.gradebookExamImportJob.update({ where: { id: job.id }, data: { status: "CANCELLED", cancelledAt, cancelledById: request.userId } });
    await writeAuditLog({
      ctx: request,
      action: "gradebook.import.cancelled",
      entityType: "GradebookExamImportJob",
      entityId: job.id,
      branchId: request.branchId,
      academicYearId: request.academicYearId,
      before: { status: job.status },
      after: { status: updated.status },
      metadata: { correlationId: request.correlationId }
    }, tx);
    return updated;
  });
}
