import { NextResponse } from "next/server";

import { getSafeHttpStatus, mapActionError } from "@/lib/errors";
import { getTenantContext } from "@/lib/tenant/context";
import {
  createSchoolCastAttachmentDownloadUrl,
  deleteSchoolCastAttachment,
} from "@/modules/schoolcast/services/attachment.service";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ homeworkItemId: string; attachmentId: string }>;
};

function safeError(error: unknown, fallbackMessage: string) {
  return NextResponse.json(mapActionError(error, { fallbackMessage }), {
    status: getSafeHttpStatus(error),
  });
}

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const ctx = await getTenantContext();
    const { homeworkItemId, attachmentId } = await params;
    const result = await createSchoolCastAttachmentDownloadUrl(
      ctx,
      { homeworkItemId },
      attachmentId,
    );
    return NextResponse.redirect(result.signedUrl, { status: 302 });
  } catch (error) {
    return safeError(error, "Unable to open this homework attachment.");
  }
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  try {
    const ctx = await getTenantContext();
    const { homeworkItemId, attachmentId } = await params;
    await deleteSchoolCastAttachment(ctx, { homeworkItemId }, attachmentId);
    return NextResponse.json({ success: true });
  } catch (error) {
    return safeError(error, "Unable to delete this homework attachment.");
  }
}