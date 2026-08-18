import { ACADEMIA_PERMISSIONS } from "@/modules/academia/permissions";
import { CAMPUS_CORE_PERMISSIONS } from "@/modules/campus-core/permissions";
import { GRADEBOOK_PERMISSIONS } from "@/modules/gradebook/permissions";
import { IN_APP_NOTIFICATION_SELF_PERMISSIONS, NOTIFICATION_PERMISSIONS } from "@/modules/notifications/permissions";
import { STAFFBOARD_LITE_PERMISSIONS } from "@/modules/staffboard-lite/permissions";

export {
  ACADEMIA_PERMISSIONS,
  CAMPUS_CORE_PERMISSIONS,
  GRADEBOOK_PERMISSIONS,
  IN_APP_NOTIFICATION_SELF_PERMISSIONS,
  NOTIFICATION_PERMISSIONS,
  STAFFBOARD_LITE_PERMISSIONS
};

export const ALL_PERMISSIONS = [
  ...CAMPUS_CORE_PERMISSIONS,
  ...ACADEMIA_PERMISSIONS,
  ...GRADEBOOK_PERMISSIONS,
  ...STAFFBOARD_LITE_PERMISSIONS,
  ...NOTIFICATION_PERMISSIONS
] as const;
export type PermissionCode = (typeof ALL_PERMISSIONS)[number];

export type PermissionModuleCode =
  | "SYSTEM"
  | "CAMPUS_CORE"
  | "ACADEMIA"
  | "GRADEBOOK"
  | "STAFFBOARD"
  | "NOTIFICATIONS";

export type PermissionDefinition = {
  code: PermissionCode;
  module: PermissionModuleCode;
  description: string;
};

function definePermissions(
  permissions: readonly PermissionCode[],
  module: PermissionModuleCode
): PermissionDefinition[] {
  return permissions.map((code) => ({ code, module, description: code }));
}

export const PERMISSION_DEFINITIONS: readonly PermissionDefinition[] = [
  ...definePermissions(
    CAMPUS_CORE_PERMISSIONS.filter((permission) => permission.startsWith("platform.")),
    "SYSTEM"
  ),
  ...definePermissions(
    CAMPUS_CORE_PERMISSIONS.filter((permission) => !permission.startsWith("platform.")),
    "CAMPUS_CORE"
  ),
  ...definePermissions(ACADEMIA_PERMISSIONS, "ACADEMIA"),
  ...definePermissions(GRADEBOOK_PERMISSIONS, "GRADEBOOK"),
  ...definePermissions(STAFFBOARD_LITE_PERMISSIONS, "STAFFBOARD"),
  ...definePermissions(NOTIFICATION_PERMISSIONS, "NOTIFICATIONS"),
];

const PERMISSION_CODES = new Set<string>(ALL_PERMISSIONS);

export function isPermissionCode(value: string): value is PermissionCode {
  return PERMISSION_CODES.has(value);
}
