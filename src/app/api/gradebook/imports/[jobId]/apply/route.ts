import { NextResponse } from "next/server";

import { getSafeHttpStatus, mapActionError } from "@/lib/errors";
import { getTenantContext } from "@/lib/tenant/context";
import { applyMarksImport } from "@/modules/gradebook/services";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params;
    const body = await request.json();
    const job = await applyMarksImport(await getTenantContext(), {
      importJobId: jobId,
      expectedBatchVersion: (body as { expectedBatchVersion?: unknown }).expectedBatchVersion
    });
    return NextResponse.json({ success: true, job: { id: job.id, status: job.status, appliedAt: job.appliedAt } });
  } catch (error) {
    const safe = mapActionError(error, { fallbackMessage: "Unable to apply this marks import." });
    return NextResponse.json(safe, { status: getSafeHttpStatus(error) });
  }
}
