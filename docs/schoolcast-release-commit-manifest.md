# SchoolCast Release Commit Manifest

## Status

**Restricted publication authorised; not yet staged, committed, pushed, migrated, or deployed.** `SC-AUTH-DEPLOY-20260815` permits the reviewed release commit, push, and deployment only with SchoolCast remaining `DISABLED`. The production migration and every activation action remain separately gated.

## Staging Rule

The release commit must be created from the reviewed working tree with explicit paths and, for shared files, explicit hunks. Do not use `git add -A`, `git add .`, or an equivalent broad staging command.

## SchoolCast-Owned Scope

The following paths are candidates for the SchoolCast release commit after final review:

- `prisma/migrations/20260814120000_add_schoolcast_mvp_foundation/`
- `src/app/(dashboard)/schoolcast/`
- `src/app/(dashboard)/notifications/page.tsx`
- `src/app/api/cron/schoolcast/`
- `src/app/api/schoolcast/`
- `src/app/api/webhooks/resend/route.ts`
- `src/lib/files/schoolcast-attachment-file.ts`
- `src/modules/schoolcast/`
- `scripts/*schoolcast*`
- `tests/unit/schoolcast-mvp.test.ts`
- `tests/unit/schoolcast-deployment-policy.test.ts`
- `docs/schoolcast-*.md`

## Shared Files Requiring Hunk Review

These files contain SchoolCast integration points but may also contain unrelated work. Stage only reviewed SchoolCast hunks:

- `.env.example`
- `PRD.md`
- `TASKS.md`
- `package.json` and `package-lock.json`
- `prisma/schema.prisma`
- `src/app/(dashboard)/layout.tsx`
- `src/config/navbar.ts`
- `src/components/app-shell/navigation.ts`
- `src/components/app-shell/navigation-icon.tsx`
- `src/components/app-shell/desktop-navigation-dock.tsx`
- `src/lib/audit/audit-log.ts`
- `src/lib/env-validation.ts`
- `src/lib/errors/index.ts`
- `src/lib/rbac/permissions.ts`
- `src/lib/rbac/roles.ts`
- `src/lib/storage/supabase-storage.ts`
- `src/modules/academia/services/student-attendance.service.ts`
- `src/modules/campus-core/calendar/calendar-service.ts`
- `src/modules/campus-core/administrator-services.ts`
- `src/modules/campus-core/components/administrator-school-forms.tsx`
- `src/app/administrator/schools/[tenantId]/edit/page.tsx`
- `src/modules/notifications/services/notification-outbox.service.ts`
- `src/modules/notifications/webhooks/whatsapp-webhook.handler.ts`
- `src/modules/staffboard-lite/services/staff-attendance.service.ts`
- `src/modules/staffboard-lite/services/staff-leave.service.ts`
- `src/modules/staffboard-lite/services/staff-qr.service.ts`
- `tests/unit/student-attendance-service.test.ts`
- `tests/unit/staffboard-lite-attendance-correction-service.test.ts`
- `tests/unit/staffboard-lite-qr-scan-service.test.ts`
- `tests/unit/staffboard-lite-tenant-isolation.test.ts`

Only the reviewed SchoolCast deployment-policy hunks in Administrator Portal files are eligible. GradeBook staging wrappers, navbar visual changes, and other unrelated modifications remain excluded unless independently reviewed and approved.

## Explicit Exclusions

- The untracked `({tag` entry must not be staged or committed.
- Protected environment files, database URLs, provider credentials, scanner endpoints, signed URLs, recipient data, and QA passwords must never be staged.
- No production feature flag, provider configuration, storage resource, or database migration belongs in a source commit.
- FeeDesk integration is excluded because the source module is unavailable.

## Review Procedure

1. Create a dedicated release branch from the approved baseline.
2. Review `git diff -- <path>` for every shared file.
3. Stage SchoolCast-owned paths explicitly and shared hunks with `git add -p -- <path>`.
4. Verify `git diff --cached --name-status` and `git diff --cached --check`.
5. Confirm `git status --short` still lists `({tag` as untracked and unstaged.
6. Scan the staged patch for credentials, database URLs, tokens, contact data, and private endpoints.
7. Run the full quality gates against the exact staged tree.
8. Record reviewer approval and the final commit hash in the release ledger before push.

## Publication Gate

The restricted source commit and push may proceed under `SC-AUTH-DEPLOY-20260815`. Do not migrate production without `SC-AUTH-MIG-20260815`, and do not deploy the generated client against the pre-migration schema. Workers, providers, production settings, feature flags, tenant enablement, and live delivery remain prohibited.
