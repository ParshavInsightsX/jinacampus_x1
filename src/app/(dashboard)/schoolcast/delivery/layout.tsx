import type { ReactNode } from "react";

import { requireSchoolCastDeploymentRoute } from "@/modules/schoolcast/deployment-route-gate";

export default function SchoolCastDeliveryLayout({ children }: { children: ReactNode }) {
  requireSchoolCastDeploymentRoute("deliveryOperations");
  return children;
}
