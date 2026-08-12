import { NextResponse } from "next/server";

import { AppError, getSafeHttpStatus, mapActionError } from "@/lib/errors";
import { getTenantContext } from "@/lib/tenant/context";
import { uploadAndValidateMarksImport } from "@/modules/gradebook/services";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      throw new AppError("GRADEBOOK_IMPORT_FILE_REQUIRED", "GRADEBOOK_IMPORT_FILE_REQUIRED", 400);
    }
    const job = await uploadAndValidateMarksImport(await getTenantContext(), {
      batchId: String(formData.get("batchId") ?? ""),
      file
    });
    return NextResponse.json({
      success: true,
      job: {
        id: job.id,
        status: job.status,
        totalRowCount: job.totalRowCount,
        validRowCount: job.validRowCount,
        invalidRowCount: job.invalidRowCount,
        warningRowCount: job.warningRowCount
      }
    }, { status: 201 });
  } catch (error) {
    const safe = mapActionError(error, {
      fallbackMessage: "Unable to validate this marks file.",
      validationMessage: "Check the marks file and try again."
    });
    return NextResponse.json(safe, { status: getSafeHttpStatus(error) });
  }
}
