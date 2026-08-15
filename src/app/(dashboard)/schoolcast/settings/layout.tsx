import type { ReactNode } from "react";

import { requireSchoolCastDeploymentRoute } from "@/modules/schoolcast/deployment-route-gate";

export default function SchoolCastSettingsLayout({ children }: { children: ReactNode }) {
  requireSchoolCastDeploymentRoute("providerConfiguration");
  return children;
}
