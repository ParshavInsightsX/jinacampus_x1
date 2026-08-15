import type { ReactNode } from "react";

import { requireSchoolCastDeploymentRoute } from "@/modules/schoolcast/deployment-route-gate";

export default function SchoolCastTemplatesLayout({ children }: { children: ReactNode }) {
  requireSchoolCastDeploymentRoute("templates");
  return children;
}
