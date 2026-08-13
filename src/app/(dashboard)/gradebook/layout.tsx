import type { ReactNode } from "react";
import { notFound } from "next/navigation";

import { requireAuth } from "@/lib/auth/require-auth";
import { AppError } from "@/lib/errors";
import { GradebookSubnav } from "@/modules/gradebook/components/gradebook-subnav";
import { getGradebookSectionNavigation } from "@/modules/gradebook/queries";

export default async function GradebookLayout({ children }: { children: ReactNode }) {
  const ctx = await requireAuth();
  let items: Awaited<ReturnType<typeof getGradebookSectionNavigation>>;
  try {
    items = await getGradebookSectionNavigation(ctx);
  } catch (error) {
    if (error instanceof AppError && (error.status === 403 || error.status === 404)) {
      notFound();
    }
    throw error;
  }
  return (
    <div className="space-y-5">
      <GradebookSubnav items={items} />
      {children}
    </div>
  );
}
