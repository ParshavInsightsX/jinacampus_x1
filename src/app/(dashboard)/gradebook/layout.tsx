import type { ReactNode } from "react";

import { requireAuth } from "@/lib/auth/require-auth";
import { GradebookSubnav } from "@/modules/gradebook/components/gradebook-subnav";
import { getGradebookSectionNavigation } from "@/modules/gradebook/queries";

export default async function GradebookLayout({ children }: { children: ReactNode }) {
  const ctx = await requireAuth();
  const items = await getGradebookSectionNavigation(ctx);
  return (
    <div className="space-y-5">
      <GradebookSubnav items={items} />
      {children}
    </div>
  );
}
