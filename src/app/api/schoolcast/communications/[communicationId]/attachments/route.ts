import { NextResponse } from "next/server";

import { AppError, getSafeHttpStatus, mapActionError } from "@/lib/errors";
import { getTenantContext } from "@/lib/tenant/context";
import { uploadSchoolCastAttachment } from "@/modules/schoolcast/services/attachment.service";

export const runtime = "nodejs";

function errorResponse(error: unknown) {
  const safe = mapActionError(error, {
    fallbackMessage: "Unable to upload this attachment. Please try again.",
    validationMessage: "Choose a supported file and try again.",
  });
  return NextResponse.json(safe, { status: getSafeHttpStatus(error) });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ communicationId: string }> },
) {
  try {
    const ctx = await getTenantContext();
    const { communicationId } = await params;
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      throw new AppError(
        "SCHOOLCAST_ATTACHMENT_FILE_REQUIRED",
        "SCHOOLCAST_ATTACHMENT_FILE_REQUIRED",
        400,
      );
    }
    const attachment = await uploadSchoolCastAttachment(ctx, {
      communicationId,
      file,
    });
    return NextResponse.json({ success: true, attachment }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}