import { NextResponse } from "next/server";

import { getSafeHttpStatus, mapActionError } from "@/lib/errors";
import { getTenantContext } from "@/lib/tenant/context";
import { buildMarksImportTemplate } from "@/modules/gradebook/services";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const template = await buildMarksImportTemplate(await getTenantContext(), {
      batchId: url.searchParams.get("batchId"),
      format: url.searchParams.get("format") ?? "xlsx"
    });
    return new NextResponse(new Uint8Array(template.content), {
      headers: {
        "Content-Type": template.contentType,
        "Content-Disposition": `attachment; filename="${template.fileName.replace(/[\r\n\"]/g, "-")}"`,
        "Cache-Control": "private, no-store"
      }
    });
  } catch (error) {
    const safe = mapActionError(error, {
      fallbackMessage: "Unable to create the marks import template."
    });
    return NextResponse.json(safe, { status: getSafeHttpStatus(error) });
  }
}
