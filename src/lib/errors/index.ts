import { z } from "zod";

export class AppError extends Error {
  constructor(
    public readonly code: string,
    message = code,
    public readonly status = 400
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function forbidden(code = "FORBIDDEN") {
  return new AppError(code, code, 403);
}

export function notFound(code = "NOT_FOUND") {
  return new AppError(code, code, 404);
}

export const DEFAULT_UNEXPECTED_ERROR_MESSAGE = "Something went wrong. Please try again.";
export const DEFAULT_VALIDATION_ERROR_MESSAGE = "Please check the highlighted fields and try again.";

export type SafeActionError = {
  ok: false;
  code: string;
  error: string;
  fieldErrors?: Record<string, string[]>;
};

type MapActionErrorOptions = {
  fallbackMessage?: string;
  validationMessage?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function rawErrorCode(error: unknown): string | null {
  if (error instanceof AppError) return error.code;
  if (error instanceof z.ZodError) return "VALIDATION_ERROR";

  if (isRecord(error) && typeof error.code === "string" && error.code.trim()) {
    return error.code.trim();
  }

  if (error instanceof Error) {
    const message = error.message.trim();
    if (/^[A-Z][A-Z0-9_]*(?::[a-z0-9_.-]+)?$/.test(message)) return message;
  }

  return null;
}

export function normalizeErrorCode(code: string | null | undefined) {
  const rawCode = code?.trim();
  if (!rawCode) return "UNKNOWN_ERROR";

  if (rawCode.startsWith("FORBIDDEN_PERMISSION")) return "FORBIDDEN";
  if (rawCode === "FORBIDDEN_BRANCH_ACCESS") return "BRANCH_ACCESS_DENIED";
  if (rawCode === "P2002") return "CONFLICT";
  if (rawCode === "P2025") return "NOT_FOUND";

  return rawCode;
}

export function getSafeErrorCode(error: unknown) {
  return normalizeErrorCode(rawErrorCode(error));
}

export function getSafeHttpStatus(error: unknown) {
  if (error instanceof AppError) return error.status;
  if (error instanceof z.ZodError) return 400;

  const code = getSafeErrorCode(error);
  if (code === "UNAUTHENTICATED") return 401;
  if (code === "FORBIDDEN" || code === "BRANCH_ACCESS_DENIED" || code === "ADMINISTRATOR_ACCESS_REQUIRED") {
    return 403;
  }
  if (code === "NOT_FOUND" || code.endsWith("_NOT_FOUND")) return 404;
  if (code === "CONFLICT" || code.endsWith("_ALREADY_EXISTS") || code.includes("_DUPLICATE")) return 409;
  if (code === "VALIDATION_ERROR" || code.startsWith("INVALID_")) return 400;
  return 500;
}

export function isKnownAppError(error: unknown) {
  return rawErrorCode(error) !== null;
}

export function getUserSafeErrorMessage(errorOrCode: unknown, fallback = DEFAULT_UNEXPECTED_ERROR_MESSAGE) {
  const code = typeof errorOrCode === "string" ? errorOrCode : rawErrorCode(errorOrCode);
  const normalizedCode = normalizeErrorCode(code);
  const codePrefix = code?.split(":")[0] ?? normalizedCode;

  switch (normalizedCode) {
    case "UNAUTHENTICATED":
      return "Please sign in to continue.";
    case "TENANT_INACTIVE":
      return "This school account is not active. Please contact support.";
    case "USER_INACTIVE":
      return "Your account is not active. Please contact an administrator.";
    case "PASSWORD_CHANGE_REQUIRED":
      return "Change your temporary password before continuing.";
    case "PRINCIPAL_RECOVERY_ADMIN_REQUIRED":
      return "Your platform administrator account is not authorised to manage Principal recovery.";
    case "PRINCIPAL_RECOVERY_REQUEST_ALREADY_REVIEWED":
      return "This recovery request has already been reviewed.";
    case "PRINCIPAL_RECOVERY_LINK_INVALID":
      return "This password-reset link is invalid, expired, or has already been used.";
    case "SCHOOL_LOGIN_REQUIRED":
      return "Use the correct sign-in portal for this account.";
    case "FORBIDDEN":
      return "You do not have permission to perform this action.";
    case "BRANCH_ACCESS_DENIED":
      return "You do not have access to this branch.";
    case "NOT_FOUND":
      return "The requested record was not found or is no longer accessible.";
    case "VALIDATION_ERROR":
      return DEFAULT_VALIDATION_ERROR_MESSAGE;
    case "CONFLICT":
      return "This record already exists.";
    case "STUDENT_ADMISSION_NUMBER_EXISTS":
      return "A student with this admission number already exists. Please use a different admission number.";
    case "STUDENT_DOCUMENT_STORAGE_UNAVAILABLE":
    case "STUDENT_DOCUMENT_BUCKET_MUST_BE_PRIVATE":
      return "Student document storage is not available. Ask an administrator to check the secure storage configuration.";
    case "STUDENT_DOCUMENT_FILE_REQUIRED":
      return "Choose a student document to upload.";
    case "STUDENT_DOCUMENT_TOO_LARGE":
      return "This file exceeds the configured student document size limit.";
    case "STUDENT_DOCUMENT_TYPE_NOT_ALLOWED":
    case "STUDENT_PHOTO_MUST_BE_IMAGE":
      return "Use a valid PDF, JPEG, PNG, or WebP file. Passport photographs must be images.";
    case "STUDENT_DOCUMENT_UPLOAD_FAILED":
      return "The document could not be stored securely. Please try again.";
    case "STUDENT_DOCUMENT_DOWNLOAD_FAILED":
      return "The document could not be opened. Please try again.";
    case "STUDENT_DOCUMENT_DELETE_FAILED":
      return "The document could not be deleted. Please try again.";
    case "INSTITUTION_LOGO_STORAGE_UNAVAILABLE":
    case "INSTITUTION_LOGO_BUCKET_MUST_BE_PUBLIC":
      return "Institution logo storage is not available. Check the public branding storage configuration.";
    case "INSTITUTION_LOGO_FILE_REQUIRED":
      return "Choose an institution logo to upload.";
    case "INSTITUTION_LOGO_TOO_LARGE":
      return "The institution logo exceeds the configured 2 MB size limit.";
    case "INSTITUTION_LOGO_TYPE_NOT_ALLOWED":
      return "Use a valid JPEG, PNG, or WebP institution logo.";
    case "INSTITUTION_LOGO_UPLOAD_FAILED":
      return "The institution logo could not be uploaded. Please try again.";
    case "WHATSAPP_NUMBER_REQUIRED":
      return "Add a valid WhatsApp number before enabling attendance communication.";
    case "NOTIFICATION_ACKNOWLEDGEMENT_REQUIRED":
      return "Acknowledge this notification before archiving or dismissing it.";
    case "NOTIFICATION_ACKNOWLEDGEMENTS_DISABLED":
      return "Notification acknowledgements are not enabled for this school.";
    case "NOTIFICATION_SCHEDULING_DISABLED":
      return "Scheduled notifications are not enabled for this school.";
    case "INVALID_NOTIFICATION_TIME_ZONE":
      return "Choose a valid time zone for notification preferences.";
    case "INVALID_NOTIFICATION_QUIET_HOURS":
      return "Choose both a quiet-hours start and end time.";
    case "STUDENT_IMPORT_FILE_REQUIRED":
      return "Choose an Excel or CSV student file.";
    case "STUDENT_IMPORT_FILE_SIZE_INVALID":
      return "The student file is empty or exceeds the 4 MB upload limit.";
    case "STUDENT_IMPORT_FILE_TYPE_INVALID":
    case "STUDENT_IMPORT_FILE_INVALID":
      return "Use a valid .xlsx or .csv student file.";
    case "STUDENT_IMPORT_SHEET_MISSING":
      return "The spreadsheet does not contain a Students sheet.";
    case "STUDENT_ATTENDANCE_LOCKED":
    case "STUDENT_ATTENDANCE_CUTOFF_PASSED":
      return "Attendance is locked. Please contact an administrator for correction.";
    case "STUDENT_ATTENDANCE_UPGRADE_REQUIRED":
      return "Student Attendance is temporarily unavailable while setup is completed. Please contact the JinaCampus Administrator.";
    case "IDENTITY_CARD_UPGRADE_REQUIRED":
      return "Identity cards and staff photographs are temporarily unavailable while setup is completed. Please contact the JinaCampus Administrator.";
    case "INSTITUTION_REGULATORY_UPGRADE_REQUIRED":
      return "Institution legal identity and recognition records are temporarily unavailable while setup is completed.";
    case "OFFICIAL_IDENTIFIER_ALREADY_REGISTERED":
      return "This official identifier is already registered. Review the value or contact an authorised JinaCampus administrator.";
    case "EDUCATION_AUTHORITY_NOT_FOUND":
      return "Choose an active education authority.";
    case "INSTITUTION_IDENTIFIER_NOT_FOUND":
    case "INSTITUTION_AUTHORIZATION_NOT_FOUND":
    case "INSTITUTION_REGULATORY_DOCUMENT_NOT_FOUND":
      return "The requested regulatory record was not found or is no longer accessible.";
    case "REGULATORY_RECORD_NOT_DRAFT":
      return "Only a draft record can be submitted for verification.";
    case "INVALID_REGULATORY_DOCUMENT_SCOPE":
      return "The evidence document must use the same institution and branch scope as its linked record.";
    case "INSTITUTION_REGULATORY_STORAGE_UNAVAILABLE":
    case "INSTITUTION_REGULATORY_BUCKET_MUST_BE_PRIVATE":
      return "Institution evidence storage is unavailable. Ask an administrator to check the private storage configuration.";
    case "INSTITUTION_REGULATORY_DOCUMENT_FILE_REQUIRED":
      return "Choose an evidence document to upload.";
    case "INSTITUTION_REGULATORY_DOCUMENT_TOO_LARGE":
      return "This evidence document exceeds the configured file-size limit.";
    case "INSTITUTION_REGULATORY_DOCUMENT_TYPE_NOT_ALLOWED":
      return "Use a valid PDF, JPEG, PNG, or WebP evidence document.";
    case "INSTITUTION_REGULATORY_DOCUMENT_UPLOAD_FAILED":
      return "The evidence document could not be stored securely. Please try again.";
    case "INSTITUTION_REGULATORY_DOCUMENT_DOWNLOAD_FAILED":
      return "The evidence document could not be opened. Please try again.";
    case "INSTITUTION_REGULATORY_DOCUMENT_DELETE_FAILED":
      return "The evidence document could not be deleted. Please try again.";
    case "STUDENT_ATTENDANCE_SESSION_COMPLETED":
      return "This attendance session is complete and can no longer be changed.";
    case "STUDENT_ATTENDANCE_VERSION_CONFLICT":
      return "Attendance changed on another device. Reload the class and review the latest status.";
    case "STUDENT_ATTENDANCE_MUTATION_ID_REUSED":
      return "This attendance request could not be safely repeated. Reload the class and try again.";
    case "STUDENT_ATTENDANCE_UNMARKED_REMAIN":
      return "Mark every remaining student before finishing attendance.";
    case "STUDENT_ATTENDANCE_BULK_UNDO_UNAVAILABLE":
      return "The bulk action can no longer be undone because one or more student statuses changed.";
    case "STUDENT_ATTENDANCE_ALREADY_EXISTS":
    case "STUDENT_ATTENDANCE_ALREADY_MARKED_FOR_DIFFERENT_SCOPE":
      return "Attendance has already been recorded for this student and date.";
    case "STUDENT_ATTENDANCE_HOLIDAY":
      return "Student attendance is not required on this calendar holiday or non-working day.";
    case "NO_ACTIVE_ENROLLMENTS":
      return "No active enrolled students were found for the selected class-section and date.";
    case "ATTENDANCE_DUTY_USER_NOT_ELIGIBLE":
    case "ATTENDANCE_DUTY_STAFF_PROFILE_REQUIRED":
      return "Choose an active teacher, Principal, or attendance operator with access to this branch.";
    case "ATTENDANCE_DUTY_CLASS_TEACHER_ALREADY_RESPONSIBLE":
      return "The class teacher already has attendance responsibility. Choose another staff member only when coverage is required.";
    case "ATTENDANCE_DUTY_ALREADY_ASSIGNED":
      return "This class already has an active attendance duty for the selected date.";
    case "ATTENDANCE_DUTY_WINDOW_EXPIRED":
    case "ATTENDANCE_DUTY_OUTSIDE_ACTIVE_WINDOW":
    case "ATTENDANCE_DUTY_NO_LONGER_ACTIVE":
      return "This attendance duty is outside its active time window.";
    case "ATTENDANCE_DUTY_WINDOW_OUTSIDE_SCHOOL_DAY":
      return "Keep the temporary duty within the selected school day.";
    case "ATTENDANCE_DUTY_ACKNOWLEDGEMENT_REQUIRED":
      return "Acknowledge this attendance duty before opening the class.";
    case "ATTENDANCE_DUTY_NOT_PENDING":
    case "ATTENDANCE_DUTY_STATUS_CHANGED":
      return "This attendance duty changed. Refresh the coverage page and review its latest status.";
    case "ATTENDANCE_RESPONSIBILITY_REQUIRED":
      return "You need an active attendance duty for this class and date.";
    case "ATTENDANCE_SESSION_ASSIGNED_TO_ANOTHER_USER":
      return "This attendance session is currently assigned to another authorised user.";
    case "ATTENDANCE_TAKEOVER_REASON_REQUIRED":
      return "Enter a clear reason before taking over this attendance session.";
    case "ATTENDANCE_SESSION_RESPONSIBILITY_LOCKED":
      return "Responsibility cannot be changed after attendance is completed or locked.";
    case "STUDENT_NOT_ACTIVE_ENROLLED":
      return "One or more selected students are not actively enrolled for this class-section.";
    case "PROMOTION_NO_ACTIVE_ENROLLMENTS":
      return "No active student enrollments are available in the selected source class-section.";
    case "PROMOTION_TARGET_ACADEMIC_YEAR_MUST_FOLLOW_SOURCE":
      return "Choose an academic year that follows the source academic year.";
    case "PROMOTION_EFFECTIVE_DATE_OUTSIDE_TARGET_YEAR":
      return "The effective date must fall within the target academic year.";
    case "PROMOTION_NEXT_CLASS_MUST_DIFFER_FROM_SOURCE":
      return "Choose a different next class for students marked Promoted.";
    case "PROMOTION_REPEAT_TARGET_MUST_USE_SOURCE_CLASS":
      return "A repeating student must remain in the same class level for the target academic year.";
    case "PROMOTION_TARGET_NOT_ALLOWED_FOR_OUTCOME":
      return "A target class-section is used only for promoted or repeating students.";
    case "PROMOTION_DECISION_ALREADY_RECORDED":
      return "A selected student already has a completed promotion decision. Reverse that batch before recording another decision.";
    case "PROMOTION_TARGET_ENROLLMENT_ALREADY_EXISTS":
      return "A selected student already has an enrollment in the target academic year.";
    case "PROMOTION_TARGET_CLASS_SECTION_CAPACITY_EXCEEDED":
      return "The selected decisions would exceed a target class-section capacity.";
    case "PROMOTION_SOURCE_ENROLLMENT_CHANGED":
    case "PROMOTION_STUDENT_LIFECYCLE_CHANGED":
      return "A selected student changed while this batch was being prepared. Reload the roster and review again.";
    case "PROMOTION_TARGET_ENROLLMENT_WRITE_INCOMPLETE":
    case "PROMOTION_DECISION_WRITE_INCOMPLETE":
      return "The promotion batch was not completed. No partial changes were saved; reload and try again.";
    case "PROMOTION_BATCH_ALREADY_REVERSED":
      return "This promotion batch has already been reversed.";
    case "PROMOTION_REVERSAL_BLOCKED_BY_TARGET_ACTIVITY":
      return "This batch cannot be reversed because attendance exists for a target-year enrollment.";
    case "PROMOTION_REVERSAL_BLOCKED_BY_LATER_CHANGES":
      return "This batch cannot be reversed because related student or enrollment records changed later.";
    case "ENTITLEMENT_CONFIGURATION_REQUIRED":
      return "Module access is not configured yet. Ask the JinaCampus Administrator to complete institution setup.";
    case "SUBSCRIPTION_INACTIVE":
      return "This school subscription is not currently active. Contact the JinaCampus Administrator.";
    case "MODULE_NOT_INCLUDED":
      return "This module is not included for the current institution.";
    case "FEATURE_NOT_INCLUDED":
      return "This feature is not included for the current institution.";
    case "MODULE_READ_ONLY":
      return "This feature is available in view-only mode. Changes are not permitted.";
    case "ENTITLEMENT_SCOPE_NOT_FOUND":
      return "The requested institution or branch is not available for module access.";
    case "GRADEBOOK_NOT_ENABLED":
      return "GradeBook is not enabled for this school.";
    case "GRADEBOOK_FEATURE_NOT_ENABLED":
      return "This GradeBook capability is not enabled for this school.";
    case "GRADEBOOK_SCOPE_FORBIDDEN":
      return "You do not have access to this GradeBook scope.";
    case "GRADEBOOK_BRANCH_CONTEXT_REQUIRED":
      return "Select an authorised branch before using GradeBook.";
    case "GRADEBOOK_ACADEMIC_YEAR_CONTEXT_REQUIRED":
      return "Select an active academic year before using GradeBook.";
    case "GRADEBOOK_INSTITUTION_CONTEXT_REQUIRED":
      return "Your school context is incomplete. Ask an administrator to review your access.";
    case "GRADEBOOK_STORAGE_UNAVAILABLE":
    case "GRADEBOOK_STORAGE_BUCKET_MUST_BE_PRIVATE":
      return "GradeBook document storage is not available. Ask an administrator to check the private storage configuration.";
    case "GRADEBOOK_BATCH_VERSION_CONFLICT":
      return "This marks batch changed after you opened it. Reload the page and review the latest version.";
    case "GRADEBOOK_BATCH_LOCKED":
      return "This marks batch is locked and cannot be edited.";
    case "GRADEBOOK_MARK_OUT_OF_RANGE":
      return "One or more marks exceed the configured maximum.";
    case "GRADEBOOK_MARK_BATCH_NOT_FOUND":
    case "GRADEBOOK_MARK_SCOPE_NOT_FOUND":
      return "The requested marks scope was not found or is no longer accessible.";
    case "GRADEBOOK_MARKS_WINDOW_NOT_OPEN":
      return "The marks-entry window is not open.";
    case "GRADEBOOK_MARKS_WINDOW_CLOSED":
      return "The marks-entry window has closed.";
    case "GRADEBOOK_GRADE_SCALE_COVERAGE_INVALID":
      return "The grade scale must cover the complete score range from 0 to 100.";
    case "GRADEBOOK_GRADE_SCALE_RANGE_INVALID":
      return "Grade ranges must be continuous and must not overlap.";
    case "GRADEBOOK_INVALID_STATE_TRANSITION":
      return "This GradeBook record cannot move to the requested status.";
    case "GRADEBOOK_SEGREGATION_OF_DUTIES_REQUIRED":
      return "A different authorised user must complete this approval step.";
    case "GRADEBOOK_RESULT_INPUT_INCOMPLETE":
      return "Complete and approve every required marks batch before calculating results.";
    case "GRADEBOOK_REPORT_CARD_NOT_APPROVED":
      return "Approve every required report card before publishing results.";
    case "GRADEBOOK_IMPORT_FILE_REQUIRED":
      return "Choose a GradeBook CSV or Excel file to import.";
    case "GRADEBOOK_IMPORT_FILE_TYPE_NOT_ALLOWED":
      return "Use a valid GradeBook .csv or .xlsx file.";
    case "GRADEBOOK_IMPORT_FILE_TOO_LARGE":
      return "The GradeBook import file exceeds the configured size limit.";
    case "GRADEBOOK_CLASS_SUBJECT_ALREADY_ASSIGNED":
      return "This subject is already assigned to the selected class-section.";
    case "GRADEBOOK_CLASS_SUBJECT_HAS_ASSESSMENTS":
      return "This subject assignment has assessments and cannot be deactivated.";
    case "GRADEBOOK_TEACHER_NOT_AVAILABLE":
      return "Choose an active teacher who has access to this branch.";
    case "GRADEBOOK_ASSESSMENT_ALREADY_EXISTS":
      return "An assessment with this code already exists for the selected class and subject.";
    case "GRADEBOOK_ASSESSMENT_DATE_OUTSIDE_YEAR":
      return "The assessment date must fall within the active academic year.";
    case "GRADEBOOK_ASSESSMENT_NOT_OPEN":
      return "Marks can be changed only while the assessment is open.";
    case "GRADEBOOK_MARKS_OUT_OF_RANGE":
      return "One or more marks exceed the assessment maximum.";
    case "GRADEBOOK_ENROLLMENT_NOT_ELIGIBLE":
      return "One or more students are not actively enrolled in this class-section.";
    case "GRADEBOOK_RESULTS_INCOMPLETE":
      return "Enter a result for every active student before publishing.";
    case "GRADEBOOK_ASSESSMENT_ALREADY_PUBLISHED":
      return "This assessment is already published.";
    case "GRADEBOOK_ASSESSMENT_NOT_PUBLISHED":
      return "Only a published assessment can be reopened.";
    case "GRADEBOOK_PUBLISHED_REOPEN_REQUIRED":
      return "Reopen this published assessment before cancelling it.";
    case "GRADEBOOK_ASSESSMENT_CANCELLED":
      return "This assessment has been cancelled and cannot be changed.";
    case "STAFF_QR_EXPIRED":
      return "This QR code has expired. Please scan a fresh QR code.";
    case "INVALID_STAFF_QR":
      return "This QR code is invalid or no longer available.";
    case "STAFF_QR_BRANCH_MISMATCH":
      return "This QR code belongs to a different branch.";
    case "STAFF_ALREADY_CHECKED_IN":
      return "You have already checked in today.";
    case "STAFF_ALREADY_CHECKED_OUT":
      return "You have already checked out today.";
    case "STAFF_CHECK_IN_REQUIRED":
      return "Please check in before checking out.";
    case "ACTIVE_STAFF_PROFILE_NOT_FOUND":
      return "An active staff profile was not found for your account.";
    case "STAFF_PROFILE_INACTIVE":
      return "Reactivate the staff profile before enabling login access.";
    case "STAFF_LOGIN_ACCESS_ALREADY_DISABLED":
      return "Login access is already disabled for this staff member.";
    case "STAFF_LOGIN_BRANCH_ACCESS_REQUIRED":
      return "Assign this staff member to their branch before reactivating login access.";
    case "STAFF_LOGIN_ROLE_REQUIRED":
      return "Assign an approved school role before reactivating login access.";
    case "STAFF_PROFILE_CREATION_REQUIRED":
      return "Create Teachers, Office Staff, and Staff from Staff Profiles so their employee and login records stay linked.";
    case "STAFF_PROFILE_REQUIRED_FOR_ROLE":
      return "Link this user to a staff profile before assigning this role.";
    case "STAFF_BRANCH_INACTIVE":
      return "Your assigned branch is not active for staff attendance.";
    case "STAFF_QR_ATTENDANCE_DISABLED":
    case "STAFF_ATTENDANCE_QR_DISABLED":
      return "Staff QR attendance is disabled for this branch.";
    case "STAFF_SHARED_QR_RETIRED":
      return "Shared attendance QR codes are no longer available. Use Staff QR Cards and the authorised attendance scanner.";
    case "STAFF_SELF_SCAN_DISABLED":
      return "Staff cannot scan their own attendance. Present your Staff QR Card to an authorised attendance operator.";
    case "STAFF_QR_BRANCH_REQUIRED":
      return "Select a branch before generating a QR code.";
    case "STAFF_QR_OPERATOR_ACCESS_REQUIRED":
      return "Only an authorised Principal or Office Staff QR Operator can manage attendance QR codes.";
    case "STAFF_QR_NOT_FOUND":
      return "This attendance QR code is no longer available.";
    case "INVALID_STAFF_QR_TOKEN_VALIDITY_SECONDS":
      return "Staff attendance QR codes use the fixed five-hour validity window.";
    case "STAFF_ATTENDANCE_RECORD_NOT_FOUND":
      return "The requested attendance record was not found or is no longer accessible.";
    case "STAFF_ATTENDANCE_CHECK_OUT_BEFORE_CHECK_IN":
      return "Check-out time must be after check-in time.";
    case "STAFF_ATTENDANCE_MANAGED_BY_LEAVE":
      return "This attendance record is managed by an approved leave application. Cancel or revise the leave first.";
    case "STAFF_ATTENDANCE_MANAGED_BY_CALENDAR":
      return "This attendance record is managed by the academic calendar. Update the calendar entry first.";
    case "STAFF_ATTENDANCE_HOLIDAY":
      return "Today is a paid holiday for this staff group. Attendance check-in is not required.";
    case "STAFF_ON_APPROVED_LEAVE":
      return "You have approved leave for today. Contact an authorised approver if the leave needs to be cancelled.";
    case "STAFF_LEAVE_TYPE_NOT_FOUND":
      return "Select an active leave type configured for your branch.";
    case "STAFF_LEAVE_APPLICATION_NOT_FOUND":
      return "The leave application was not found or is no longer accessible.";
    case "STAFF_LEAVE_BACKDATED_NOT_ALLOWED":
      return "Backdated leave applications are not allowed for this branch.";
    case "STAFF_LEAVE_NOTICE_REQUIRED":
      return "This leave application does not meet the branch notice period.";
    case "STAFF_LEAVE_MAXIMUM_DAYS_EXCEEDED":
      return "This leave exceeds the maximum consecutive duration configured for the branch.";
    case "STAFF_LEAVE_HALF_DAY_NOT_ALLOWED":
      return "Half-day leave is not allowed for this leave type or branch.";
    case "STAFF_LEAVE_NO_WORKING_DAYS":
      return "The selected range contains no configured working days.";
    case "STAFF_LEAVE_OVERLAP":
      return "An active leave application already overlaps this date range.";
    case "STAFF_LEAVE_NOT_EDITABLE":
      return "Only pending applications or clarification requests can be edited.";
    case "STAFF_LEAVE_ALREADY_ACTIONED":
      return "This leave application has already been actioned.";
    case "STAFF_LEAVE_NOT_WITHDRAWABLE":
      return "Only pending applications or clarification requests can be withdrawn.";
    case "STAFF_LEAVE_NOT_CANCELLABLE":
      return "Only approved leave can be cancelled by an authorised approver.";
    case "STAFF_LEAVE_PAST_CANCELLATION_BLOCKED":
      return "Leave that has already started cannot be cancelled from this workflow.";
    case "STAFF_LEAVE_APPROVER_REQUIRED":
      return "You are not a designated leave approver for this branch.";
    case "STAFF_LEAVE_DESIGNATED_APPROVER_REQUIRED":
      return "Add at least one active designated approver before using designated-approver mode.";
    case "STAFF_LEAVE_APPROVER_USER_NOT_FOUND":
      return "Select an active Principal or Office Staff user assigned to this branch.";
    case "STAFF_LEAVE_BALANCE_INSUFFICIENT":
      return "The staff member does not have enough leave balance for this application.";
    case "STAFF_LEAVE_BALANCE_CONFLICT":
    case "STAFF_LEAVE_BALANCE_BELOW_USED":
      return "This balance change conflicts with leave that has already been used.";
    case "STAFF_LEAVE_ATTENDANCE_CONFLICT":
      return "Attendance already exists for one or more selected dates. Resolve it before approving or cancelling leave.";
    case "STAFF_LEAVE_DOCUMENT_REQUIRED":
      return "Upload the required supporting document before approving this leave.";
    case "STAFF_LEAVE_DOCUMENT_NOT_EDITABLE":
      return "Supporting documents can be changed only while leave is pending or awaiting clarification.";
    case "STAFF_LEAVE_DOCUMENT_STORAGE_UNAVAILABLE":
    case "STAFF_LEAVE_DOCUMENT_BUCKET_MUST_BE_PRIVATE":
      return "Leave document storage is not available. Ask an administrator to check the private storage configuration.";
    case "STAFF_LEAVE_DOCUMENT_FILE_REQUIRED":
      return "Choose a supporting document to upload.";
    case "STAFF_LEAVE_DOCUMENT_TOO_LARGE":
      return "This supporting document exceeds the configured size limit.";
    case "STAFF_LEAVE_DOCUMENT_TYPE_NOT_ALLOWED":
      return "Use a valid PDF, JPEG, PNG, or WebP supporting document.";
    case "STAFF_LEAVE_DOCUMENT_UPLOAD_FAILED":
      return "The supporting document could not be stored securely. Please try again.";
    case "STAFF_LEAVE_DOCUMENT_DOWNLOAD_FAILED":
      return "The supporting document could not be opened. Please try again.";
    case "STAFF_LEAVE_DOCUMENT_DELETE_FAILED":
      return "The supporting document could not be deleted. Please try again.";
    case "CALENDAR_INSTITUTION_NOT_FOUND":
      return "The selected institution was not found or is no longer accessible.";
    case "CALENDAR_BRANCH_NOT_FOUND":
      return "The selected branch was not found or is no longer accessible.";
    case "CALENDAR_ACADEMIC_YEAR_NOT_FOUND":
      return "Select an academic year for the chosen institution.";
    case "CALENDAR_DATE_OUTSIDE_ACADEMIC_YEAR":
      return "The calendar dates must fall within the selected academic year.";
    case "CALENDAR_ACTIVE_BRANCH_REQUIRED":
      return "Add an active branch before creating institution-wide calendar entries.";
    case "CALENDAR_ALL_BRANCH_ACCESS_REQUIRED":
      return "Institution-wide calendar entries require access to every active branch. Select one authorised branch instead.";
    case "CALENDAR_ENTRY_OVERLAP":
      return "Another active calendar entry overlaps these dates, branches, and applicable groups.";
    case "CALENDAR_STUDENT_ATTENDANCE_CONFLICT":
      return "Student attendance already exists in this date range. Resolve those records before adding the holiday.";
    case "CALENDAR_STAFF_LEAVE_CONFLICT":
      return "An active staff leave application overlaps this date range. Resolve the leave before changing the calendar.";
    case "CALENDAR_STAFF_ATTENDANCE_CONFLICT":
      return "Staff attendance already exists in this date range. Resolve it before changing the calendar.";
    case "CALENDAR_ENTRY_NOT_FOUND":
      return "The calendar entry was not found or is no longer active.";
    case "CURRENT_PASSWORD_INCORRECT":
      return "Current password is incorrect.";
    case "USER_PASSWORD_NOT_SET":
      return "Password is not set for this account. Ask an administrator to reset it.";
    case "USER_ROLE_ALREADY_ASSIGNED":
      return "This role is already assigned to the user.";
    case "ROLE_ASSIGNMENT_NOT_ALLOWED":
      return "You cannot assign this role.";
    case "USER_ROLE_ASSIGNMENT_NOT_FOUND":
      return "This role assignment was not found or is no longer active.";
    case "USER_BRANCH_ALREADY_ASSIGNED":
      return "This branch is already assigned to the user.";
    case "USER_BRANCH_ACCESS_NOT_FOUND":
      return "This branch access was not found or is no longer active.";
    case "USER_BRANCH_ACCESS_REQUIRED":
      return "A user must keep at least one active branch access.";
    case "USER_SELF_DEACTIVATE_BLOCKED":
      return "You cannot deactivate your own account.";
    case "USER_ALREADY_DEACTIVATED":
      return "This user account is already deactivated.";
    case "USER_PLATFORM_ADMIN_DEACTIVATE_FORBIDDEN":
      return "You cannot deactivate a platform administrator account.";
    case "ADMINISTRATOR_ACCESS_REQUIRED":
      return "Administrator access is required for this action.";
    case "INVALID_SCHOOL_ID":
      return "Enter a valid School ID using lowercase letters, numbers, and single hyphens.";
    case "SCHOOL_ID_ALREADY_EXISTS":
      return "This School ID is already in use.";
    case "SCHOOL_ID_RESERVED":
      return "This School ID is reserved. Please choose another.";
    case "CURRENT_SCHOOL_ID_MISMATCH":
      return "Current School ID does not match this school.";
    case "SCHOOL_SELF_DEACTIVATE_BLOCKED":
      return "You cannot deactivate the school that owns your current administrator session.";
    case "SCHOOL_SELF_DELETE_BLOCKED":
      return "You cannot delete the school that owns your current administrator session.";
    case "SCHOOL_DELETE_BLOCKED":
    case "SCHOOL_DELETE_BLOCKED_BY_DEPENDENCIES":
      return "This school has dependent data. Deactivate it instead.";
    default:
      break;
  }

  if (codePrefix === "FORBIDDEN_PERMISSION" || codePrefix.startsWith("FORBIDDEN")) {
    return "You do not have permission to perform this action.";
  }
  if (normalizedCode.endsWith("_NOT_FOUND")) {
    return "The requested record was not found or is no longer accessible.";
  }
  if (normalizedCode.endsWith("_ALREADY_EXISTS") || normalizedCode.includes("_DUPLICATE")) {
    return "This record already exists.";
  }
  if (normalizedCode.startsWith("INVALID_")) {
    return DEFAULT_VALIDATION_ERROR_MESSAGE;
  }

  return fallback;
}

function safeZodIssueMessage(issue: z.ZodIssue) {
  if (issue.code === z.ZodIssueCode.unrecognized_keys) return "Please remove unsupported fields.";
  return issue.message || "Please check this field.";
}

export function getZodFieldErrors(error: z.ZodError): Record<string, string[]> {
  const fieldErrors: Record<string, string[]> = {};

  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? issue.path.join(".") : "form";
    fieldErrors[key] = [...(fieldErrors[key] ?? []), safeZodIssueMessage(issue)];
  }

  return fieldErrors;
}

export function mapActionError(error: unknown, options: MapActionErrorOptions = {}): SafeActionError {
  if (error instanceof z.ZodError) {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      error: options.validationMessage ?? DEFAULT_VALIDATION_ERROR_MESSAGE,
      fieldErrors: getZodFieldErrors(error)
    };
  }

  const code = getSafeErrorCode(error);
  return {
    ok: false,
    code,
    error: getUserSafeErrorMessage(error, options.fallbackMessage ?? DEFAULT_UNEXPECTED_ERROR_MESSAGE)
  };
}
