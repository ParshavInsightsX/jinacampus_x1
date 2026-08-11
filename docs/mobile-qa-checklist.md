# Phase 8.2 Mobile Browser QA Checklist

This document records the Phase 8.2 responsive browser QA plan for the current JinaCampus MVP. It is intentionally web/PWA-ready QA only; it does not add a native mobile app, camera scanner, offline service worker, exports, charts, or new backend workflows.

Phase 8.2 no-new-browser-framework QA is complete. Authenticated mobile QA continues as `TASKS.md` Phase 9.7 after the local database is reachable and seeded with users/data for admin/principal, teacher, and staff flows.

Current QR/PWA update (2026-08-11): the authenticated mobile drawer includes progressive JinaCampus installation controls, including Safari Add to Home Screen guidance. The QR Attendance Console uses a fixed five-hour lifecycle and explicit deactivate/regenerate controls. The staff scanner now uses an automatic 1:1 square `jsQR` scan region, processing lock, optional camera/flashlight controls, and a confirmation/current-status/history flow. Offline attendance remains out of scope; approved-HTTPS physical-device installation and camera QA is still required.

## Browser QA Approach

- Playwright is not installed in this repo.
- Playwright was not added because Phase 8.2 only allows adding browser tooling when TASKS.md explicitly approves it.
- A temporary local Chrome DevTools Protocol smoke check was run instead, using the existing dev server and installed Chrome.
- The smoke check covered 100 route/viewport combinations across the route list and viewport matrix below.
- Result: no horizontal page overflow, no protected-route redirect failures, no framework error overlays, no QR-secret text, and no small touch-target samples on the public login screen.

## Phase 8.2 Environment Limitation

During the original Phase 8.2 no-new-browser-framework pass, authenticated visual QA for protected pages was pending because the local database was not reachable:

```txt
Can't reach database server at localhost:55432
```

Protected routes were still checked unauthenticated and redirected to `/login` as expected. A later authenticated pass was recorded below on 2026-05-11. Phase 9.7 should repeat authenticated mobile QA after richer demo seed data exists for admin/principal, teacher, and staff flows.

For Phase 9.7, authenticated mobile QA requires a seeded DB with:

- Admin/principal user.
- Teacher user assigned to a class-section with active students.
- Staff user with an active staff profile.
- Staff attendance settings that allow QR generation on the QA branch.
- Sample records where needed for correction and report views.

## Viewport Matrix

| Viewport | Size | Purpose |
| --- | --- | --- |
| Phone | 360 x 800 | Small Android phone width |
| Phone | 390 x 844 | Common modern phone width |
| Phone | 414 x 896 | Large phone width |
| Tablet | 768 x 1024 | Tablet portrait width |
| Desktop | 1280 x 800 | Office desktop or laptop |

## Routes To Check

Authentication:

- `/login`

Dashboard:

- `/dashboard`

Academia:

- `/academia`
- `/academia/classes`
- `/academia/sections`
- `/academia/class-sections`
- `/academia/subjects`
- `/academia/students`
- `/academia/guardians`
- `/academia/enrollments`
- `/academia/attendance`
- `/academia/attendance/mark`
- `/academia/attendance/reports`

StaffBoard Lite:

- `/staffboard`
- `/staffboard/staff`
- `/staffboard/categories`
- `/staffboard/attendance`
- `/staffboard/attendance/qr`
- `/staffboard/attendance/scan`
- `/staffboard/attendance/reports`

## Responsive Checklist

For each route and viewport:

- [ ] No horizontal page overflow at 360 px.
- [ ] Header and page title remain visible.
- [ ] Sidebar or mobile menu remains usable.
- [ ] Primary action is visible and tappable.
- [ ] Cards stack cleanly.
- [ ] Tables scroll horizontally or convert safely.
- [ ] Forms use full-width fields on mobile.
- [ ] Buttons and inputs have practical touch targets.
- [ ] Error and success messages fit inside the viewport.
- [ ] Empty states remain readable.
- [ ] Protected pages redirect unauthenticated users to `/login`.
- [ ] No raw QR token or token hash appears in UI output.

## Priority Flow Checklist

Student Attendance Marking, `/academia/attendance/mark`:

- [ ] Date input is usable on phone width.
- [ ] Class-section selector is usable.
- [ ] Mark All Present is visible and easy to tap.
- [ ] Student rows are readable.
- [ ] Status selector is touch-friendly.
- [ ] Remarks do not break the row layout.
- [ ] Submit button remains easy to find.
- [ ] Locked state is clear.

Staff QR Scan, `/staffboard/attendance/scan`:

- [ ] Camera scanner Start Camera button is visible and tappable.
- [ ] Camera preview is centered, square, and does not overflow at 360 px.
- [ ] Camera permission request appears on supported devices.
- [ ] Rear camera is preferred and scanning begins automatically without a capture button.
- [ ] A QR inside the square is decoded once and the UI remains locked during server validation.
- [ ] Camera switch appears only with multiple cameras; flashlight appears only when supported.
- [ ] Camera denial shows a safe fallback message.
- [ ] Live QR scan submits decoded token without showing token hash or raw internals.
- [ ] Manual token input is easy to paste or type into.
- [ ] Submit button is large enough.
- [ ] Success redirects to My Attendance and shows staff, institution, branch, date/time, purpose, and status.
- [ ] Duplicate, expired, invalid, wrong-branch, and check-in-required errors remain on the scanner and are readable.
- [ ] Today and recent personal attendance history fit phone width.
- [ ] QR secrets are not shown.
- [ ] Manual fallback remains available when camera scanning fails.
- [ ] HTTPS requirement is communicated for deployed environments.

Staff QR Display / QR Attendance Console, `/staffboard/attendance/qr`:

- [ ] QR code remains large and centered.
- [ ] `HH:MM:SS` remaining-validity countdown remains readable for the five-hour window.
- [ ] Purpose selector is usable.
- [ ] Generate button is visible.
- [ ] Generated time, expiry time, and active/deactivated/expired status are clear.
- [ ] Regenerate immediately invalidates the previous code for the same branch and purpose.
- [ ] Deactivate immediately prevents further use.
- [ ] Teacher and Staff direct-route access is denied; Principal and Office Staff Operator access follows branch permission.
- [ ] Tablet layout works for front-office display.

PWA installation from authenticated mobile navigation:

- [ ] Android Chrome shows the browser install prompt or truthful browser-menu guidance over approved HTTPS.
- [ ] Installed Android app restores secure login/session behavior and opens responsive navigation.
- [ ] iOS Safari guidance explains Share, Add to Home Screen, Open as Web App, and Add.
- [ ] Installed iOS web app supports login, navigation, and camera permission where the device/browser allows it.
- [ ] In-app browsers direct users to Safari or Chrome instead of claiming installation succeeded.
- [ ] Installed mode does not imply offline attendance or bypass server-side RBAC.

Staff Attendance Admin, `/staffboard/attendance`:

- [ ] Filters stack on mobile.
- [ ] Summary cards are readable.
- [ ] Table scrolls safely.
- [ ] Correction action is accessible to authorized users.
- [ ] Action buttons are not cramped.

Reports:

- [ ] `/academia/attendance/reports` filters stack on mobile.
- [ ] `/academia/attendance/reports` tables scroll safely.
- [ ] `/staffboard/attendance/reports` filters stack on mobile.
- [ ] `/staffboard/attendance/reports` tables scroll safely.
- [ ] Empty report states are readable.

## Phase 9.7 Authenticated Mobile QA

Status: completed on 2026-05-13 for the seeded QA data available at that time. The pass verified authenticated owner/admin access, responsive route rendering, edit route rendering where seeded IDs existed, safe empty states, and QR-secret safety. Phase 9.8 now adds richer demo seed data for the teacher, staff, QR, attendance, correction, reports, and dashboard flows that remained limited in this pass.

Use this section again after running the Phase 9.8 demo seed.

Users and roles to test:

- Admin/Principal
- Teacher
- Staff

Required viewports:

- 360 x 800
- 390 x 844
- 414 x 896
- 768 x 1024
- 1280 x 800

Mobile priority flows:

- Teacher student attendance: select date and class-section, load students, mark all present, change one status, and submit only when QA data can be safely mutated.
- Staff QR scan: verify manual token input, safe success/error states, and no QR secrets in UI text.
- Admin QR display: generate check-in and check-out QR codes, verify countdown and expired states.
- Staff attendance correction: open correction entry point, verify reason-required form behavior and safe messages.
- Student reports: verify filters stack and tables scroll safely.
- Staff reports: verify filters stack and tables scroll safely.
- Dashboard: verify metric cards, quick actions, branch/year context, and no horizontal overflow.

Phase 9.7 pass criteria:

- No horizontal overflow at 360 px.
- Header/sidebar/mobile menu remain usable.
- Primary actions are visible and tappable.
- Forms and report filters stack cleanly.
- Tables scroll or adapt safely.
- Success/error messages are readable.
- Protected routes still redirect when unauthenticated.
- No raw QR token, token hash, tenant IDs, Prisma errors, or internal IDs appear in user-facing text.

## Phase 9.7 Authenticated QA Pass - 2026-05-13

### DB And Seed Status

- Local PostgreSQL was initially unavailable because Docker Desktop was not running.
- Docker Desktop and the existing `jinacampus-postgres` Compose service were started for QA.
- Prisma migration status reported 4 migrations and the database schema was up to date.
- Existing seed flow was run with `npm run db:seed`.
- Seed verification found one demo tenant, 34 permissions, 8 tenant roles, 3 users, 2 branches, 2 active academic years, 5 classes, 1 student, and 1 staff profile.
- Seed verification also found 0 class sections, 0 guardians, 0 enrollments, 0 student attendance records, and 0 staff attendance records.
- Staff QR attendance is disabled in both current attendance settings rows, so QR generation was not exercised in this pass.
- No passwords, raw session cookies, QR payloads, or screenshots were committed.

### Users And Roles Tested

- Seeded tenant owner account with the `TENANT_OWNER` role authenticated successfully through the normal app login API.
- The owner/admin experience was tested as the available privileged QA user.
- Teacher role login was not tested because no active teacher user with credentials and class-section assignment is seeded.
- Staff role login and successful self-scan were not tested because no active staff user with credentials and linked staff profile is seeded.
- Invited admin users exist in the local DB, but they were not used for login because active seeded credentials are not available for them.

### Browser QA Method

- Playwright is not installed and was not added.
- Browser plugin Node REPL control was not available in this session.
- Authenticated responsive smoke testing used a temporary Chrome DevTools Protocol script against the local dev server.
- The temporary browser profile and script artifacts were not committed.

### Viewports Tested

| Viewport | Result |
| --- | --- |
| 360 x 800 | Passed authenticated route smoke and priority checks available in current seed state. |
| 390 x 844 | Passed authenticated route smoke. |
| 414 x 896 | Passed authenticated route smoke. |
| 768 x 1024 | Passed authenticated route smoke. |
| 1280 x 800 | Passed authenticated route smoke. |

### Routes Tested Authenticated

| Route | Result |
| --- | --- |
| `/dashboard` | Passed. Dashboard title, Today's Attendance, and Quick Actions rendered without horizontal overflow. |
| `/academia` | Passed. |
| `/academia/students` | Passed. Existing seeded student/list controls rendered without horizontal overflow. |
| `/academia/attendance` | Passed. |
| `/academia/attendance/mark` | Passed for current empty enrollment state. Date input, class-section selector, Load Students control, and prerequisite copy rendered. Mark All Present was not available because no active class-section enrollment list exists. |
| `/academia/attendance/reports` | Passed. Filters and no-results/report state rendered without horizontal overflow. |
| `/staffboard` | Passed. |
| `/staffboard/staff` | Passed. Existing seeded staff/list controls rendered without horizontal overflow. |
| `/staffboard/attendance` | Passed. Filters and summary area rendered without horizontal overflow. Correction action was not available because no staff attendance records exist. |
| `/staffboard/attendance/qr` | Passed for page controls and no-active-QR state. QR generation was not run because staff QR attendance is disabled in settings. |
| `/staffboard/attendance/scan` | Passed for manual token input, blank-token safe error, camera-deferred note, and QR-secret safety. |
| `/staffboard/attendance/reports` | Passed. Filters and no-results/report state rendered without horizontal overflow. |
| `/academia/classes/[classId]/edit` | Passed with an actual seeded class ID. Edit page returned 200 and no sensitive text. |
| `/academia/students/[studentId]/edit` | Passed with an actual seeded student ID. Edit page returned 200 and no sensitive text. |
| `/staffboard/staff/[staffId]/edit` | Passed with an actual seeded staff profile ID. Edit page returned 200 and no sensitive text. |

### Priority Flow Results

- Dashboard: title, Today's Attendance section, and Quick Actions rendered cleanly across phone, tablet, and desktop widths.
- Teacher student attendance: page controls rendered cleanly, but the full Mark All Present and status-change workflow could not be tested because there are no class sections or active enrollments.
- Staff QR display: purpose selector, generate button, and no-active-QR empty state rendered cleanly; QR generation remains blocked by disabled staff QR attendance settings.
- Staff QR scan: manual token input, submit button, camera-deferred note, and safe blank-token error passed; successful staff scan remains untested without a seeded active staff login and enabled QR setting.
- Staff attendance admin: filters and summary area rendered cleanly; correction entry point remains untested because no staff attendance record exists.
- Reports: student and staff report filters and no-results states rendered cleanly.

### Issues Found

- No responsive overflow, route rendering, framework overlay, or QR-secret exposure failures were found in the 60 authenticated route/viewport checks.
- Local Docker/Postgres was stopped before QA and had to be started before migration and seed checks could run.
- Seed data remains too thin for full teacher attendance, successful staff self-scan, QR generation, and staff correction workflows.

### Fixes Applied

- No application code changes were required.
- Existing local Docker/Postgres services were started for QA.
- This checklist was updated with the authenticated QA evidence and remaining seed-data limitations.

### Authenticated Smoke Result

- Checked 60 authenticated route/viewport combinations.
- Checked 3 authenticated edit routes with actual seeded IDs.
- Login returned 200 through the normal app login API.
- No protected route redirected to `/login` while authenticated.
- No horizontal page overflow failures.
- No route failures.
- No framework error overlays.
- No raw QR token, token hash, Prisma/internal error text, tenant ID fields, branch ID fields, or UUID-like internal IDs appeared in rendered page text.

### Remaining Mobile Risks

- Full teacher attendance row workflow requires seeded class sections, active enrollments, and students.
- Teacher-specific navigation and dashboard QA requires an active seeded teacher user.
- Successful staff self-scan requires an active seeded staff user with credentials, a linked staff profile, and enabled staff QR attendance.
- Staff QR generation needs staff QR attendance enabled in QA settings.
- Staff correction interaction should be tested after staff attendance records exist.
- Real-device Android Chrome and iOS Safari QA remain recommended before production rollout.

## Phase 9.8 Demo Seed Data

Phase 9.8 adds the demo data required to repeat authenticated mobile QA with richer role coverage.

After running `npm run db:seed`, the current demo seed should provide:

- Demo tenant `jinacampus-demo`.
- Admin, principal, teacher, staff, and office-staff users with fake `.test` emails.
- Main Branch with active academic year 2026-27.
- Classes, sections, class sections, subjects, students, guardians, and active enrollments.
- Student attendance data for today and recent dates.
- Staff profiles linked to demo login users.
- Staff attendance records for present, late, half-day, absent, on-leave, corrected, and not-marked scenarios.
- Staff QR attendance enabled for Main Branch so QR generation and self-scan can be tested with live QR payloads.

Do not store screenshots, passwords, raw QR tokens, token hashes, or real personal data in this checklist.

## Phase 9.9 Final Mobile Smoke - 2026-05-14

Phase 9.9 reran the mobile-priority smoke routes after the richer Phase 9.8 demo seed data was available.

The same mobile-priority route matrix was checked again during the 2026-05-15 final base MVP smoke pass; no new mobile-specific issues were found.

Viewports checked:

- 360 x 800
- 390 x 844
- 414 x 896
- 768 x 1024
- 1280 x 800

Routes checked:

- `/dashboard`
- `/academia/attendance/mark`
- `/academia/attendance/reports`
- `/staffboard/attendance/scan`
- `/staffboard/attendance/qr`
- `/staffboard/attendance`
- `/staffboard/attendance/reports`

Result:

- 35 route/viewport combinations passed.
- No page-level horizontal overflow was found.
- Primary actions remained visible.
- Staff QR, scan, staff attendance, and report pages did not expose raw QR token or token hash text.
- No tenant ID, actor ID, Prisma error, SQL error, stack trace, or environment-secret text appeared in checked route output.

Remaining mobile recommendation: complete real-device Android Chrome and iOS Safari QA before production rollout.

## Phase 9.9 Final Mobile Smoke Rerun - 2026-05-15

The final base MVP smoke reran the authenticated mobile-priority routes after Phase 9.8 demo seed data and Phase 9.9 service smoke were available.

Viewports checked:

- 360 x 800
- 390 x 844
- 414 x 896
- 768 x 1024
- 1280 x 800

Routes checked:

- `/dashboard`
- `/academia/attendance/mark`
- `/academia/attendance/reports`
- `/staffboard/attendance/scan`
- `/staffboard/attendance/qr`
- `/staffboard/attendance`
- `/staffboard/attendance/reports`

Result:

- Rerun result: 35 route/viewport combinations passed.
- Current branch includes responsive table/report wrappers so wide tables scroll inside their own shell.
- No page-level horizontal overflow, missing primary actions, QR token hash text, Prisma error text, SQL error text, or environment-secret text appeared in the rerun.

Remaining mobile recommendation: complete real-device Android Chrome and iOS Safari QA before production rollout.

## Screenshot Recommendation

When authenticated browser QA is available, capture one screenshot per priority flow at:

- 360 x 800
- 768 x 1024
- 1280 x 800

Recommended local folder:

```txt
docs/mobile-qa-screenshots/
```

Do not commit screenshots unless the project decides to keep visual QA evidence in the repository.

## Phase 10.5 Staff QR Camera Scanner - 2026-05-19

Phase 10.5 adds browser-based camera scanning to `/staffboard/attendance/scan`.

Implementation/local preflight status:

- Browser camera scanner UI is implemented.
- Manual fallback remains on the same route.
- Local DB migration status was up to date.
- Existing demo seed and demo QR QA reset completed.
- Local authenticated route smoke passed for `/staffboard/attendance/qr` and `/staffboard/attendance/scan`.
- Scan page rendered Start Camera, manual token entry, and HTTPS guidance.
- No password hash, token hash, raw QR internals, Prisma errors, SQL errors, or tenant IDs appeared in checked route output.

Real-device execution status:

- Android Chrome: pending. ADB is installed, but no Android device was attached to the workspace.
- iOS Safari: pending. No iOS Safari device bridge is available from this Windows workspace.
- Secure mobile URL: pending. No configured ngrok or Cloudflare Tunnel command was available, and no temporary public tunnel was started.

Expected mobile QA coverage:

- Android Chrome real-device QR scan.
- iOS Safari real-device QR scan.
- Camera permission allow flow.
- Camera permission denial flow.
- Unsupported-browser fallback.
- Successful check-in/check-out with a live QR.
- Duplicate scan safe messages.
- No token hash, raw QR internals, Prisma errors, SQL errors, or stack traces in UI text.

Remaining recommendation: run real-device Android Chrome and iOS Safari QA before production rollout.

## Real-Device QR Scanner QA Attempt - 2026-05-20

Status: not completed; blocked pending physical devices and a secure mobile URL.

Setup/local preflight result:

- Docker Desktop was started and the local PostgreSQL service became healthy.
- Database port `55432` was reachable.
- Prisma schema validation passed.
- Prisma migration status reported the database schema is up to date.
- Existing demo seed completed.
- Demo QR QA reset completed for `jinacampus-demo` / Main Branch / known demo QR QA staff profiles.
- Next.js dev server started with `npm run dev -- -H 0.0.0.0`.
- `/login`, `/staffboard/attendance/qr`, and `/staffboard/attendance/scan` returned 200 locally after demo authentication.
- The scan page rendered Start Camera, manual token entry, and HTTPS guidance.
- Checked local route output did not include password hashes, token hashes, raw QR internals, Prisma errors, SQL errors, or tenant IDs.

Real-device status:

| Device/browser | Result |
| --- | --- |
| Android Chrome | Pending. `adb` is installed, but no Android device was attached. |
| iOS Safari | Pending. No iOS Safari device bridge is available from this Windows workspace. |
| Secure phone URL | Pending. No configured `ngrok` or `cloudflared` command was available. |

Required follow-up:

- Expose the app through a trusted HTTPS deployment or secure tunnel.
- Open `/login` on Android Chrome and iOS Safari.
- Generate live CHECK_IN and CHECK_OUT QR codes from `/staffboard/attendance/qr`.
- Scan from `/staffboard/attendance/scan` on each device.
- Verify permission allow, permission denied, duplicate scan, manual fallback, and no sensitive output.

## Real-Device Live QR Scanner QA Re-run - 2026-05-20

Status: blocked for physical-device execution; scanner remains release-candidate with Android/iOS real-device QA pending.

Setup/local readiness:

- Local PostgreSQL was running and reachable.
- Prisma validation passed and migrations were up to date.
- Existing demo seed completed.
- Demo QR QA reset completed for `jinacampus-demo`, Main Branch, and the known QR QA staff profiles.
- Local authenticated route preflight passed for `/staffboard/attendance/qr` as admin and `/staffboard/attendance/scan` as staff.
- The scan page rendered Start Camera, manual fallback, and HTTPS requirement copy.
- Checked local route output did not expose password hashes, token hashes, raw QR internals, Prisma errors, SQL errors, tenant IDs, or actor IDs.

Real-device matrix:

| Device/browser | CHECK_IN | CHECK_OUT | Permission/fallback |
| --- | --- | --- | --- |
| Android Chrome | Blocked: no attached physical Android device and no approved HTTPS phone URL | Blocked: no attached physical Android device and no approved HTTPS phone URL | Not tested on device |
| iOS Safari | Blocked: no iOS device bridge and no approved HTTPS phone URL | Blocked: no iOS device bridge and no approved HTTPS phone URL | Not tested on device |

Required follow-up:

- Provide an approved staging HTTPS URL or secure tunnel.
- Test with a physical Android device using Chrome.
- Test with a physical iOS device using Safari.
- Repeat live CHECK_IN and CHECK_OUT scans, permission-denied fallback, manual fallback, duplicate scan, and expired QR behavior.
- Do not commit private tunnel URLs, credentials, raw QR payloads, tokens, or sensitive screenshots.

## Live QR Scanner Real-Device QA With Approved HTTPS URL - 2026-05-20

Status: blocked before physical-device execution; QR scanner remains release-candidate.

Input and environment confirmation:

- Approved HTTPS URL: not available to this Codex session. Only a local app URL setting was present, and no private HTTPS/tunnel URL was provided or discovered.
- Android Chrome device: not available to this Codex session. ADB listed no attached device.
- iOS Safari device: not available to this Codex session. No iOS device bridge is available from this Windows workspace.
- Local PostgreSQL: reachable.
- Prisma migrations: up to date.
- Demo seed: completed.
- Demo QR QA reset: completed for `jinacampus-demo`, Main Branch, and known QR QA staff profiles.
- Local route smoke: `/login`, `/staffboard/attendance/qr`, and `/staffboard/attendance/scan` returned 200 after demo authentication.
- Scan page readiness: Start Camera, manual fallback, and HTTPS guidance rendered.
- Sensitive-output check: no password hash, token hash, raw QR internals, Prisma/SQL error, tenant ID, or actor ID text appeared in checked QR/scan route output.

Device QA matrix:

| Device/browser | CHECK_IN | CHECK_OUT | Permission deny | Manual fallback |
| --- | --- | --- | --- | --- |
| Android Chrome | Blocked: missing approved HTTPS URL and physical device | Blocked: missing approved HTTPS URL and physical device | Not tested on device | Not tested on device; fallback rendered locally |
| iOS Safari | Blocked: missing approved HTTPS URL and iOS device access | Blocked: missing approved HTTPS URL and iOS device access | Not tested on device | Not tested on device; fallback rendered locally |

Remaining required QA:

- Live Android Chrome CHECK_IN and CHECK_OUT scan over HTTPS.
- Live iOS Safari CHECK_IN and CHECK_OUT scan over HTTPS.
- Device-level camera permission denial behavior.
- Device-level manual fallback behavior.
- Duplicate CHECK_IN/CHECK_OUT behavior on device.
- Expired QR behavior on device.

## Live QR Scanner Real-Device QA With Approved HTTPS URL - 2026-05-25

Status: blocked before physical-device execution; QR scanner remains release-candidate.

Input and environment confirmation:

- Approved HTTPS URL: not available to this Codex session. No private HTTPS URL was provided, no HTTPS app URL was present in `.env`, and no configured `ngrok` or `cloudflared` command was available.
- Android Chrome device: not available to this Codex session. ADB listed no attached device.
- iOS Safari device: not available to this Codex session. No iOS device bridge is available from this Windows workspace.
- Local PostgreSQL: reachable after Docker Desktop was started.
- Prisma migrations: up to date.
- Demo seed: completed.
- Demo QR QA reset: completed for `jinacampus-demo`, Main Branch, and known QR QA staff profiles on `2026-05-25`.
- Local route smoke: `/login`, `/staffboard/attendance/qr`, and `/staffboard/attendance/scan` returned 200 after demo authentication.
- Scan page readiness: Start Camera, manual fallback, and HTTPS guidance rendered.
- Sensitive-output check: no password hash, token hash, raw QR internals, Prisma/SQL error, tenant ID, or actor ID text appeared in checked QR/scan route output.

Device QA matrix:

| Device/browser | CHECK_IN | CHECK_OUT | Permission deny | Manual fallback |
| --- | --- | --- | --- | --- |
| Android Chrome | Blocked: missing approved HTTPS URL and physical device | Blocked: missing approved HTTPS URL and physical device | Not tested on device | Not tested on device; fallback rendered locally |
| iOS Safari | Blocked: missing approved HTTPS URL and iOS device access | Blocked: missing approved HTTPS URL and iOS device access | Not tested on device | Not tested on device; fallback rendered locally |

Remaining required QA:

- Live Android Chrome CHECK_IN and CHECK_OUT scan over HTTPS.
- Live iOS Safari CHECK_IN and CHECK_OUT scan over HTTPS.
- Device-level camera permission denial behavior.
- Device-level manual fallback behavior.
- Duplicate CHECK_IN/CHECK_OUT behavior on device.
- Expired QR behavior on device.

## Real-Device Staff QR Camera QA With Approved HTTPS URL - 2026-05-30

Status: blocked before physical-device execution; QR scanner remains release-candidate with real-device QA pending.

Preconditions checked:

- Docker PostgreSQL was running and healthy.
- Prisma migration status reported the local database schema is up to date.
- Existing seed command completed for `jinacampus-demo`.
- Demo admin, principal, office staff, teacher, and staff users exist and are active.
- Demo teacher and staff users have active linked StaffProfile records.
- Main Branch staff QR attendance is enabled with a 180-second token validity window.

Blocked inputs:

| Required input | Result |
| --- | --- |
| Approved HTTPS URL | Blocked. Local app configuration is HTTP-only, no HTTPS app URL was available in the local environment, and no tunnel script was configured. |
| Android Chrome device | Blocked. ADB is available, but 0 Android devices were attached. |
| iOS Safari device | Blocked. No iOS device tooling or Safari bridge is available from this Windows workspace. |

Real-device matrix:

| Device/browser | CHECK_IN | CHECK_OUT | Permission deny | Manual fallback | Duplicate / expired |
| --- | --- | --- | --- | --- | --- |
| Android Chrome | Blocked: no approved HTTPS URL and no attached Android device | Blocked: no approved HTTPS URL and no attached Android device | Not tested on device | Not tested on device | Not tested on device |
| iOS Safari | Blocked: no approved HTTPS URL and no iOS Safari access | Blocked: no approved HTTPS URL and no iOS Safari access | Not tested on device | Not tested on device | Not tested on device |

Remaining required QA:

- Open the approved HTTPS URL on Android Chrome and iOS Safari.
- Confirm `/login`, `/staffboard/attendance/scan`, and `/staffboard/attendance/qr` load on devices after login.
- Generate live CHECK_IN and CHECK_OUT QRs from the admin route.
- Scan both purposes on both devices.
- Test permission denial, manual fallback, duplicate scan, and expired QR behavior.
- Do not commit passwords, tokens, raw QR payloads, private URLs, tunnel secrets, or sensitive screenshots.

### Re-run Request - 2026-05-30

Status: still blocked before physical-device execution.

Rechecked inputs:

| Required input | Result |
| --- | --- |
| Approved HTTPS URL | Blocked. Local configuration remains HTTP-only, no HTTPS app URL was available in local environment values, and no tunnel script was configured. |
| Android Chrome device | Blocked. ADB is available, but it reported 0 attached devices and 0 unauthorized devices. |
| iOS Safari device | Blocked. No iOS device tooling or Safari bridge is available from this Windows workspace. |
| Local DB/seed | Available. Docker PostgreSQL was running, migrations were up to date, seed completed, demo users and linked staff profiles were active, and staff QR attendance was enabled for Main Branch. |

Device flow status remains unchanged: Android/iOS CHECK_IN, CHECK_OUT, permission-denied, manual fallback, duplicate, and expired QR behavior are not tested on real devices.

## Deferred Items

- Native mobile app.
- Offline/PWA service worker.
- Manifest and app icons.
- Export system.
- Charts.
- FeeDesk.
- GradeBook.
- SchoolCast.

## Staff QR Mobile Camera Button Repair - 2026-06-29

Status: source-level repair completed; real-device mobile QA still pending.

The Staff QR scanner was updated after a mobile/Safari report that the Start Camera button did not react. The scanner now:

- Calls `getUserMedia` directly from the Start Camera button path.
- Shows a clear HTTPS-required state on non-secure phone URLs.
- Uses rear-camera preference with a generic camera fallback.
- Explicitly plays a `muted`, `autoPlay`, `playsInline` video preview.
- Stops camera tracks on success, stop, error, and unmount.
- Keeps manual token entry available for permission denied, unavailable camera, unsupported browser, and insecure context states.

Real-device mobile QA remains required before marking QR camera readiness:

- Android Chrome over approved HTTPS.
- iOS Safari over approved HTTPS.
- Normal browser mode and installed PWA/home-screen mode where available.
- Valid CHECK_IN and CHECK_OUT QR scans.
- Invalid QR, expired QR, duplicate scan, denied permission, camera unavailable, and wrong-branch QR where fixture coverage exists.

## Staff QR Mobile Camera Diagnostics Update - 2026-06-30

Status: source-level diagnostic hardening completed; real-device mobile QA still pending.

Additional scanner checks added after a Safari/PWA report:

- Start Camera now visibly enters a `Checking support` state before secure-context and camera API checks.
- The scan page displays camera diagnostics for secure context, `navigator.mediaDevices`, `getUserMedia`, current origin, and browser user agent.
- Safe console diagnostics are emitted for camera startup attempts without QR payloads, tokens, passwords, tenant IDs, or branch IDs.
- HTTP LAN/IP URLs should show: "Camera requires a secure HTTPS connection. Please open the approved HTTPS pilot link."
- Missing browser camera APIs should show: "Camera is not available in this browser context. Use the approved HTTPS link in Safari/Chrome."
- Permission denial should show Safari-specific retry guidance.
- A controlled QR image/photo upload fallback is available when live camera fails. It does not bypass server-side QR expiry, branch, tenant, identity, or duplicate validation.

Required rerun before readiness:

- iOS Safari over approved HTTPS, normal browser mode.
- Android Chrome over approved HTTPS, normal browser mode.
- Installed PWA/home-screen mode after normal browser mode passes.
- Valid QR, invalid QR, denied permission, camera unavailable, duplicate/expired QR, wrong-branch QR where fixtures exist, and cross-tenant QR where fixtures exist.

## Authenticated QA Pass - 2026-05-11

### DB And Seed Status

- Local PostgreSQL was reachable at `localhost:55432`.
- Prisma migration status reported the database schema is up to date.
- Existing seed flow was run with `npm run db:seed`.
- Seed verification found one demo tenant, active branch access, 34 permissions, 8 tenant roles, and 3 users in the local QA database.
- The seeded tenant owner account authenticated successfully through the normal login flow.
- Existing local QA data did not include classes, class sections, active student enrollments, staff profiles, student attendance records, or staff attendance records.
- Staff QR attendance was disabled in the existing local attendance settings rows. For QA only, staff QR attendance was enabled on the primary branch so QR generation could be exercised.

### Users And Roles Tested

- Seeded tenant owner account with the `TENANT_OWNER` role.
- Invited admin users were present in the database, but they were not used for login because seeded active credentials were not available for them.
- No staff self-scan success path was tested because the seed data did not include an active staff user with a staff profile and credentials.

### Browser QA Method

- Browser plugin was not available.
- Playwright was not installed and was not added.
- Authenticated responsive smoke testing used temporary Chrome DevTools Protocol scripts against the local dev server.
- Screenshots were captured to a temporary system folder and were not committed.

### Viewports Tested

| Viewport | Result |
| --- | --- |
| 360 x 800 | Passed authenticated route smoke and priority flow checks available in current seed state. |
| 390 x 844 | Passed authenticated route smoke. |
| 414 x 896 | Passed authenticated route smoke. |
| 768 x 1024 | Passed authenticated route smoke. |
| 1280 x 800 | Passed authenticated route smoke. |

### Routes Tested Authenticated

| Route | Result |
| --- | --- |
| `/dashboard` | Passed. Cards and quick actions rendered without horizontal overflow. |
| `/academia` | Passed. |
| `/academia/students` | Passed. Empty/list state rendered without horizontal overflow. |
| `/academia/attendance` | Passed. |
| `/academia/attendance/mark` | Passed for empty seeded state. Date input, class-section selector, and Load Students control rendered; no class sections were available. |
| `/academia/attendance/reports` | Passed. Reports shell rendered without horizontal overflow. |
| `/staffboard` | Passed. |
| `/staffboard/staff` | Passed. Empty/list state rendered without horizontal overflow. |
| `/staffboard/attendance` | Passed. Filters, summary area, and table shell rendered without horizontal overflow. |
| `/staffboard/attendance/qr` | Passed after QA setting enablement. CHECK_IN QR generation rendered a QR, countdown/validity details, and no QR secret text. |
| `/staffboard/attendance/scan` | Passed for manual input and blank-token validation. Safe error rendered without internal details. |
| `/staffboard/attendance/reports` | Initially failed with a generic error state; passed after the report filter fix. |

### Priority Flow Results

- Dashboard: metric cards and quick actions rendered cleanly at phone, tablet, and desktop widths.
- Teacher student attendance: page and controls rendered cleanly, but full student-row workflow could not be tested because the seed data has no class sections or active enrollments.
- Staff QR display: CHECK_IN QR generation passed after enabling staff QR attendance on the primary QA branch.
- Staff QR scan: manual token input, submit button, camera-deferred note, and safe blank-token error passed. Successful staff scan remains untested because there is no seeded active staff profile with login credentials.
- Staff attendance admin: filters, summary cards, and table shell rendered cleanly.
- Reports: student and staff reports rendered cleanly after the staff reports filter fix.

### Issues Found

- Staff attendance reports page passed the combined filter object into strict per-report schemas, causing `/staffboard/attendance/reports` to show the app-level error state.
- Tablet/desktop sidebar links were 36 px tall in the rendered smoke check, below the practical 44 px touch target guideline for tablet users.
- Existing local DB attendance settings had staff QR attendance disabled, so QR generation could not be exercised until the QA branch setting was enabled.
- Seeded data does not yet support full student attendance marking or successful staff self-scan workflows.

### Fixes Applied

- Split staff attendance report page filters before calling strict daily, date-range, monthly, and correction report queries.
- Added a regression test for combined staff report page filters.
- Increased desktop/tablet sidebar nav link height with `min-h-11`.
- Recorded authenticated QA results and remaining seed-data limitations in this checklist.

### Authenticated Smoke Result

- Checked 60 authenticated route/viewport combinations.
- No horizontal overflow failures.
- No route failures.
- No framework error overlays after the staff reports fix.
- No mobile navigation failures.
- No sensitive QR/internal text in rendered page text.
- No small touch-target samples after the sidebar adjustment, ignoring native checkbox visual size where the label provides the tap target.

### Remaining Mobile Risks

- Full teacher attendance row workflow needs seeded class sections, active enrollments, and students.
- Successful staff self-scan needs a seeded active staff user with credentials and a staff profile.
- Correction dialog interaction should be tested after staff attendance records exist.
- Real-device camera scanner QA remains recommended after the Phase 10.5 browser scanner implementation.
- iOS Safari and Android Chrome device QA remain recommended before production rollout.

## Staff QR Production Scanner Hardening - 2026-07-01

Source-level scanner hardening is complete for the Staff QR scan page:

- Start Camera is a direct user-click `getUserMedia` flow with no SSR camera access and no automatic camera start.
- Secure-context, media API, origin, user-agent, and likely in-app browser diagnostics are visible.
- Camera permission request has a 12-second timeout to avoid a stuck requesting state.
- Rear camera is requested first, with generic camera fallback.
- Mobile Safari video attributes and explicit `video.play()` are used.
- QR decoding uses `jsQR` from canvas frames for both live preview and QR image/photo fallback.
- Camera streams are stopped on Stop, success, error, `pagehide`, `visibilitychange`, and unmount.
- The client submits only the raw decoded QR payload to the server action; tenant, branch, staff identity, QR token hash, purpose, expiry, duplicate handling, and audit remain server-side.

Mobile QA gate remains unchanged: approved-HTTPS Android Chrome, iOS Safari, and installed PWA tests are required before marking QR camera scanning ready for Base MVP freeze.
