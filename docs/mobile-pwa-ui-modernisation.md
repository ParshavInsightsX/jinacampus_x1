# JinaCampus Mobile/PWA UI Modernisation

## Status

- Implementation date: 2026-08-25
- Scope: authenticated mobile web and installed PWA presentation below the `lg` breakpoint
- Desktop behavior: retained
- Database or business-logic changes: none in this UI pass
- Production deployment: not performed by this task
- Real-device status: pending Android Chrome, iOS Safari, and installed-PWA verification

## Product Direction

The mobile interface is an operational companion for school users. It prioritises the next useful action, keeps school context visible, and avoids compressing desktop navigation and tables into a phone viewport.

The visual treatment follows a selective glass model:

- Glass is limited to the compact command bar, floating dock, and temporary sheets.
- Forms, records, reports, and attendance content use opaque high-contrast surfaces.
- Motion is short and functional, with reduced-motion fallbacks.
- Touch targets are at least 44px where the user is expected to act.

## Mobile Shell

The authenticated shell now provides:

- A compact top command bar with route title or back navigation.
- A school-context control for institution, branch, and academic year.
- Role-aware notification and account controls.
- A permission-filtered floating bottom dock.
- A bottom-sheet `More` launcher containing only server-filtered destinations.
- PWA installation access inside the module sheet.
- Safe-area spacing for iPhone and iPad home indicators.
- Dock compaction while scrolling and dock clearance while a form field is focused.
- A truthful offline banner that disables no server rule and makes no offline-save claim.

Navigation visibility remains a usability aid. Server-side authentication, institutional entitlements, RBAC, branch scope, academic-year scope, and assignment checks remain authoritative.

## Role-Aware Navigation

The dock is derived from the user's effective permissions and canonical role assignments:

- Principal and authorised administrators: Home, Attendance, Users, Reports, More.
- Teachers: Home, My Class, Attendance, Students, More.
- Staff: Home, My Staff Card, My Attendance, Profile, More.
- Office staff: Home, Attendance, Mark Attendance, My Attendance, More when permitted.

Unavailable or unapproved product modules are not added as fake destinations.

## Mobile Dashboard

The mobile dashboard remains separate from the desktop dashboard and uses this order:

1. Greeting and active workspace context.
2. Institutional live time.
3. Today's primary actions.
4. Small operational statistics.
5. Attendance trend when available.
6. The user's own attendance when permitted.
7. Items needing attention.
8. Secondary school overview and management actions.

Every value continues to come from the existing permission-scoped dashboard queries.

## Mobile Records and Reports

Below the `md` breakpoint, these priority directories use record cards while preserving the existing desktop tables:

- CampusCore users
- Branches
- Academic years
- Institution profiles
- Roles and permissions
- Audit logs
- Academia students
- Staff profiles
- Student attendance daily summaries
- Absent and late student reports
- Classes not marked
- Student attendance history
- Monthly attendance percentages

Student directory and attendance-report filters open in accessible bottom sheets on phones. Desktop filters remain inline.

## Forms and Accessibility

- Shared Academia and StaffBoard page headers are unframed on mobile and retain their existing desktop panels.
- The role-creation form now has connected labels, clear field names, and a one-column phone layout.
- Dialog sheets trap focus, close with Escape, prevent background scrolling, and restore focus to their trigger.
- Active navigation uses `aria-current`.
- Buttons and links retain visible keyboard focus styles.
- Layouts account for `env(safe-area-inset-top)` and `env(safe-area-inset-bottom)`.
- Animations stop when `prefers-reduced-motion: reduce` is enabled.
- Opaque fallbacks are provided when backdrop filtering is unavailable.

## Connectivity and PWA Boundary

The current product does not implement offline attendance writes, service-worker data caching, or background reconciliation. When connectivity is unavailable, the interface states that server-verified actions are unavailable until the connection returns.

The following remain deferred:

- Offline attendance mutation queue
- Service-worker application-shell caching
- Conflict resolution and background sync
- PWA update notification flow
- Push notifications

These capabilities require a separate security and data-integrity design. They must not be inferred from installability alone.

## Security Invariants

This redesign does not change:

- Session handling
- Tenant and institution isolation
- Branch or academic-year scope resolution
- Permission checks
- Attendance entitlements
- Teacher assignment restrictions
- Audit logging
- QR token validation
- Password or credential handling

No tenant ID, actor user ID, password hash, token hash, raw token, session secret, or internal error is added to normal user-facing output.

## Responsive QA Checklist

Validate at 360px, 390px, 768px, and 1280px:

- No page-level horizontal overflow.
- The top command bar remains readable with a long institution name.
- The dock remains above the safe area and does not cover page actions.
- The dock moves clear of the on-screen keyboard.
- More and context sheets trap focus and restore it after closing.
- Lists use mobile record cards below `md` and desktop tables at `md` and above.
- Report filters are operable without horizontal scrolling.
- Attendance and QR actions remain reachable with one hand.
- Empty, loading, permission, prerequisite, and error states are readable.
- Browser zoom and 200% text scaling do not hide required actions.

## Remaining QA

- Authenticated browser screenshots at 360px, 390px, 768px, and 1280px.
- Android Chrome normal-browser and installed-PWA checks.
- iOS Safari normal-browser and home-screen PWA checks.
- Real-device keyboard, safe-area, orientation, camera, and permission-state checks.
- Screen-reader spot checks for VoiceOver and TalkBack.
- Slow-network and offline-to-online recovery checks.

These device checks must use approved non-production or controlled pilot accounts and must not record credentials or QR payloads.
