# Institution Legal Identity, Recognition, and Affiliation

## Purpose

JinaCampus stores an institution's friendly display identity separately from its legal and regulatory identity. This prevents a school name, UDISE Code, board school code, recognition order, and affiliation number from being treated as interchangeable values.

The foundation is additive and preserves existing institution workflows. Existing schools receive an incomplete regulatory profile and can continue normal operations while authorised users complete the information.

## Data model

- `Institution` keeps the canonical legal name, former names, establishment year, school type, location, and official contact details.
- `InstitutionManagingEntity` stores the legal trust, society, company, government body, or other entity responsible for the institution.
- `InstitutionManagingEntityAssignment` provides institution/branch scope and effective-dated history.
- `EducationAuthority` is a controlled authority directory. Initial India-focused entries cover UDISE, CBSE, CISCE, NIOS, NCMEI, Madhya Pradesh School Education, and MPBSE.
- `InstitutionIdentifier` stores UDISE, state school codes, board school codes, and other identifiers with explicit availability states.
- `OfficialIdentifierClaim` stores an HMAC fingerprint for cross-tenant duplicate prevention. It does not expose the normalized identifier or the other tenant.
- `InstitutionAuthorization` stores recognition, affiliation, accreditation, registration, NOC, prior permission, and minority-status records.
- `InstitutionAuthorizationCoverage` stores education stage, grade, programme, stream, and medium coverage.
- `InstitutionRegulatoryDocument` stores private evidence metadata. Original files are never public by default.
- `InstitutionRegulatoryProfile` tracks setup completeness without blocking unrelated school operations.

## Lifecycle and verification

School users with the granted Principal-family permissions may read, manage, and submit records. Submitting a draft changes it to `PENDING_REVIEW` and `SELF_DECLARED`.

Verification and publication permissions are intentionally separate and are not granted to Principal-family roles by default. No record becomes verified or public merely because a school user entered it. A future controlled platform workflow must assign those permissions to an independently authorised reviewer.

Publication requires both a publication lifecycle and an eligible data classification. Private evidence originals are never used as public copies; a separately reviewed redacted object is required for future public disclosure.

## Validation and duplicate protection

- Assigned UDISE Codes must contain exactly 11 digits.
- `PENDING_ASSIGNMENT`, `NOT_APPLICABLE`, and `UNKNOWN` are explicit states; placeholder values such as `N/A`, `Pending`, and `Unknown` are rejected.
- Recognition and affiliation remain distinct records.
- Date ranges and grade coverage are validated on the server and constrained in PostgreSQL.
- Official identifier comparisons use normalized values and a domain-separated HMAC fingerprint derived from the existing server secret. Raw identifiers are not placed in duplicate-conflict responses.
- Superseded records remain available as history and are not overwritten.

## Security boundary

Every query and mutation requires:

1. An authenticated school user.
2. The regulatory read/manage/submit permission required by the action.
3. Tenant-scoped institution lookup.
4. Branch access for branch-specific records.
5. Zod validation.
6. A tenant-safe Prisma query or transaction.
7. An audit record for critical changes and document access.

The workspace DTO excludes normalized identifier values, storage buckets, private object keys, claim fingerprints, actor IDs, and internal tenant identifiers.

## Private evidence storage

Server-only environment settings:

```text
INSTITUTION_REGULATORY_DOCUMENTS_BUCKET=institution-regulatory-documents
INSTITUTION_REGULATORY_DOCUMENT_MAX_BYTES=4000000
```

The Supabase URL and service-role key remain server-only shared storage settings. The configured bucket must be private. Object paths are tenant/institution/scope/document namespaced. Files are signature-checked and restricted to PDF, JPEG, PNG, or WebP. Authorised downloads use 60-second signed URLs and are audited.

## User workflow

The institution profile links to **Legal Identity & Recognition**. The workspace presents:

1. Legal identity and official contact details.
2. Managing entity and history.
3. Official identifiers.
4. Recognition, affiliation, accreditation, and coverage.
5. Private evidence documents.

Incomplete setup is clearly labelled and does not break CampusCore, Academia, attendance, StaffBoard, or GradeBook.

## Migration and release status

Migration:

```text
20260826120000_add_institution_regulatory_identity
```

The migration is additive, backfills legal names and incomplete profiles, seeds the controlled authority directory and requirement profiles, adds permissions, and enables RLS on new tenant-owned tables.

The migration was applied to the explicitly approved primary database on 26 August 2026 after target verification, a protected read-only backup, an isolated PostgreSQL 17 restore rehearsal, and an upgrade rehearsal against the restored schema. Post-migration validation confirmed that all 32 committed migrations are applied and no migration is failed or pending.

## Verification evidence

On 26 August 2026, the approved release gate produced the following secret-free evidence:

- Target checks confirmed that the runtime pooler, direct migration connection, private-storage configuration, and approved project reference all resolved to the same primary project before any database action.
- A read-only `public` schema backup was written to the protected local recovery directory as `jinacampus-main-backup-20260826T151859Z.dump`. Its SHA-256 checksum is `0754918abb620171f80dde5fe00c492436524782837651f4d96e8485da00b282`.
- The backup restored successfully into a disposable, network-isolated PostgreSQL 17 container. The restored baseline contained 31 applied migrations, 122 public tables, 447 foreign keys, no failed migration, no invalid index, and no unvalidated constraint.
- The regulatory migration was rehearsed against that restored production baseline. Tenant, institution, user, student, staff, attendance, and migration-history counts remained unchanged. The migration SQL checksum was `a2d36df1fe36649c5f571e4961a7225c9155f28dcbc99eaa3aae57e10779b30f`.
- Production migration deployment applied only `20260826120000_add_institution_regulatory_identity`. Postflight validation found 32 applied migrations, no failed migration, ten expected regulatory tables with RLS enabled, seven authority records, ten permissions, no invalid index, and no unvalidated constraint.
- Existing school roles received the intended school-side permissions. No Principal-family role received independent verification or publication authority.
- Authenticated Principal browser QA passed at 1280 x 900 and 390 x 844. The workspace rendered without horizontal overflow, retained usable touch targets, displayed the pending-review and self-declared states, and exposed no verification or publication control.
- Cross-branch and cross-tenant direct access attempts were denied by server-side scope checks. The inaccessible branch was not disclosed in the Principal workspace.
- Private evidence upload, authenticated signed access, replacement, and deletion passed. The bucket remained private, direct public access was denied, and signed access expired after the configured 60-second window.
- The submitted synthetic record remained `PENDING_REVIEW`, `SELF_DECLARED`, and `NOT_PUBLISHED`, confirming that school-side submission cannot self-verify or self-publish.
- The temporary Principal account, branch, regulatory rows, and storage objects were removed after QA. Fourteen audit entries were retained. No RDA school record was read for mutation or modified.
- Extension-free browser QA reported no application runtime error. Screenshots were captured as temporary local evidence, inspected, and removed without being committed because they contained synthetic regulatory details.

The database migration is complete. No source-code commit, remote push, application deployment, production feature enablement, or external-provider activation was performed by this gate.

## Remaining release risks

- Independent verifier and publication-role assignment requires an approved governance owner.
- Public regulatory disclosure requires redaction, publication review, and legal approval.
- Authority-specific requirement profiles are an initial India-focused foundation and require periodic regulatory review.
- The database backup covers the PostgreSQL `public` schema. Supabase Storage object backup, retention, and disaster-recovery procedures remain an operational follow-up even though the private document lifecycle passed.
- Purpose-specific identity resolution is available for server-side integrations, but immutable snapshots for report cards, receipts, certificates, and identity cards remain a controlled follow-up rather than being silently introduced into stable document workflows.
- Verification, publication, redaction, expiry alerts, and public-disclosure screens remain disabled until their governance and legal release gates are approved.
- No JinaCampus screen should claim government or board verification until an authorised reviewer has completed the applicable evidence process.
