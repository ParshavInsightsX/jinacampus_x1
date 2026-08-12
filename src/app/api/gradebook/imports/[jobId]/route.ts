import { NextResponse } from "next/server";

import { getSafeHttpStatus, mapActionError } from "@/lib/errors";
import { getTenantContext } from "@/lib/tenant/context";
import { getMarksImportJob } from "@/modules/gradebook/services";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params;
    const job = await getMarksImportJob(await getTenantContext(), { importJobId: jobId });
    return NextResponse.json({
      success: true,
      job: {
        id: job.id,
        originalFileName: job.originalFileName,
        status: job.status,
        totalRowCount: job.totalRowCount,
        validRowCount: job.validRowCount,
        invalidRowCount: job.invalidRowCount,
        warningRowCount: job.warningRowCount,
        failureCode: job.failureCode,
        createdAt: job.createdAt,
        appliedAt: job.appliedAt,
        rows: job.rows.map((row) => ({
          rowNumber: row.rowNumber,
          isValid: row.isValid,
          validationErrors: row.validationErrorsJson,
          validationWarnings: row.validationWarningsJson,
          appliedAt: row.appliedAt
        }))
      }
    });
  } catch (error) {
    const safe = mapActionError(error, { fallbackMessage: "Unable to load this marks import." });
    return NextResponse.json(safe, { status: getSafeHttpStatus(error) });
  }
}
