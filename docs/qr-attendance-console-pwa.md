# QR Attendance Console and PWA Installation

## Status

- Implementation date: 2026-08-10
- Source status: implemented and covered by focused tests
- Database status: `20260810120000_add_staff_qr_lifecycle` is applied to the approved Supabase deployment database
- Device status: physical Android Chrome and iOS Safari installation/camera QA remains pending

No password, session secret, raw QR payload, QR token, token hash, database URL, or private deployment URL is documented here.

## Operator Model

JinaCampus retains the approved five-role governance model. It does not add a sixth tenant role.

- `PRINCIPAL` is an authorised QR operator.
- `OFFICE_STAFF` is the operational Operator role when it also has `staffboard.attendance.qr.generate` for the selected branch.
- Teacher and Staff roles cannot manage QR codes.
- Navigation filtering is user experience only. The query, generation service, and deactivation service all enforce the role boundary and branch permission on the server.

The dedicated console remains at `/staffboard/attendance/qr` so existing links and attendance workflows do not need a parallel implementation.

## QR Lifecycle

Every newly generated StaffBoard attendance QR uses a fixed validity window of five hours, or 18,000 seconds. The client cannot choose or override this value.

Lifecycle states:

- `ACTIVE`: may be accepted while `validFrom <= now < validUntil`.
- `DEACTIVATED`: manually disabled or replaced by regeneration and never accepted.
- `EXPIRED`: outside the validity window and never accepted.

Only one active token can exist for a tenant, branch, and purpose combination. Regeneration deactivates the previous active token in the same transaction before the replacement is created. Existing codes are not extended by the migration.

The server always validates `validUntil`, even if a lifecycle row has not yet been reconciled to `EXPIRED`. Expiry reconciliation is performed during generation, manual deactivation, or scan validation and is audited. This means acceptance never depends on the browser countdown or a scheduled job.

## Security and Audit

- Raw QR tokens are returned once inside the rendered QR payload and are never stored.
- Only SHA-256 token hashes are stored.
- Tenant, branch, actor, role, permission, staff profile, purpose, and attendance status remain server-derived.
- Successful scans remain authenticated and require `staffboard.attendance.self_scan`.
- Wrong-tenant, wrong-branch, expired, deactivated, and duplicate attendance attempts are rejected safely.
- Generation, regeneration, deactivation, expiry reconciliation, and successful use have dedicated audit events.
- Audit metadata includes safe purpose and lifecycle timestamps but excludes raw QR values and token hashes.

## Console Behavior

The QR Attendance Console displays:

- selected branch and purpose
- generated time
- expiry time
- fixed validity duration
- active, deactivated, or expired status
- remaining validity as `HH:MM:SS`
- regenerate and deactivate controls

Regeneration invalidates the previous active code for the same branch and purpose. The console cannot recover a raw QR after a browser refresh; the operator should generate a replacement, which safely deactivates any prior active code.

## PWA Installation

The authenticated mobile navigation contains an **Install JinaCampus** control.

- Browsers that expose `beforeinstallprompt` receive the native install prompt after the user taps the control.
- iPhone and iPad users receive Safari guidance: Share, Add to Home Screen, enable Open as Web App, then Add.
- In-app browsers are directed to open the approved HTTPS link in Safari or Chrome.
- Other browsers receive truthful browser-menu guidance when a programmable install prompt is unavailable.
- Standalone installations are detected so the UI does not repeatedly request installation.

The existing web manifest, icons, Apple metadata, responsive shell, secure login, and camera permissions policy are reused. No offline service worker, cached attendance mutation, background sync, or push notification behavior is added. The installed application remains online-first and all attendance actions continue to use the authenticated server APIs and services.

## QA Checklist

Source and automated checks:

- Principal generation succeeds with branch permission.
- Office Staff Operator generation succeeds with branch permission.
- Teacher/Staff generation and deactivation are denied server-side.
- Client validity, tenant, actor, token hash, and raw-token fields are rejected.
- Five-hour generated and expiry timestamps are correct.
- Regeneration deactivates the previous active token.
- Manual deactivation is tenant- and branch-scoped.
- Expired and deactivated tokens are rejected by scan validation.
- Successful usage updates safe lifecycle metadata and writes a usage audit.
- PWA prompt and Safari guidance are reachable from authenticated mobile navigation.

Deployment database and HTTPS checks completed on 2026-08-10:

1. `npx prisma migrate deploy` completed successfully with all 18 migrations applied and no pending migration.
2. The migration ledger contains a finished, active `20260810120000_add_staff_qr_lifecycle` entry.
3. All six QR lifecycle columns are present, and no duplicate active tenant/branch/purpose groups exist.
4. The deployment role graph grants QR generation to Principal and Office Staff only. Teacher and Staff role checks are denied before mutation.
5. The active Principal assignment resolves its permitted branch after first-login completion; cross-branch access is denied. The current Principal still requires its first password change.
6. The public HTTPS deployment serves the standalone manifest, required 192px and 512px icons, and `Permissions-Policy: camera=(self), microphone=()`.

Checks still required for release readiness:

1. Complete the Principal's required first-login password change, then run generation, regeneration, deactivation, and audit-log browser QA.
2. Provision or designate an active branch-scoped Office Staff QR Operator fixture and run its positive browser authorization pass.
3. Provision or designate an active linked Staff/Teacher scanning fixture and run valid, expired, deactivated, wrong-branch, and duplicate scan QA.
4. Install from Android Chrome through the approved HTTPS URL and verify login, navigation, camera scan, and logout.
5. Install from iOS Safari through Add to Home Screen and repeat login, navigation, camera permission, scan, and logout checks.

## Remaining Risks

- The five-hour window is intentionally longer than the former short window. Regeneration/deactivation controls and branch-scoped authenticated scanning reduce, but do not eliminate, screenshot-sharing risk.
- Physical-device installation and camera behavior varies by browser and operating-system policy and must be verified on the approved deployment URL.
- Full browser mutation QA and physical-device camera/install QA remain release gates; source and database readiness alone do not establish device readiness.
