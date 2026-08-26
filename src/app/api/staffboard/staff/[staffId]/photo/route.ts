import { NextResponse } from "next/server";
import { getSafeHttpStatus, mapActionError } from "@/lib/errors";
import { requireIdentityCardSchema } from "@/lib/schema-readiness/identity-cards";
import { getTenantContext } from "@/lib/tenant/context";
import {
  createStaffProfilePhotoDownloadUrl,
  deleteStaffProfilePhoto,
  uploadStaffProfilePhoto
} from "@/modules/staffboard-lite/services/staff-profile-photo.service";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ staffId: string }>;
};

function errorResponse(error: unknown, fallbackMessage: string) {
  const safe = mapActionError(error, { fallbackMessage });
  return NextResponse.json(safe, { status: getSafeHttpStatus(error) });
}

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const ctx = await getTenantContext();
    await requireIdentityCardSchema();
    const { staffId } = await params;
    const signedUrl = await createStaffProfilePhotoDownloadUrl(ctx, staffId);
    return NextResponse.redirect(signedUrl, { status: 302 });
  } catch (error) {
    return errorResponse(error, "Unable to open this staff photograph.");
  }
}

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const ctx = await getTenantContext();
    await requireIdentityCardSchema();
    const { staffId } = await params;
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ ok: false, error: "Choose a JPEG, PNG, or WebP photograph." }, { status: 400 });
    }
    const photo = await uploadStaffProfilePhoto(ctx, { staffId, file });
    return NextResponse.json({ ok: true, data: { id: photo.id } });
  } catch (error) {
    return errorResponse(error, "Unable to upload this staff photograph.");
  }
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  try {
    const ctx = await getTenantContext();
    await requireIdentityCardSchema();
    const { staffId } = await params;
    await deleteStaffProfilePhoto(ctx, staffId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error, "Unable to remove this staff photograph.");
  }
}
