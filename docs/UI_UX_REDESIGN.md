# JinaCampus Brand, UI, and UX Redesign

## Status

Implementation date: 2026-07-31

The supplied JinaCampus brand kit is now the visual source of truth for the web and PWA application. The redesign changes presentation and routing only; authentication, tenant isolation, RBAC, audit logging, Prisma models, and business services remain unchanged.

The repository currently implements CampusCore, Academia, and StaffBoard Lite. GradeBook, FeeDesk, SchoolCast, and InsightBoard were named in the external brief but are not implemented active modules in this checkout, so they were not fabricated or added to navigation.

## Audit Summary

- The previous `/` route was a demo marketing page with placeholder product metrics and links. It conflicted with the required user-first login entry point.
- Authentication pages repeated radial-gradient backgrounds and old school-building logo markup.
- The shell used institution branding as the product identity, making JinaCampus itself unclear in compact and collapsed navigation.
- Shared surfaces used large radii, heavy glass effects, multiple gradients, and one-off indigo/cyan colors.
- Forms and tables already had useful shared primitives, responsive containment, permission-aware navigation, and 44px controls. Those stable structures were retained and restyled.
- Desktop and mobile shells were already separated at the `lg` breakpoint. The redesign preserves that architecture and permission filtering.
- Browser/PWA assets referenced the retired icon family and navy theme color.

## Brand Asset Inventory

Original supplied masters are preserved under `public/brand`:

| Asset | Source dimensions | Use |
| --- | ---: | --- |
| `jinacampus-logo-primary-transparent.png` | 1914 x 522 | Login and light surfaces |
| `jinacampus-logo-primary-light.png` | 2172 x 724 | Approved white-background lockup |
| `jinacampus-logo-inverse-dark.png` | 2172 x 724 | Deep-ink auth brand panel |
| `jinacampus-mark-transparent.png` | 1024 x 1024 | Compact mobile and application identity contexts |
| `jinacampus-mark-on-light.png` | 1024 x 1024 | Light-surface mark variant |
| `jinacampus-app-icon-master.png` | 1254 x 1254 | Preserved app-icon master |

`src/config/brand.ts` centralizes approved product strings, colors, and asset paths. `BrandLogo` and `AppMark` use `next/image` with stable dimensions to prevent layout shift.

PWA derivatives in `public/icons` were generated from the supplied 1024px app icon at 72, 96, 128, 144, 152, 180, 192, 256, 384, 512, and 1024 pixels using high-quality bicubic resizing. Existing `pwa-icon-*` aliases were replaced with the same new artwork for backward compatibility. Supplied favicon and Apple-touch masters are used directly where available.

## Logo Usage

- Login: complete primary lockup on mobile and inverse lockup on the desktop brand panel.
- Desktop application command bar: primary lockup on the light workspace surface.
- Compact mobile contexts: icon-only app mark where the full lockup does not fit.
- Institution logos remain separate tenant context and never replace the JinaCampus product identity.
- Do not stretch, crop, recolor, outline, or place the mark on a low-contrast background.

## Color Tokens

Semantic variables live in `src/app/globals.css`; Tailwind aliases live in `tailwind.config.ts`.

| Role | Value |
| --- | --- |
| App background | `#F6F8FF` |
| Surface | `#FFFFFF` |
| Muted surface | `#EEF2FB` |
| Sidebar / inverse-logo surface | `#030F2E` |
| Deep ink text / PWA theme | `#0B1638` |
| Primary | `#2457E6` |
| Primary hover | `#1D49CF` |
| Primary active | `#193CAB` |
| Secondary | `#312E81` |
| Accent teal | `#12B8A6` |
| Brand gold | `#C8A44D` |
| Default border | `#D9E1F2` |
| Success | `#16875B` |
| Warning | `#B7791F` |
| Error | `#C63C4D` |
| Information | `#1769AA` |

Status colors are reserved for status meaning. Brand blue anchors commands and active navigation; teal and gold are secondary accents rather than page-wide decoration.

## Typography, Radius, and Depth

- Interface and data: Manrope through `next/font`.
- Headings: Nunito Sans through `next/font`, used sparingly.
- Letter spacing: zero throughout the interface.
- Numeric operational values may use `tabular-nums`.
- Operational cards, panels, menus, and controls: 8px radius. The familiar floating dock and desktop command cluster use larger container radii; pills remain fully rounded where the shape communicates status or compact metadata.
- Shadows are limited to three restrained elevations: soft, elevated, and auth/shell surface.
- Dense operational screens use hierarchy, spacing, and muted bands instead of nested decorative cards.

## Authentication and Root Routing

- `/` is the canonical unauthenticated login route.
- The root resolves an existing server session before rendering. Authenticated users redirect to password change, administrator portal, workspace selection, dashboard, teacher attendance, or staff QR attendance according to existing server-derived roles.
- `/login` is a compatibility redirect to `/` and preserves an optional School ID query.
- `/t/[tenantSlug]/login`, `/attendance-login`, `/forgot-password`, and `/administrator/login` share the branded auth shell.
- The shared shell uses the project-owned `public/brand/jinacampus-auth-campus-background.png` architectural image with the supplied, unmodified JinaCampus wordmark layered above it.
- Desktop uses an image-led brand story beside a focused glass form. Mobile uses the same full-bleed image, safe-area padding, a compact brand header, and a single-column glass form without horizontal overflow.
- School, fast-attendance, account-recovery, and Administrator routes receive distinct contextual copy while retaining separate APIs and session policies.
- Auth surfaces use 32px panel corners, 16px field/action corners, 52px controls, visible labels, and 44px minimum link targets.
- Background drift, page entrance, button loading, and route loading animations stop under `prefers-reduced-motion`.
- Logout and protected school-route redirects return to `/`.
- Login keeps School ID normalization, employee-code/email lookup, passkey sign-in, exact case-sensitive password submission, generic errors, and duplicate-submit prevention.
- No role selector, demo credentials, password hashes, session tokens, or tenant identifiers are exposed.

## Application Shell

- Desktop uses a permission-aware bottom dock at `lg` and above; the former rendered sidebar has been removed from the school and Administrator Portal layouts.
- The dock derives one stable, labelled item per visible product area and sizes itself to the number of server-filtered groups available to the current user.
- Institution, branch, academic year, role, account, workspace, and logout context remain separate and server derived.
- Mobile uses a compact contextual command bar, focus-trapped application drawer, and permission-aware bottom navigation with iOS safe-area padding.
- Main content uses the full available desktop width up to 100rem and reserves 160px of lower clearance so the fixed dock never covers forms, reports, tables, or actions.

## Intelligent Application Navbar

### Information architecture

- Left: JinaCampus product identity plus concise route context on desktop; concise route context plus the existing navigation trigger on mobile.
- Center: intentionally unused. JinaCampus has no connected global search or command palette, so no placeholder search is rendered.
- Right: active workspace context and the user menu. Notifications and help are omitted because no user-scoped inbox or support workflow is connected.
- The desktop bottom dock is the primary module navigation. The command bar supplies page, branch, academic-year, workspace, and account context without duplicating sub-route navigation.

### Desktop layout

- The command bar is a stable 88px sticky desktop row with product identity and route context on the left and one glass workspace/account cluster on the right.
- Academic year and branch remain visibly labelled at the 1024px desktop breakpoint. Longer user and branch details progressively gain room at wider viewports.
- A fixed, centered desktop dock sits above the lower viewport edge. It receives only already-filtered group titles and URLs, never permissions or tenant identifiers.
- Dock items use stable `clamp()` widths, persistent labels, 48px icon tiles, and a non-color-only active marker. The item under pointer or keyboard focus scales to 1.18 with a small lift; adjacent items scale to 1.08. Reduced-motion users receive the same labels and active state without transforms.
- The `All areas` launcher exposes the complete already-authorized sub-route list, closes on Escape or outside interaction, and restores focus to its trigger.
- Desktop content reserves bottom clearance for the dock, so forms, reports, tables, scanner results, and sticky actions are never hidden beneath it.
- School, branch, and academic-year context is progressively disclosed through the workspace popover. Context switching continues through the existing server-validated `/account/workspaces` flow.
- The profile menu includes only implemented account security, workspace selection, and secure logout actions.
- The Administrator Portal uses the same bottom-dock interaction language for Dashboard, Schools, and Create School. Its mobile header and navigation card remain unchanged.

### Mobile and tablet layout

- Below `lg`, the command bar uses a 64px row plus `env(safe-area-inset-top)`.
- A labelled menu button opens a body-scroll-locked drawer containing the already permission-filtered module list, active-route state, workspace summary, account actions, and logout.
- The drawer traps Tab focus, closes with Escape or backdrop interaction, closes after navigation, and returns focus to its trigger.
- The bottom-navigation More action opens the same drawer instead of a second independent menu.

### Auto-hide controller

- Configuration lives in `src/config/navbar.ts`: near-top threshold 64px, hide eligibility after 80px, meaningful directional travel 10px, and pointer reveal zone 12px.
- Initial render is visible. A passive scroll listener contains work in one `requestAnimationFrame` and changes React state only when visibility, near-top state, or meaningful direction changes.
- Meaningful downward travel hides the command bar; meaningful upward travel reveals it. Tiny touch, wheel, and trackpad changes do not toggle visibility.
- Route navigation, browser back/forward restoration, and pointer entry into the top-edge reveal zone restore visibility.
- Attendance entry and camera scanning disable auto-hide through centralized route configuration because persistent controls are safer for those focused workflows.

### Visibility locks and layout stability

- The command bar remains visible while a context menu, user menu, or mobile drawer is open; while focus is within the header; while a pointer is interacting with it; or while an explicit critical-state lock is supplied.
- The header stays mounted in a stable sticky layout row. Hide/show uses only `translateY`, so content padding and document flow do not change during scrolling.
- Motion uses the existing 200-220ms standard easing range without bounce or continuous animation. `prefers-reduced-motion` removes transitions and drawer entrance animation without changing behavior.

### Route context and permission safety

- Route titles, parent labels, back links, and auto-hide exceptions are centralized in `src/config/navbar.ts`; dynamic record identifiers are never displayed as fallback labels.
- Permissions remain evaluated on the server. Client chrome receives only the visible group title, link label, and URL, not permission codes, tenant IDs, branch IDs, academic-year IDs, or user IDs.
- Hidden links remain a UX measure only. Existing proxy, route, service, tenant, branch, and RBAC enforcement remains authoritative.

### Component architecture

- `app-chrome.tsx`: shared drawer state and desktop/mobile chrome composition.
- `app-navbar.tsx`: small client boundary for visibility and interaction locks.
- `desktop-navigation-dock.tsx`: adaptive role-aware desktop module navigation, hover/focus magnification, and the authorized all-areas launcher.
- `navigation-icon.tsx`: one route-to-icon registry shared by the mobile navigation and desktop dock.
- `use-auto-hide-navbar.ts`: reusable scroll controller plus pure transition function.
- `navbar-page-context.tsx`, `navbar-context-menu.tsx`, and `navbar-user-menu.tsx`: contextual command-bar responsibilities.
- `mobile-navigation-drawer.tsx`: accessible mobile navigation and account surface.
- `navbar-popover.tsx`: controlled, dismissible progressive-disclosure primitive.
- `top-edge-reveal-zone.tsx`: fine-pointer top-edge recovery target.

### Navbar verification (2026-07-31)

- Browser QA used the local Docker PostgreSQL fixture and an authenticated seeded Principal session. Credentials were read only at runtime and were not written to the script, output, documentation, or screenshots.
- Dashboard chrome passed at 360px, 390px, 768px, 1024px, 1280px, and 1440px with the `Dashboard` route title, no document-level horizontal overflow, and no Next.js error overlay.
- Meaningful downward scrolling hid the header with a transform. Upward scrolling, the near-top threshold, fine-pointer top-edge entry, and keyboard focus each restored it.
- Account and workspace popovers kept the header visible. Escape dismissed each controlled popover and returned focus where appropriate.
- The mobile drawer kept the header visible, used dialog semantics, locked body scrolling, trapped focus, closed with Escape, restored body scrolling, and returned focus to the menu trigger.
- The student-attendance entry route kept auto-hide disabled in browser QA. The Staff QR scanner exception is covered by the focused route-configuration test because the Principal fixture is correctly forbidden from the self-scan route.
- The account menu rendered the existing POST logout form. Submitting it revoked the session, returned to `/`, and a subsequent protected dashboard request redirected to `/`.
- Chrome reported zero error-level console events during the final run. No hydration warning was observed.
- Screenshot evidence: `docs/ui-ux-redesign-screenshots/navbar-desktop-1280.png`, `docs/ui-ux-redesign-screenshots/navbar-mobile-390.png`, and `docs/ui-ux-redesign-screenshots/navbar-mobile-drawer-390.png`.
- Physical iOS/Android installed-PWA touch-scroll verification remains external QA; local responsive Chrome does not replace that device gate.

### Desktop shell and dock verification (2026-08-01)

- An isolated local Chrome harness rendered the production command bar, `DesktopNavigationDock`, mobile chrome, and Administrator shell with display-safe context, then all preview routes and QA scripts were removed before quality gates.
- At 1440x1000, the school shell rendered Dashboard, CampusCore, Academia, StaffBoard, and All areas in a 582px intrinsic-width dock. The desktop sidebar was absent, mobile navigation was hidden, the dock stayed within the viewport, and the document had no horizontal overflow.
- Fine-pointer hover produced a 1.18 scale with an 8.8px lift on CampusCore and a 1.08 scale with a 4px lift on each adjacent item. Persistent labels remained readable without relying on hover tooltips.
- The All areas dialog rendered all 13 supplied authorized routes and stayed fully inside the viewport.
- At 1024x800, the JinaCampus lockup, labelled academic-year and branch context, all dock labels, and full-width content remained visible without overflow or clipping.
- At 390x844, the desktop dock remained hidden and the existing mobile menu trigger and permission-aware bottom navigation remained visible with no horizontal overflow.
- At 1280x900, the Administrator Portal rendered Dashboard, Schools, and Create School in the bottom dock with no visible desktop sidebar or horizontal overflow.
- Screenshot evidence: `docs/ui-ux-redesign-screenshots/desktop-bottom-dock-1440.png`, `desktop-bottom-dock-hover-1440.png`, `desktop-bottom-dock-launcher-1440.png`, `desktop-bottom-dock-1024.png`, `administrator-bottom-dock-1280.png`, and `desktop-bottom-dock-mobile-regression-390.png`.
- This visual pass did not mutate or bypass managed-database authentication. Permission derivation remains covered by source tests and the existing server-side navigation filtering.

## Shared Operational Patterns

### Page headers

Use a concise title, optional context sentence, and one clear primary action. Do not add breadcrumbs when the route is already obvious.

### Forms

- Visible labels and required indicators.
- One column on phones and no more than two logical columns on wider screens.
- Minimum 44px controls, server validation as source of truth, inline errors, safe form-level feedback, and pending submit states.
- Sticky mobile actions remain above bottom navigation and safe-area insets.

### Tables

- Desktop retains compact tables with muted headers and restrained row hover.
- Existing route-specific mobile card views remain the preferred mobile representation where implemented.
- Other wide tables are contained in a keyboard-focusable horizontal region with a clear mobile scroll note.
- Status badges pair labels with a dot so status is not communicated by color alone.

### States

Empty, no-results, loading, error, permission, and prerequisite states share an accessible surface, heading, explanatory copy, and optional action. Loading and asynchronous outcomes use appropriate live regions.

## Motion and Accessibility

- Micro feedback uses 160ms, standard component movement uses 220ms, content-only page entry uses 280ms, and sheets use 320ms.
- Motion is limited to opacity, small translation, color, border, and shadow changes.
- `prefers-reduced-motion` disables entrance and hover movement without removing information.
- Native landmarks, labels, buttons, links, tables, and details/summary semantics are retained.
- Focus is visible globally and all primary controls meet the 44px target.
- Layouts use `min-h-dvh`, mobile safe-area padding, constrained images, and `overflow-x-hidden` only at application-shell boundaries.

## Final Responsive and Motion System

The final system uses three shared glass levels rather than route-specific translucent values:

- Application glass uses approximately 28% transparency for the command bar and navigation docks.
- Elevated glass uses approximately 14% transparency for popovers, launchers, and bottom sheets.
- Focus glass uses approximately 6% transparency for authentication and other temporary high-attention surfaces.

Dense forms, tables, record cards, and long reading surfaces remain opaque. Browsers without `backdrop-filter` and users requesting reduced transparency receive opaque white surfaces. Print output removes blur, motion, and glass shadows.

Authenticated school route changes animate only the page-content template below the persistent shell. The command bar and desktop/mobile navigation remain stable and do not remount for visual effect. The Administrator Portal uses the same desktop dock and a safe-area-aware mobile bottom navigation while retaining its independent authentication and server-side capability filtering.

The dashboard route group intentionally has no shared `loading.tsx` fallback. A previous browser QA failure showed that this fallback could remain visually stuck while the route payload had completed. Existing route-specific loading, empty, validation, success, permission, and error states remain the supported loading-state pattern.

## Route Migration Checklist

- [x] Root login and compatibility login redirect
- [x] Tenant login, attendance login, forgot password, and administrator login
- [x] Account password and workspace selection
- [x] Responsive school application shell and administrator shell
- [x] Dashboard header, metrics, actions, attention states, and mobile cards
- [x] CampusCore lists, forms, profiles, settings, readiness, and audit surfaces through shared primitives
- [x] Academia setup, students, guardians, enrollments, attendance, and reports through shared primitives
- [x] StaffBoard Lite profiles, categories, QR attendance, self-attendance, correction, and reports through shared primitives
- [x] Shared form, table, status, empty, loading, error, and permission states
- [x] Browser metadata, favicon, Apple-touch icon, and PWA manifest

## Removed Legacy UI

The obsolete `src/components/home` marketing component set was removed after the root route stopped referencing it. It included placeholder module, payment, dashboard, and marketing content that was not appropriate for the authenticated product entry point.

## Responsive Verification Matrix

Representative checks target 360px, 390px, 768px, 1024px, 1280px, and 1440px widths. Required assertions are:

- no page-level horizontal overflow;
- readable School ID, identifier, password, error, and passkey controls;
- stable logo aspect ratio and no layout shift;
- mobile top/context/bottom navigation does not cover content;
- tables either use mobile cards or contained horizontal scrolling;
- forms remain one-column on phones;
- focus and reduced-motion behavior remain available.

## Verification Commands

```powershell
npx prisma format
npx prisma validate
npx prisma generate
npm run typecheck
npm test
npm run build
git diff --check
npm pkg get scripts.lint
```

Final verification on 2026-07-31:

- Prisma format, validate, and generate: passed. The first generate attempt encountered the known Windows generated-DLL replacement lock; moving the stale generated engine aside and regenerating resolved it.
- TypeScript: passed.
- Vitest: 89 files and 769 tests passed, including the focused navbar auto-hide and interaction coverage.
- Next.js production build: passed with 62 static/dynamic routes collected. The sandboxed first attempt could not download Google font assets; the approved network-enabled rerun completed successfully.
- `git diff --check`: passed. Git reported existing LF-to-CRLF working-copy notices only.
- Lint: not configured (`npm pkg get scripts.lint` returned `{}`). This is reported rather than treated as a lint pass.

## Screenshot Evidence

- Before root desktop: `docs/ui-ux-redesign-screenshots/before-root-desktop.png`
- Before login mobile: `docs/ui-ux-redesign-screenshots/before-login-mobile.png`
- After login at 360px: `docs/ui-ux-redesign-screenshots/after-root-mobile-360.png`
- After login at 390px: `docs/ui-ux-redesign-screenshots/after-root-mobile-390-cdp.png`
- After login at 768px: `docs/ui-ux-redesign-screenshots/after-root-tablet-768.png`
- After login at 1024px: `docs/ui-ux-redesign-screenshots/after-root-desktop-1024.png`
- After login at 1280px: `docs/ui-ux-redesign-screenshots/after-root-desktop-1280.png`
- After dashboard at 1280px: `docs/ui-ux-redesign-screenshots/after-dashboard-desktop-1280.png`
- After dashboard at 390px: `docs/ui-ux-redesign-screenshots/after-dashboard-mobile-390-v2.png`
- Navbar desktop at 1280px: `docs/ui-ux-redesign-screenshots/navbar-desktop-1280.png`
- Navbar mobile at 390px: `docs/ui-ux-redesign-screenshots/navbar-mobile-390.png`
- Navbar mobile drawer at 390px: `docs/ui-ux-redesign-screenshots/navbar-mobile-drawer-390.png`
- Desktop bottom dock at 1440px: `docs/ui-ux-redesign-screenshots/desktop-bottom-dock-1440.png`
- Desktop dock hover at 1440px: `docs/ui-ux-redesign-screenshots/desktop-bottom-dock-hover-1440.png`
- Desktop all-areas launcher at 1440px: `docs/ui-ux-redesign-screenshots/desktop-bottom-dock-launcher-1440.png`
- Desktop bottom dock at 1024px: `docs/ui-ux-redesign-screenshots/desktop-bottom-dock-1024.png`
- Administrator bottom dock at 1280px: `docs/ui-ux-redesign-screenshots/administrator-bottom-dock-1280.png`
- Mobile unchanged regression at 390px: `docs/ui-ux-redesign-screenshots/desktop-bottom-dock-mobile-regression-390.png`

## Browser Verification Result

Chrome DevTools Protocol verification used a running local application and seeded local database.

- Unauthenticated `/` rendered the login form at 360, 390, 768, 1024, 1280, and 1440 pixels with `document.scrollWidth === window.innerWidth` and no Next.js error overlay.
- `/login` returned a 307 compatibility redirect to `/`.
- Password visibility changed from `password` to `text` and back after direct button clicks.
- Invalid credentials returned the generic safe login error and restored the enabled submit state.
- `/forgot-password` rendered its labelled email field, root login return link, and no horizontal overflow.
- A seeded Principal login succeeded without exposing credentials in output. An authenticated visit to `/` redirected server-side to `/dashboard`.
- Dashboard, CampusCore Users, Academic Setup, Student Registration, Student Attendance, Staff Profiles, Staff QR Scan, and Staff Attendance Reports loaded at 1280px and 390px without document overflow.
- The authenticated mobile dashboard preserved institution, branch, academic-year, role-aware actions, account menu, and bottom navigation without label clipping.

## Known Constraints

### Dashboard Visualization Refresh

The school dashboard now uses an operational, responsive report layout instead of a dense stack of equal-weight cards.

- Desktop presents a concise attendance pulse, a seven-day trend, today's status mix, exceptions, school summaries, and permission-filtered actions.
- Mobile prioritizes today's actions, four compact statistics, the responsive trend, personal attendance, and short school overview cards. Desktop tables or unsupported module shortcuts are not introduced.
- Student and staff trend data is bounded to seven days and resolved through the existing authenticated tenant, branch, academic-year, and teacher-assignment scopes.
- Presence rate uses submitted records only: present, late, and half-day are treated as on-site. Missing or `NOT_MARKED` records are not converted into absences.
- The trend is a server-rendered SVG with a screen-reader table, so no client chart runtime or new visualization dependency is required.
- Glass surfaces remain restrained and operational: shared borders, 8px card radii, soft translucency, tabular figures, accessible contrast, and reduced-motion support are preserved.

- Real iOS/Android installed-PWA validation still requires physical devices and an approved HTTPS environment.
- Dynamic institution logo URLs continue to use the existing remote URL behavior and safe fallback; file upload/storage remains outside this visual redesign.
- There is no full dark mode. The inverse logo is used only on approved deep-ink brand surfaces.
- The redesign does not add unimplemented modules or change database, service, attendance, audit, tenant, or permission contracts.
