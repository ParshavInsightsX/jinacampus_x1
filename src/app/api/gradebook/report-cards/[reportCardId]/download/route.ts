import { NextResponse } from "next/server";

import { getSafeHttpStatus, mapActionError } from "@/lib/errors";
import { getTenantContext } from "@/lib/tenant/context";
import { createReportCardDownloadUrl } from "@/modules/gradebook/services";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ reportCardId: string }> }
) {
  try {
    const { reportCardId } = await params;
    const signedUrl = await createReportCardDownloadUrl(await getTenantContext(), { reportCardId });
    return NextResponse.redirect(signedUrl, { status: 302 });
  } catch (error) {
    const safe = mapActionError(error, { fallbackMessage: "Unable to open this report card." });
    return NextResponse.json(safe, { status: getSafeHttpStatus(error) });
  }
}
