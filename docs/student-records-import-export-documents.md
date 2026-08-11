# Student Records Import, Export, and Admission Documents

## Scope

JinaCampus supports branch-scoped student roster import/export and private admission-document storage inside Academia. The implementation reuses the existing school session, branch access, RBAC, Zod validation, student masking rules, enrollment rules, and audit logging.

## Import and Export

Route: `/academia/students/bulk`

Supported formats:

- Excel `.xlsx`
- UTF-8 `.csv`, compatible with Google Sheets

Workflow:

1. Select an accessible branch.
2. Download the Excel or CSV template.
3. Complete up to 5,000 student rows.
4. Upload and preview the file.
5. Review row/field issues.
6. Confirm the import for the valid rows; correct and re-upload skipped rows later.

The simple template contains only these mandatory columns:

1. Scholar Number
2. Student Name
3. Date of Birth
4. Current Class
5. Contact Number
6. Father's Name
7. Mother's Name

The Excel template also includes Instructions and Reference Data worksheets. Common headings such as `Scholar No`, `Admission Number`, `DOB`, `Class`, `Mobile Number`, `Father Name`, and `Mother Name` are recognized automatically. Class assignments use an active class-section name, never a database ID. A class-only value is accepted when it has exactly one active section; otherwise the row must use an exact class-section name or add an optional `Section` column.

Tenant, branch, user, and active academic-year context are resolved server-side. They are not spreadsheet fields and are never trusted from the client.

Import behavior:

- A file is limited to 4 MB and 5,000 populated student rows.
- The seven mandatory headers and values are validated before writes.
- Optional legacy/profile columns remain accepted for schools that already have the information.
- Blank optional cells and common placeholders such as `N/A`, `NaN`, and `null` are interpreted as unavailable values and persisted as null-compatible fields; users do not need to enter placeholders.
- Scholar-number duplicates, date of birth, contact format, roll number, class capacity, guardian-contact consistency, active branch, and active class-section conflicts are checked.
- File/header errors block the operation. Row errors are reported separately, and only validated rows are inserted in one database transaction.
- Student, guardian link, optional enrollment, and import summary audit events are recorded.
- Full Aadhaar and bank-account numbers are converted to masked values and last four digits before persistence.
- Spreadsheet error responses contain row, field, and safe message only; they do not echo sensitive cell values.
- Minimal imported records are shown as **Profile Incomplete** / **Additional information required** until the remaining admission profile is completed. Readiness is computed from the stored profile, so it changes to Complete without maintaining a second lifecycle status.

Export behavior:

- Exports are limited to the authenticated user's accessible branch.
- Excel output has frozen headers and filters.
- CSV output uses a UTF-8 BOM for Google Sheets and guards formula-like cells against spreadsheet injection.
- Aadhaar and bank-account fields are exported only as masked values.
- Tenant IDs, actor IDs, password data, token data, storage paths, and document checksums are excluded.
- Every export is audited with branch and record count.

## Admission Documents

The student registration form accepts optional:

- Passport-size photograph
- School Transfer Certificate
- Birth Certificate
- Additional board- or school-required admission documents

Student registration is completed first, then each selected document is uploaded separately through the permission-checked document API. This keeps each request within hosted-function upload limits and prevents one failed optional file from rolling back a valid admission. Failed files can be retried from the created student's profile.

The student profile supports later upload, view, and deletion for:

- Passport-size photograph
- Transfer Certificate
- Birth Certificate
- Identity proof
- Previous school report card
- Caste Certificate
- Migration Certificate
- Medical Certificate
- Other admission documents

Allowed file signatures:

- PDF
- JPEG
- PNG
- WebP

File extension and browser MIME declarations are not trusted. JinaCampus detects the file signature server-side and applies the configured size limit. Passport photographs must be images.

## Storage and Security

Files are stored in a private Supabase Storage bucket. The database stores tenant-scoped metadata and object paths only; it does not store file bytes or public URLs.

Required server-only environment variables:

```env
SUPABASE_URL="https://<project-ref>.supabase.co"
SUPABASE_SERVICE_ROLE_KEY="<server-only-service-role-key>"
STUDENT_DOCUMENTS_BUCKET="student-documents"
STUDENT_DOCUMENT_MAX_BYTES="4000000"
```

Rules:

- Never use a `NEXT_PUBLIC_` or `EXPO_PUBLIC_` prefix for the service-role key.
- Never commit the service-role key.
- Configure the values in Vercel Project Settings for the required environments.
- `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` must be configured together.
- The bucket is created as private on the first authorized upload if it does not exist.
- If an existing bucket with the configured name is public, uploads fail closed.
- Object keys are generated server-side as tenant/student/document paths with sanitized filenames.
- Downloads require `academia.student.update` for the student's branch and use a 60-second signed URL.
- Non-image records are served as downloads rather than permanent public links.
- Deletion removes the object, soft-marks metadata, and records an audit event.
- Teachers with student-view permission do not automatically receive document access.

## Deployment

Apply the included additive migration using the approved direct PostgreSQL connection:

```powershell
npx prisma migrate deploy
```

Then configure the storage variables and redeploy. The migration adds only `StudentDocumentType` and `student_documents`; it does not alter existing student rows.

The private bucket and server-only Storage variables were configured for Vercel Production and Preview on 2026-08-05. The additive migration and dedicated DB-backed student-record boundary QA were verified against the approved Supabase environment on 2026-08-06.

## QA Checklist

- Download Excel and CSV templates for an allowed branch.
- Download the seven-column Excel and CSV templates and verify the sample row and active class references.
- Preview a valid minimal file and verify row counts and flexible header aliases.
- Verify blank optional cells and `N/A` markers are accepted as unavailable values.
- Verify malformed dates, Aadhaar, category, missing headers, duplicate admission numbers, duplicate roll numbers, and unavailable class sections are rejected.
- Import a mixed valid/invalid file and verify only valid rows create Student, Guardian, link, Enrollment, and audit rows.
- Verify minimally imported students show Profile Incomplete and can be completed through the existing profile/admission workflow.
- Verify a second tenant or unauthorized branch cannot preview, import, export, upload, open, or delete files.
- Verify exported Aadhaar and bank fields remain masked.
- Upload valid PDF/JPEG/PNG/WebP files and reject extension-spoofed files.
- Verify an oversized file is rejected.
- Verify the bucket is private and signed links expire.
- Verify deleted files disappear from the profile and are removed from storage.

## Historical DB-Backed Browser QA - 2026-08-06

Status: Passed

This pass verified the earlier strict all-or-nothing importer and the unchanged tenant, export, and document-storage boundaries. The seven-field and partial-row workflow added later is covered by focused source tests and requires a short DB-backed mixed-row browser smoke before the next production release.

The release-equivalent production build was exercised with disposable two-tenant fixtures and a same-tenant unauthorized branch. The authenticated browser was used for the bulk-import workflow and rendered student profile. Exact authenticated HTTP requests from the same session covered route-level negative boundaries without exposing the session value.

| Area | Result | Evidence |
|---|---|---|
| Accessible branch selection | Pass | The Principal saw only the authorized branch in the bulk-record screen. |
| Valid CSV import | Pass | Two rows previewed and committed; Student, Guardian, link, and Enrollment rows were created. |
| Invalid mixed import (historical behavior) | Pass | Under the previous contract, invalid Aadhaar/category input disabled commit and persisted no rows. Current behavior deliberately imports valid rows and reports invalid rows separately. |
| Class-section resolution | Pass | `Grade 1-A` resolved once after duplicate aliases generated for the same class-section were deduplicated. |
| Branch and tenant isolation | Pass | Same-tenant unauthorized-branch and cross-tenant preview, commit, export, upload, open, and delete requests returned safe 403/404 responses. |
| CSV export | Pass | UTF-8 BOM present; authorized rows only; formula-like cells escaped; Aadhaar and bank account masked. |
| Excel export | Pass | Workbook opened successfully and contained only authorized, masked student records. |
| Private document upload | Pass | PDF, JPEG, PNG, and WebP accepted; spoofed PDF and oversized input rejected safely. |
| Private document access | Pass | The profile rendered four documents; access used a permission-checked signed download and exposed no storage path or checksum. |
| Document deletion | Pass | All four records were soft-deleted, objects were removed from Storage, old document routes rejected access, and the profile no longer listed the files. |
| Audit evidence | Pass | Bulk import, export, document upload, and document delete audit actions were present. |
| Sensitive output | Pass | Normal UI and exports excluded tenant/actor IDs, storage metadata, credentials, password/token fields, and full Aadhaar/bank values. |
| Storage posture | Pass | The configured student-document bucket remained private. |

Confirmed QA defects fixed:

- Deduplicate equivalent aliases generated for one class-section so a valid display name is not reported as ambiguous.
- Map tenant/branch permission failures in student import, export, template, and document route handlers to safe 403 responses instead of generic 500 responses.
- Give school and Administrator login forms an explicit POST fallback so an unhydrated browser cannot submit credentials through a URL query string.

No persistent QA account, tenant, student, document object, or browser session is retained after cleanup.

## Known Limits

- Imports are intentionally insert-only. Existing students are reported as conflicts rather than overwritten.
- A class-only value is intentionally rejected as ambiguous when more than one active section exists for that class.
- The new seven-field/partial-row contract still needs a DB-backed mixed-row browser smoke after these source-level changes.
- Files above the configured standard-upload limit require a future direct/resumable-upload flow.
- Automated malware scanning and document OCR are not included. Files are limited to authenticated administrators, approved signatures, private storage, and short-lived access; add an approved scanning service before accepting documents from untrusted public users.
- Background import jobs are not required at the current 5,000-row limit because inserts are batched in one bounded server request. Reassess if pilot files or Vercel execution limits exceed this envelope.
