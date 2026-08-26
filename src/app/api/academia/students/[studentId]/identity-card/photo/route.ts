import { NextResponse } from "next/server";
import { getSafeHttpStatus, mapActionError } from "@/lib/errors";
import { requireIdentityCardSchema } from "@/lib/schema-readiness/identity-cards";
import { getTenantContext } from "@/lib/tenant/context";
import { createStudentIdentityCardPhotoUrl } from "@/modules/academia/services/student-identity-card.service";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ studentId: string }>;
};

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const ctx = await getTenantContext();
    await requireIdentityCardSchema();
    const { studentId } = await params;
    const signedUrl = await createStudentIdentityCardPhotoUrl(ctx, studentId);
    return NextResponse.redirect(signedUrl, { status: 302 });
  } catch (error) {
    const safe = mapActionError(error, { fallbackMessage: "Unable to open this student photograph." });
    return NextResponse.json(safe, { status: getSafeHttpStatus(error) });
  }
}
