import type { ReactNode } from "react";

import { requireSchoolCastDeploymentRoute } from "@/modules/schoolcast/deployment-route-gate";

export default function SchoolCastHomeworkLayout({ children }: { children: ReactNode }) {
  requireSchoolCastDeploymentRoute("homework");
  return children;
}
