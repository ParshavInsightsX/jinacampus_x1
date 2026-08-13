export const PLATFORM_ADMINISTRATOR_AUDIT_EVENTS = {
  LOGIN_SUCCESS: "platform.administrator.login_success",
  LOGOUT: "platform.administrator.logout",
  PASSWORD_CHANGED: "platform.administrator.password_changed",
  SCHOOL_CREATED: "platform.school.created",
  SCHOOL_UPDATED: "platform.school.updated",
  INSTITUTION_LOGO_UPDATED: "platform.institution.logo_updated",
  SCHOOL_ID_UPDATED: "platform.school.school_id_updated",
  SCHOOL_DEACTIVATED: "platform.school.deactivated",
  SCHOOL_REACTIVATED: "platform.school.reactivated",
  SCHOOL_DELETED: "platform.school.deleted",
  PRINCIPAL_CREATED: "platform.school.principal_created",
  PRINCIPAL_PASSWORD_RECOVERY_APPROVED: "platform.principal_password_recovery.approved",
  PRINCIPAL_PASSWORD_RECOVERY_REJECTED: "platform.principal_password_recovery.rejected",
  PRINCIPAL_PASSWORD_RECOVERY_EXPIRED: "platform.principal_password_recovery.expired",
  PRINCIPAL_TEMPORARY_PASSWORD_ISSUED: "platform.principal_password_recovery.temporary_password_issued",
  PRINCIPAL_PASSWORD_RESET_COMPLETED: "platform.principal_password_recovery.completed"
} as const;
