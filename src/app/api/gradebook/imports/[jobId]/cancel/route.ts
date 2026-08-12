import { NextResponse } from "next/server";

import { getSafeHttpStatus, mapActionError } from "@/lib/errors";
import { getTenantContext } from "@/lib/tenant/context";
import { cancelMarksImport } from "@/modules/gradebook/services";

export const runtime = "nodejs";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params;
    const job = await cancelMarksImport(await getTenantContext(), { importJobId: jobId });
    return NextResponse.json({ success: true, job: { id: job.id, status: job.status, cancelledAt: job.cancelledAt } });
  } catch (error) {
    const safe = mapActionError(error, { fallbackMessage: "Unable to cancel this marks import." });
    return NextResponse.json(safe, { status: getSafeHttpStatus(error) });
  }
}
