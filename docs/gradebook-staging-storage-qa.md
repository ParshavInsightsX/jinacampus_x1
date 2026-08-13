# GradeBook Staging Private Storage QA

Status date: 12 August 2026

Overall result: **Infrastructure verified; application workflow QA blocked. GradeBook remains disabled in production.**

## Safety Boundary

- Target: the isolated gradebook-mvp-staging Supabase project only.
- Data: synthetic jinacampus-demo pilot records only.
- Production database, production Storage, Vercel, and RDA school data were not accessed or changed.
- Storage credentials remain outside the repository in the ACL-protected staging local environment.
- No database URL, service-role key, signed URL, object payload, student record, or password is recorded here.

## Verified Infrastructure

| Control | Result |
|---|---|
| Staging project identity | Pass: active and healthy |
| Bucket | Pass: gradebook-private exists |
| Public access | Pass: bucket is private |
| File-size limit | Pass: 10 MB |
| MIME allowlist | Pass: PDF, XLSX, CSV |
| Direct browser-role policies | Pass: zero public, anon, or authenticated policies target the bucket |
| Application object prefix | Source pass: tenant / branch / academic year prefixes |
| Report-card signed URL lifetime | Source pass: 60 seconds |

Supabase's current Storage guidance confirms that private bucket downloads require authorised access or a time-limited signed URL. The JinaCampus design intentionally performs every Storage operation in server-only code; browser roles receive no direct object policy.

## Protected Environment Status

Required server-only staging variables:

~~~text
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
GRADEBOOK_STORAGE_BUCKET=gradebook-private
GRADEBOOK_IMPORT_MAX_BYTES=10000000
GRADEBOOK_REPORT_CARD_MAX_BYTES=5000000
~~~

All required variables are configured in the protected staging environment. The correct application variable is GRADEBOOK_STORAGE_BUCKET; GRADEBOOK_PRIVATE_BUCKET is not used. Variable values were not printed, logged, or copied into this QA record.

Configure or rotate the staging server key through the masked staging-only prompt:

~~~powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\configure-gradebook-staging-storage.ps1
~~~

The configurator:

- accepts the key through Read-Host -AsSecureString;
- refuses the production project and any database target other than approved staging;
- writes only below %LOCALAPPDATA%\JinaCampus\secrets;
- applies a current-user-only ACL with inheritance removed and verifies exactly one current-user Full Control rule;
- does not use the clipboard;
- does not print the key.

The first Windows run exposed a compatibility defect: Set-Acl applied the intended DACL but then raised a SeSecurityPrivilege error while writing the broader security descriptor. The configurator now uses icacls for the DACL operation and verifies the resulting ACL independently. The existing protected file and the patched script both pass that verification.

After configuration:

~~~powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\gradebook-staging.ps1 -Command StorageAssert
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\gradebook-staging.ps1 -Command StorageProbe
~~~

StorageAssert passed against the approved staging project. StorageProbe also passed with synthetic payloads: private direct-access denial, server upload/download integrity, forbidden-MIME rejection, signed URL expiry, object deletion, empty-prefix cleanup, and the synthetic QA audit ledger all passed. The probe deleted its temporary objects in a finally block.

## Application Workflow Audit

| Workflow | Implementation status | Live staging result |
|---|---|---|
| Marks-import upload | Implemented: non-overwriting CSV/XLSX upload, size/type checks, SHA-256 hash, tenant-safe key | Infrastructure pass; application E2E pending |
| Import validation | Implemented synchronously with row-level valid/invalid results | Application E2E pending |
| Validated marks application | Implemented with serializable transaction, version check, idempotency claim, and audit | Application E2E pending |
| Duplicate import handling | Implemented by tenant/batch/file-hash uniqueness | Application E2E pending |
| Import validation-report object | **Missing**: errorObjectKey exists but no report file is generated or stored | Fail / release blocker |
| Import-file signed download | **Missing** | Fail / release blocker if operational download is required |
| Import-file retention / expiry | **Missing**: no approved policy, expiry marker, or cleanup worker | Fail / release blocker |
| Cancelled/failed import object cleanup | **Missing**: cancellation retains the original object | Fail / release blocker |
| Audited import deletion / retention | **Missing** | Fail / release blocker |
| Report-card PDF generation/storage | Implemented with immutable snapshot/checksum and tenant-safe key | Infrastructure pass; application E2E pending |
| Authorised signed report-card download | Implemented with feature, permission, tenant, branch, academic-year, and teacher-assignment checks | Application E2E pending |
| Signed URL expiry denial | Supported by provider URL TTL | Pass in deterministic infrastructure probe; report-card flow pending |
| Report-card download audit | Implemented without recording signed URL or storage secret | Application E2E pending |
| Cross-tenant/cross-scope report-card denial | Source control present; prior role/scope matrix passed | Full report-card object flow pending |

## QA Tooling Added

- scripts/configure-gradebook-staging-storage.ps1
- scripts/gradebook-staging-storage-probe.ts
- StorageAssert and StorageProbe commands in scripts/gradebook-staging.ps1
- focused source tests for target pinning, masked input, secret non-exposure, private access, expiry, MIME restrictions, cleanup, and audit evidence

The probe is infrastructure evidence only. Its synthetic audit events do not replace production import/report-card lifecycle audit events.

## Release Decision

GradeBook is **not ready for production**. The private staging bucket and synthetic object lifecycle are verified, but the application storage gate remains incomplete until validation-report storage, import-file retention/expiry, secure cleanup, and audited deletion behavior are designed, implemented, migrated if necessary, and retested through authenticated GradeBook workflows.

The following independent gates also remain open:

- provider backup/PITR or restore evidence;
- functional, regression, concurrency, and production-scale load certification;
- executable asynchronous workers and monitoring;
- embedded Unicode PDF font and multilingual verification;
- student/guardian publication-access policy;
- formal academic approval.

No production migration, production Storage mutation, source commit, deployment, or production GradeBook enablement is authorised by this QA record.
