import { NextResponse } from "next/server";

import { AppError, getSafeHttpStatus, mapActionError } from "@/lib/errors";
import { getTenantContext } from "@/lib/tenant/context";
import { uploadSchoolCastAttachment } from "@/modules/schoolcast/services/attachment.service";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ homeworkItemId: string }> },
) {
  try {
    const ctx = await getTenantContext();
    const { homeworkItemId } = await params;
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
      homeworkItemId,
      file,
    });
    return NextResponse.json({ success: true, attachment }, { status: 201 });
  } catch (error) {
    return NextResponse.json(mapActionError(error, {
      fallbackMessage: "Unable to upload this homework attachment.",
      validationMessage: "Choose a supported file and try again.",
    }), { status: getSafeHttpStatus(error) });
  }
}