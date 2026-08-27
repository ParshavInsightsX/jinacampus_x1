# Staff Attendance Navigation and Workflow Modernization

## Status

- Implementation date: 2026-08-27
- Scope: Staff Attendance UI, navigation, continuous supervised scanner, and personal Attendance QR
- Database change: none
- Deployment change: none
- Current readiness: authenticated isolated DB/browser QA passed; physical-device certification and final recovery/deployment approvals remain release gates

## Product Flow

Authorised operator:

1. Open Staff Attendance.
2. JinaCampus validates the operator, entitlement, permission, branch, and capture policy.
3. A branch-bound scanner session starts automatically.
4. The camera opens automatically when the browser allows it.
5. Present a staff Attendance QR inside the square.
6. JinaCampus detects the QR, validates it on the server, and records attendance.
7. The result remains above the camera for two seconds.
8. The scanner rearms for the next staff member without a confirmation or continue action.

Staff member:

1. Open My Attendance.
2. Display the personal Attendance QR to the authorised operator.
3. Keep the page visible while attendance is processed.
4. JinaCampus detects the server-recorded check-in or check-out and shows confirmation.
5. Open Attendance History only when detailed records or a correction request are needed.

## Route and Navigation Contract

| Audience | Primary label | Route | Purpose |
| --- | --- | --- | --- |
| Principal, Administrator, authorised operator | Staff Attendance | `/staffboard/attendance/scan` | Continuous supervised scanner |
| Staff and Teacher with own-QR permission | My Attendance | `/staffboard/attendance/card` | Personal Attendance QR and live confirmation |
| Staff and Teacher with own-history permission | Attendance History | `/staffboard/attendance/me` | Current record, recent history, and correction requests |
| Principal-family credential manager | Staff QR Cards | `/staffboard/attendance/credentials` | Issue, preview, print, reissue, revoke, and audit |

Navigation visibility is permission-aware for usability. Every route, action, query, and mutation remains protected on the server.

## Scanner State Contract

- Preparing Staff Attendance
- Ready to scan
- QR detected
- Processing attendance
- Attendance recorded
- Already recorded
- Attendance not recorded
- Session expired
- Scanner not connected
- Scanner stopped

The normal scan loop intentionally has no Start, Confirm, Continue, or Next button. Retry and restart actions appear only when recovery is required.

## Camera and QR Controls

- Client component only; camera APIs are never accessed during SSR.
- Secure-context, media API, likely in-app browser, and camera errors use safe messages.
- The supervised station prefers the front camera and falls back to generic video constraints.
- The permission request is bounded by a 12-second timeout.
- Video uses `autoPlay`, `muted`, `playsInline`, and `webkit-playsinline`.
- `jsQR` decodes cropped square canvas frames continuously.
- An in-memory non-secret fingerprint suppresses a QR held in the frame until it leaves.
- Stop, expiry, page hide, visibility hide, route change, and unmount stop camera tracks.
- Manual token and QR image upload use the same server validation path.

## Security Boundary

The scanner client sends only:

- Branch-scoped session request parameters allowed by the server
- Scanner session ID
- Raw opaque QR payload for immediate server validation
- Unique client request ID for idempotency

The client does not choose or assert tenant, institution, staff, user, role, attendance date, attendance status, credential hash, leave state, holiday state, or event timestamp.

The server derives session identity and scope, validates permission and entitlement, hashes and resolves the credential, checks lifecycle and branch assignment, prevents duplicates, applies calendar and leave rules, writes attendance transactionally, and records audit evidence.

The raw QR payload and its fingerprint are not logged or stored in browser persistence. Sensitive scan submission uses an opaque `FormData` Server Action argument so framework development tracing does not print the raw payload. The personal polling action accepts only a credential identifier and resolves the signed-in staff profile and accessible branch on the server.

## Accessibility and Responsive Behavior

- Operational controls are at least 44 px high.
- Scanner and result states use `aria-live`.
- The camera frame keeps a stable 1:1 aspect ratio.
- Manual fallback remains reachable without a separate workflow.
- Mobile navigation uses canonical role-aware routes and iOS safe-area handling.
- Error states use plain school-facing language and preserve readable contrast.
- Reduced-motion behavior is respected for decorative activity indicators.

## Verification

Focused regressions cover:

- Operator route permission guard
- Automatic session and camera contract
- Continuous rearm and held-QR suppression
- Camera timeout, HTTPS, permission, unavailable, and in-app-browser states
- Camera cleanup lifecycle
- Server tenant, branch, credential, expiry, duplicate, idempotency, and audit controls
- Personal QR purpose separation and no print/download
- Foreground-only status polling and session-derived scope
- Role-aware navigation and login/workspace redirects

Authenticated release-gate QA on 2026-08-27:

- Applied all 32 committed migrations to a disposable loopback-only PostgreSQL 17 database.
- Confirmed no Prisma schema drift after aligning six long foreign-key relation mappings with PostgreSQL's actual truncated names.
- Passed the DB-backed service matrix for Principal, Office Staff, Teacher, Staff, second branch, sibling institution, and second tenant.
- Passed 24 authenticated Chrome 151 browser checks at desktop and 390 x 844 mobile emulation.
- Passed check-in, check-out, automatic rearm, wrong-branch rejection, cross-tenant rejection, same-tenant cross-institution denial, role denial, own-QR scope, and no-print/download checks.
- Fixed a React Strict Mode auto-start defect that could leave the camera state Idle.
- Added active-institution filtering to Staff Attendance register, reports, scanner options, and QR branch options.
- Replaced the plain-object QR Server Action argument with `FormData`; the repeated browser matrix passed and the development trace contained no raw QR or token content.
- Did not perform embedded screenshot-based visual QA because the embedded browser environment was unavailable.

## Remaining Release Gates

- Android Chrome and iOS Safari testing over an approved HTTPS URL
- iPad Safari testing over an approved HTTPS URL
- Installed Android and iOS PWA testing
- Camera permission, unavailable, timeout, background/resume, and route-leave testing on physical devices
- Consecutive staff scans, held-QR suppression, check-in/check-out confirmation, and logout testing
- TalkBack, VoiceOver, orientation, brightness, and real operational scanning checks
- Fresh production backup/recovery evidence and separate release publication/deployment approval

No production migration, environment change, feature enablement, commit, push, or deployment was performed for this implementation.
