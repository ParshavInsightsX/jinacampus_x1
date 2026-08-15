import { NextResponse } from "next/server";

import { getSafeHttpStatus, mapActionError } from "@/lib/errors";
import { getTenantContext } from "@/lib/tenant/context";
import {
  createSchoolCastAttachmentDownloadUrl,
  deleteSchoolCastAttachment,
} from "@/modules/schoolcast/services/attachment.service";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ communicationId: string; attachmentId: string }>;
};

function errorResponse(error: unknown, fallbackMessage: string) {
  return NextResponse.json(mapActionError(error, { fallbackMessage }), {
    status: getSafeHttpStatus(error),
  });
}

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const ctx = await getTenantContext();
    const { communicationId, attachmentId } = await params;
    const result = await createSchoolCastAttachmentDownloadUrl(
      ctx,
      { communicationId },
      attachmentId,
    );
    return NextResponse.redirect(result.signedUrl, { status: 302 });
  } catch (error) {
    return errorResponse(error, "Unable to open this attachment.");
  }
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  try {
    const ctx = await getTenantContext();
    const { communicationId, attachmentId } = await params;
    await deleteSchoolCastAttachment(ctx, { communicationId }, attachmentId);
    return NextResponse.json({ success: true });
  } catch (error) {
    return errorResponse(error, "Unable to delete this attachment.");
  }
}