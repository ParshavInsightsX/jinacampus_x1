# Data Retention and Secure Deletion Schedule

Status: **Proposed - legal and institution approval required**
Version: `draft-0.1`

The final periods must be reconciled with board, state, employment, tax, limitation, contract, safeguarding, audit, and institution requirements. The schedule uses event-based rules rather than unsupported universal periods.

| Record category | Active trigger | Proposed disposition | Required approval/evidence |
|---|---|---|---|
| Institution and subscription records | Contract active | Retain for service administration; archive after termination | Executed contract and tax/legal review |
| User identity, roles and branch access | Access active | Disable promptly when authority ends; retain audit-linked identifiers as required | Institution offboarding record |
| Password credentials and sessions | Account/session active | Hash credentials; expire/revoke sessions; remove obsolete authenticators securely | Security policy and session tests |
| Student admission and enrollment | Student enrolled / historical record required | Preserve school history; delete or anonymise only on verified instruction and where no retention duty applies | Institution + board/state legal review |
| Guardian contacts and authority | Relationship/purpose active | Correct promptly; remove when no purpose remains and no safeguarding/legal hold applies | Verified institution request |
| Attendance and GradeBook records | Academic history required | Preserve by academic year; do not alter published/history records silently | Academic and legal approval |
| Staff employment, attendance and leave | Employment/statutory period active | Restrict after separation; retain for approved employment/statutory period | HR/legal review |
| Student and staff documents | Document purpose active | Private storage; delete object and metadata through audited workflow after approval | Deletion evidence and backup expiry |
| Communication preferences and consent | Purpose/consent active | Preserve evidence of grant/withdrawal for dispute and compliance period | Consent policy approval |
| Audit and security logs | Security/compliance purpose active | Protect against alteration; CERT-In-relevant ICT logs require verified rolling retention in India | Security owner evidence |
| Support and grievance records | Case active / appeal period | Minimise attachments; retain decision/evidence for approved period | Grievance procedure approval |
| Backups | Recovery window active | Encrypted, access-controlled expiry; deleted data ages out by documented cycle | Restore rehearsal and expiry evidence |
| Legal hold | Hold issued | Suspend ordinary deletion only for scoped records; release through authorised record | Legal owner and hold register |

## Deletion Controls

1. Authenticate the requester and verify institution, tenant, branch, record, and authority.
2. Identify statutory, academic, employment, tax, audit, security, dispute, safeguarding, and third-party constraints.
3. Approve the action using separation of duties for bulk or high-risk deletion.
4. Export data first only when authorised and deliver it through a protected channel.
5. Delete or anonymise tenant-scoped database records and private objects using the approved service path.
6. Record actor, reason, scope, counts, timestamps, exceptions, backup expiry, and evidence reference without copying sensitive content into the audit log.
7. Verify that other tenants, institutions, branches, academic years, and shared infrastructure were unaffected.

## Current Gaps

- A unified retention-policy engine and hard-deletion worker are not certified.
- Module-specific soft deletion is inconsistent.
- Backup expiry and restoration evidence must be linked to deletion completion.
- Production ICT log location and rolling 180-day retention require operational evidence.

These gaps block a claim of fully automated deletion compliance but do not authorise ad hoc production deletion.
