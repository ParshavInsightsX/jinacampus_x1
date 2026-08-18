# SchoolCast Module Removal Record

## Status

Removal date: 2026-08-18

The SchoolCast implementation has been retired from the current JinaCampus application. Active source code, routes, APIs, workers, provider adapters, feature flags, permissions, navigation, module tests, package scripts, dedicated infrastructure, and dedicated module documentation were removed. The module may be redesigned later under a separately approved architecture.

## Preserved Backup

A secret-free source archive is stored at:

`temp_meta_data/schoolcast-removal-20260818`

The archive is excluded from Git, Vercel, Docker, and production artifacts. It contains an inventory and SHA-256 manifest. All 250 archived files were re-verified after relocation. Real environment files, credentials, provider tokens, database URLs, private keys, database dumps, and private Storage objects are not included.

A protected main-database logical backup was created outside the repository and passed an isolated restore rehearsal before the forward migration was applied. Evidence file:

`jinacampus-main-backup-20260818T102752Z.dump.sha256.json`

The backup includes the public PostgreSQL schema and module database records as they existed before removal. It does not include Supabase Storage objects. The guarded main Supabase project was checked separately and did not contain the retired `schoolcast-private` bucket.

Twelve pre-existing ignored staging recovery artifacts were relocated from .tmp into the ACL-protected JinaCampus backup area outside the repository. A checksum inventory was created and verified. These artifacts are not present in source control, 	emp_meta_data, build inputs, or deployment artifacts.

## Database Removal

The previously applied migration history remains unchanged. Forward migration:

`20260818120000_remove_schoolcast_module`

The migration removes:

- 18 module tables and 18 module enum types
- tenant feature flags and delivery-mode settings
- module-only recipient, portal-link, notification, and attachment extensions
- module permissions and tenant role grants
- module-owned rows from shared notification tables

It preserves:

- the attendance WhatsApp notification foundation
- `CommunicationPreference` for guardian and staff attendance/leave consent
- `NotificationTemplate`, `NotificationOutbox`, and `NotificationDeliveryLog`
- `WhatsAppIntegrationSetting`
- staff-leave `InAppNotification` records and workflow
- shared audit infrastructure and historical generic audit evidence

The migration was first executed against a verified restored main-database snapshot. It was then applied to the guarded main database. Post-migration catalog verification reported zero module tables, enum types, columns, and permissions; six shared notification tables remained; no invalid indexes or failed migrations were present.

## Runtime Configuration

The retired Vercel environment variables were removed from the linked project. No other production environment variable was changed. The retained attendance WhatsApp provider configuration remains independent and disabled or dry-run according to its existing settings.

## Production Verification

The matching application build was deployed to the linked JinaCampus production project after the guarded database migration completed. Deployment `dpl_AbXV9HtEWTp9gcQVWPuvA87peM2N` reached `READY` and was aliased to the canonical production domain.

Post-deployment checks confirmed:

- `/login`, `/administrator/login`, and `/api/health` return HTTP 200
- protected `/dashboard` and `/administrator` routes redirect to their expected authentication entry points
- retired SchoolCast pages, APIs, cron route, inbox route, and Resend webhook return HTTP 404
- retained public pages contain no SchoolCast user-facing reference
- no SchoolCast-named production environment variable remains
- the post-deployment Vercel runtime error query returned no errors

## Recovery

Application source can be inspected from the ignored archive. Database recovery must use the protected logical backup and its verified restore procedure; restoring it would also restore the pre-removal schema and must be treated as a controlled disaster-recovery action. Reintroducing the module requires a new product, security, database, storage, and deployment review rather than copying archived code directly into production.
## Independent In-App Core

A provider-independent in-app notification centre was subsequently implemented under src/modules/notifications. It reuses the preserved legacy in_app_notifications content table for migration safety, but it does not restore SchoolCast routes, workers, providers, permissions, storage, or delivery behavior. External channels remain separate and disabled unless independently approved.
