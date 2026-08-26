# Identity Cards and Supervised Staff Attendance

## Status

- Date: 2026-08-26
- Implementation: complete in the working tree
- Database migration: `20260825120000_add_identity_cards`
- Isolated validation migration: applied and replayed successfully in disposable PostgreSQL 17
- Deployment database migration: not applied
- DB-backed authenticated browser QA: passed for the synthetic isolated role matrix described below
- Physical print and real-device QR scan verification: pending supervised hardware and approved HTTPS
- Private staff-photo QA: infrastructure passed against the isolated non-production target; authenticated app-level upload, replacement, signed retrieval, denial, deletion, and audit lifecycle passed against disposable PostgreSQL 17 and a local private Storage emulator

No raw passwords, QR payloads, token hashes, storage secrets, or credentials are recorded in this document.

## Staff Attendance Model

Staff self-attendance camera scanning is retired. A staff member opens **My Staff Card** and presents the active digital or printed card to a separately authenticated attendance operator. Only a user with `staffboard.attendance.scan`, the required attendance entitlements, and branch access can start a supervised scanner session and record attendance.

The server resolves the operator, tenant, institution, branch, and attendance context from the authenticated session. It validates the staff credential hash, lifecycle, expiry, branch assignment, leave and calendar state, duplicate cooldown, session ownership, and client-request idempotency before writing the attendance event, daily projection, outbox entry, and audit log in one transaction.

Legacy shared-QR generation and self-scan service entry points fail closed. The compatibility route `/staffboard/attendance/qr` redirects authorised managers to **Staff QR Cards**, staff card viewers to **My Staff Card**, and other users to the Attendance Register.

## Staff Card Access

| Capability | Required server authority | Result |
| --- | --- | --- |
| View own active card | Linked `StaffProfile.userId`, accessible branch, institution scope, `staffboard.attendance.credential.self_view`, QR read entitlement | Digital card only |
| Issue or reissue | Principal-family role plus `staffboard.attendance.credential.manage` and QR write entitlement | New active version; previous active version is superseded |
| Preview | Same manager role and permission | Active, recoverable card only |
| Print | Same manager role and permission | Audit is written before the browser print dialog opens |
| Revoke | Same manager role and permission | Credential becomes unusable immediately |
| Scan attendance | `staffboard.attendance.scan`, branch scope, QR write entitlement | Supervised operator session only |

Staff cannot print or download from the own-card route. Newly issued card secrets are deterministically recoverable only on the server using the existing server pepper and are verified against the stored hash with a timing-safe comparison. The readable payload is rendered only inside the QR symbol. Legacy hash-only cards remain scan-valid but require reissue for digital display.

## Card Design

The Staff QR Identification Card is two-sided and uses the standard CR80 size of 85.6 mm by 53.98 mm. The front contains institution branding, staff photo, name, employee code, designation, department, branch, issue and validity dates, and signatory area. The reverse contains a high-error-correction QR code, supervised-use instructions, non-transferability and loss reporting rules, the INR 500 replacement charge subject to school policy, and school contact information.

Print CSS hides application chrome and every non-card element, uses print-safe dimensions and margins, and bounds the front and reverse surfaces for card printing. Staff digital-only cards are explicitly excluded from print media.

Staff photographs use a private server-only storage bucket, tenant/staff object paths, file signature and size validation, private metadata, permission-checked 60-second signed access, replacement cleanup, and audit logging.

## Student ID Cards

`/academia/students/[studentId]/id-card` provides an authorised card lifecycle for active enrollments. The service requires `academia.student.id_card.manage` and scopes every lookup by tenant, institution, accessible branch, academic year, student, and enrollment.

The Student ID Card is two-sided and intentionally has no attendance QR. It includes institution branding, passport photograph where available, student name, scholar number, class and section, academic year, date of birth, blood group where collected, guardian and emergency contact information, branch details, validity dates, signatory area, school rules, lost-card instructions, replacement policy, and institution-property/non-transferable wording.

Issue, reissue, preview, print, deactivate, and version history actions are server-authorised and audited. Reissue requires a reason, supersedes the prior active card, and preserves historical versions.

## Migration Scope

The additive migration creates:

- `student_identity_cards` with tenant, institution, branch, academic-year, student, and enrollment relations.
- `staff_profile_photos` with tenant and branch scoping and private storage metadata.
- `StudentIdentityCardStatus`.
- `staffboard.attendance.credential.self_view`.
- `academia.student.id_card.manage`.

It also removes new-role assignments for the retired self-scan permission, forces `staffSelfScanEnabled` off, and converts `HYBRID` capture settings to `SUPERVISED_QR`. The migration has been exercised only in the disposable isolated validation database; no deployment database was changed.

## Isolated Validation Evidence

Validation was completed on 2026-08-26 against a labelled, disposable PostgreSQL 17 container bound to localhost. The target database name was asserted before every fixture or migration command. All 31 committed migrations were replayed from an empty schema, ending at `20260825120000_add_identity_cards`; the final Prisma migration status was up to date. This migration and authenticated lifecycle run did not contact a Supabase, staging, deployment, or production database.

The synthetic server-side ledger passed:

- legacy QR scan compatibility and controlled digital-display reissue;
- staff own-card access, manager print controls, self-camera denial, operator scanning, duplicate prevention, and one-active-credential enforcement;
- Student ID issue, preview, print audit, reissue, deactivation, history preservation, and one-active-card enforcement;
- direct denials for Staff, Teacher, and Office Staff management attempts;
- cross-tenant, cross-institution, cross-branch, cross-academic-year, and cross-enrollment denial cases;
- audit-output checks confirming no raw QR payload or token hash was recorded.

Authenticated browser QA passed for Principal card management, Student ID preview, Staff own-card display, Staff management denial, Staff self-camera denial, Office Staff supervised-scanner access, and Office Staff card-management denial. A 390 px viewport had no page-level horizontal overflow, and the staff own-card page exposed no print or download action. Generated print PDFs contained only card surfaces and excluded application chrome.

QA found and fixed two presentation defects: metadata overlap at physical print scale and metadata overlap on narrow mobile card surfaces. The isolated data generator was also corrected to create numeric synthetic guardian contact values. Secret-free structured evidence remains under the ignored `.tmp` directory; transient PDFs and screenshots were removed after inspection.

The known isolated non-production Supabase project was restored temporarily and target-asserted before Storage activity. A private 2 MB image bucket accepted the supplied institution logo and a synthetic representative portrait, preserved download checksums, denied direct public access and cross-prefix access, issued short-lived signed URLs, enforced expiry, rejected unsupported MIME types and oversized objects, and passed replacement and deletion cleanup. The supplied logo and synthetic portrait rendered through the production Staff and Student card components at 1280 px and 390 px with no horizontal overflow or failed images. Print-media PDFs contained exactly two CR80 pages per card type, and a raster capture of the staff QR decoded to the expected synthetic payload.

All QA objects and temporary object policies were removed. The platform rejected direct SQL deletion of the now-empty private QA bucket, as designed; it remains in the isolated non-production project with zero objects and zero QA policies and requires an authorised Storage API or dashboard session for deletion.

The missing app-level gate was then exercised against the migrated disposable database and a loopback-only private Storage emulator implementing the installed Supabase Storage client contract. Real password login sessions were created for synthetic Principal, Staff, and second-tenant Principal users. The production photo route passed valid PNG upload, 60-second signed retrieval, Staff own-photo retrieval, replacement checksum validation, previous-object cleanup, Principal deletion, post-delete not-found, unsupported MIME rejection, size-limit rejection, Staff upload/delete denial, and cross-tenant read denial. Final state contained zero photo rows and zero private objects; audit output contained two upload events and one removal event with no password, token, signed URL, bucket, or storage-path fields. The authenticated browser rendered the real Principal Staff Photograph panel and controls; the automation daemon stalled after assigning a file and did not submit a browser POST, so UI-click submission is not represented as passed. Physical printer output and real Android/iOS scanning remain pending.

## Production Release Gate Record - 2026-08-26

This review does not authorise or perform a production backup, database migration, application deployment, feature enablement, storage mutation, print job, or attendance event.

| Gate | Status | Evidence and boundary | Required completion evidence |
| --- | --- | --- | --- |
| Private staff-photo storage | Isolated infrastructure and authenticated app lifecycle passed | The isolated non-production target passed private upload, checksum download, direct-public denial, signed access and expiry, exact-prefix denial, file-type/size limits, replacement cleanup, and deletion cleanup with the supplied logo and a synthetic portrait. The migrated disposable app environment passed authenticated upload, replacement, Principal and Staff-own signed access, Staff mutation denial, cross-tenant denial, deletion, audit safety, and zero-object cleanup. One empty private QA bucket still requires authorised Storage API/dashboard deletion. No production target was contacted. | Configure and verify production server-only Storage settings only after separate backup, migration, configuration, and deployment authorisations. Repeat a short authenticated smoke test against that approved target. |
| Institution branding and representative images | Passed in isolated rendering QA | The supplied institution logo (1062 x 1242) and synthetic portrait (1122 x 1402) loaded from short-lived private signed URLs in the actual Staff and Student card components. Desktop 1280 px and mobile 390 px rendering had no failed images, overlap, or page overflow. Two-page print-media PDFs excluded app chrome and preserved branding and portrait crops. | Repeat with approved institution-owned production assets only after the production storage, migration, and deployment gates are separately authorised. |
| Physical printing | Blocked on supervised printer setup | The only discovered physical printer was offline; no approved CR80 printer/media, duplex mode, scaling setting, or on-site operator was available. No print job was submitted. PDF print output was verified at the configured 85.6 mm x 53.98 mm card size. | Record printer model/configuration without sensitive identifiers, CR80 or approved media, 100% scale, front/back alignment, margins, typography, image clarity, QR size/contrast, responsible operator, timestamp, and pass/fail result. |
| Physical QR scannability | Digital raster passed; physical not tested | The rendered QR was cropped from a browser screenshot and decoded successfully with the existing `jsQR` dependency to the expected synthetic payload. No physical card or attached mobile scanner was available. | Scan multiple printed cards under normal lighting, distance, angle, and wear conditions on the authorised attendance device; record repeated recognition and server-validated duplicate/invalid states without retaining raw payloads. |
| Android Chrome over HTTPS | Blocked | ADB was rechecked and reported zero attached devices. No approved non-production HTTPS application target was available. | Attach a physical Android device, use the approved HTTPS environment, and test digital display, brightness, responsive rendering, camera permission, scan recognition, attendance result, navigation, reload, logout, and installed-PWA mode. |
| iOS Safari/PWA over HTTPS | Blocked | `idevice_id`, `xcrun`, and Appium were unavailable from this Windows QA session. No approved non-production HTTPS application target was available. | Test on physical iPhone/iPad in Safari and installed PWA mode, including permission allow/deny, digital display, camera scan, result navigation, safe fallback, and logout. |
| Production backup and recovery | Separately gated; not authorised here | No production recovery action was performed. | Separate approval, backup reference, restore rehearsal, checksum/evidence, responsible operator, recovery result, and rollback reference. |
| Production migration | Separately gated; not authorised here | `20260825120000_add_identity_cards` remains unapplied to a deployment database by this task. | Separate approval after backup gate; target assertion, migration result, schema/status validation, operator, timestamp, and rollback reference. |
| Production deployment | Separately gated; not authorised here | No commit, push, environment change, or deployment was performed. | Separate approval after storage, physical, device, backup, and migration gates pass; deployment identifier, smoke evidence, rollback reference, and responsible operator. |

A source-level lifecycle defect was corrected during this review: photo deletion now verifies private-object removal before deleting metadata and writing the audit event. Storage failures return a safe service-unavailable result and leave the authorised metadata available for retry instead of reporting success while orphaning an object. The focused identity-card and staff-photo tests passed with 14 assertions across two files.

Production schema-drift diagnosis on 2026-08-26 found that the configured main database still has both `20260824183000_add_student_attendance_continuity` and `20260825120000_add_identity_cards` pending. Prisma therefore attempted to join `staff_profile_photos` from newer application code against an older schema and raised `P2021`. No migration was applied. The application now probes both identity-card tables, keeps stable Staff CRUD independent from the optional photo relation, and fails closed with safe unavailable states and HTTP 503 responses on identity-card actions and photo routes until the reviewed migrations are separately approved and deployed in order.

Release status remains **production-blocked**. Functional or isolated QA completion must not be interpreted as approval for backup, migration, or deployment.
## Required DB-Backed QA

After applying the migration to an approved isolated environment with synthetic fixtures, verify:

1. Principal can issue, preview, print, reissue, revoke, and review staff credential history.
2. Office/attendance operator with scan permission can scan an active staff card but cannot manage credentials unless separately authorised.
3. Staff can view only their linked active digital card and cannot print, download, scan, or access another staff card.
4. Unauthorised roles, cross-tenant, cross-institution, and cross-branch requests are denied through direct routes and actions.
5. Active, revoked, expired, superseded, duplicate, wrong-branch, leave-managed, and locked-period scan states are safe.
6. Student cards issue, print, reissue, deactivate, and preserve history within the correct enrollment and academic year.
7. Cross-year, cross-class, cross-branch, and cross-tenant student-card requests are denied.
8. Institution logos and private staff/student photographs render through short-lived authorised access.
9. Audit records exist for staff issue, reissue, view, print, revoke, photo changes, and student issue, reissue, print, and deactivate actions.
10. A printed Staff QR card remains scannable on Android Chrome and iOS Safari over approved HTTPS.

## Remaining Risks

- The migration must be separately backed up, approved, and applied before these routes can be used against a deployment database.
- Legacy staff cards must be reissued before they can be displayed digitally.
- Rotating `PASSWORD_PEPPER` makes deterministic card recovery unavailable and requires controlled card reissue.
- Browser print scaling and physical QR readability require a supervised CR80 printer and real-device verification.
- Private Storage infrastructure and DB-backed authenticated app lifecycle are verified in isolated environments. Production private-Storage configuration and its post-deployment smoke test remain separately gated.
