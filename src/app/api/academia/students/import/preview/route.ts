import { NextResponse } from "next/server";
import { AppError, getSafeHttpStatus, mapActionError } from "@/lib/errors";
import { getTenantContext } from "@/lib/tenant/context";
import { idSchema } from "@/modules/academia/schemas/shared";
import { validateStudentBulkImport } from "@/modules/academia/services/student-bulk.service";
import { parseStudentImportFile } from "@/modules/academia/services/student-bulk-workbook.service";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const ctx = await getTenantContext();
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) throw new AppError("STUDENT_IMPORT_FILE_REQUIRED", "STUDENT_IMPORT_FILE_REQUIRED", 400);
    const branchId = idSchema.parse(formData.get("branchId"));
    const parsed = await parseStudentImportFile(file, branchId);
    const validated = await validateStudentBulkImport(ctx, branchId, parsed.rows, parsed.errors);
    const invalidRows = new Set(
      validated.errors.filter((error) => error.row > 1).map((error) => error.row)
    ).size;
    const hasBlockingError = validated.errors.some(
      (error) => error.row === 1 || error.field === "file"
    );
    return NextResponse.json({
      success: true,
      summary: {
        totalRows: parsed.totalRows,
        validRows: validated.validRows,
        invalidRows,
        canImport: validated.rows.length > 0 && !hasBlockingError
      },
      errors: validated.errors.slice(0, 250),
      truncatedErrors: validated.errors.length > 250
    });
  } catch (error) {
    const safe = mapActionError(error, {
      fallbackMessage: "Unable to preview this student file.",
      validationMessage: "Check the spreadsheet and try again."
    });
    return NextResponse.json(safe, {
      status: getSafeHttpStatus(error)
    });
  }
}
