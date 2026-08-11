import { NextResponse } from "next/server";
import { AppError, getSafeHttpStatus, mapActionError } from "@/lib/errors";
import { getTenantContext } from "@/lib/tenant/context";
import { idSchema } from "@/modules/academia/schemas/shared";
import { importStudentRows, validateStudentBulkImport } from "@/modules/academia/services/student-bulk.service";
import { parseStudentImportFile } from "@/modules/academia/services/student-bulk-workbook.service";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const ctx = await getTenantContext();
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) throw new AppError("STUDENT_IMPORT_FILE_REQUIRED", "STUDENT_IMPORT_FILE_REQUIRED", 400);
    const branchId = idSchema.parse(formData.get("branchId"));
    const parsed = await parseStudentImportFile(file, branchId);
    const validated = await validateStudentBulkImport(ctx, branchId, parsed.rows, parsed.errors);
    const hasBlockingError = validated.errors.some(
      (error) => error.row === 1 || error.field === "file"
    );
    if (hasBlockingError || !validated.rows.length) {
      return NextResponse.json({
        success: false,
        error: "No valid student rows are available to import.",
        errors: validated.errors.slice(0, 250)
      }, { status: 422 });
    }
    const result = await importStudentRows(ctx, branchId, validated.rows);
    const invalidRows = new Set(
      validated.errors.filter((error) => error.row > 1).map((error) => error.row)
    ).size;
    return NextResponse.json({
      success: true,
      message: invalidRows
        ? `${result.total} student records imported. ${invalidRows} invalid rows were skipped.`
        : `${result.total} student records imported successfully.`,
      summary: {
        totalRows: parsed.totalRows,
        validRows: result.total,
        invalidRows,
        importedRows: result.total,
        canImport: false,
        ...result
      },
      errors: validated.errors.slice(0, 250),
      truncatedErrors: validated.errors.length > 250
    });
  } catch (error) {
    const safe = mapActionError(error, {
      fallbackMessage: "Unable to import the validated student rows.",
      validationMessage: "Check the spreadsheet and try again."
    });
    return NextResponse.json(safe, {
      status: getSafeHttpStatus(error)
    });
  }
}
