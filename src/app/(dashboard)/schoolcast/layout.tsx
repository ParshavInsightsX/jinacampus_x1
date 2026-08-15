import type { ReactNode } from "react";
import { notFound } from "next/navigation";

import { requireAuth } from "@/lib/auth/require-auth";
import { AppError } from "@/lib/errors";
import { SchoolCastSubnav } from "@/modules/schoolcast/components/schoolcast-subnav";
import { getSchoolCastSectionNavigation } from "@/modules/schoolcast/queries";

export default async function SchoolCastLayout({ children }: { children: ReactNode }) {
  const ctx = await requireAuth();
  try {
    const items = await getSchoolCastSectionNavigation(ctx);
    return (
      <div className="space-y-5">
        <SchoolCastSubnav items={items} />
        {children}
      </div>
    );
  } catch (error) {
    if (error instanceof AppError && (error.status === 403 || error.status === 404)) {
      notFound();
    }
    if (error instanceof Error && error.message.startsWith("FORBIDDEN_PERMISSION:")) {
      notFound();
    }
    throw error;
  }
}