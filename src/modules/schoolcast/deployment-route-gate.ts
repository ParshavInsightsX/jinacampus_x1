import { notFound } from "next/navigation";

import {
  getSchoolCastDeploymentPolicy,
  type SchoolCastDeploymentCapability
} from "@/modules/schoolcast/deployment-policy";

export function requireSchoolCastDeploymentRoute(capability: SchoolCastDeploymentCapability) {
  if (!getSchoolCastDeploymentPolicy()[capability]) notFound();
}
