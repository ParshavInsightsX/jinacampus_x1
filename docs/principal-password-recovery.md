# Principal Password Recovery

Date: 2026-08-13

Status: source and approved staging release gates verified; production migration,
production authority assignment, and live enablement remain pending.

## Scope

This workflow recovers a school Principal account without exposing the existing
password or giving school users platform-level credential authority. Users,
institutions, and roles do not receive separate login accounts.

The public request starts at `/forgot-password`. The Administrator Portal queue
is available at `/administrator/principal-recovery` only to an active platform
administrator with the explicit `canManagePrincipalRecovery` capability.

## Public Request

The requester provides:

- School ID, which resolves the tenant server-side
- either the registered Principal email or the tenant-local Principal ID

The server normalizes and validates the identifiers, resolves only an active
Principal with active institution and branch access inside that School ID, and
stores HMAC fingerprints rather than the submitted email or Principal ID in the
recovery request. Request-source IP and user-agent metadata are bounded and
sanitized for security review.

Every valid submission receives the same public response. The response does not
reveal whether the school, account, email, Principal ID, role, or request exists.
Rate limits apply per identifier and source address over a 15-minute window;
retained rate-limit fingerprints are pruned after 24 hours when encountered.

## Administrator Review

Recovery access is separate from ordinary Administrator Portal access. Grant or
revoke it through the protected operator command only after written approval:

```powershell
$env:PLATFORM_ADMIN_PRINCIPAL_RECOVERY_AUTHORIZATION_ENABLED = "true"
$env:PLATFORM_ADMIN_EMAIL = "<approved-platform-administrator-email>"
$env:PLATFORM_ADMIN_PRINCIPAL_RECOVERY_ACCESS = "grant" # or revoke
$env:PLATFORM_ADMIN_PRINCIPAL_RECOVERY_CONFIRM = "CONFIRM_PRINCIPAL_RECOVERY_ACCESS_CHANGE"
npm run platform-admin:principal-recovery-access
```

The command accepts only an active platform administrator, records a platform
audit event, and revokes that administrator's existing sessions. It does not
print credentials.

Before approval, the administrator must verify the Principal and institution
through an approved support procedure and record non-sensitive review notes.
The server revalidates the tenant, institution, Principal role, user status, and
active institution access at decision time. A reviewed request cannot be
approved or rejected again.

## Reset Methods

### Reset link

- A cryptographically random token is generated.
- Only its HMAC hash is stored.
- The link expires after 30 minutes and is single-use.
- The secret is placed in the URL fragment, so it is not sent in the initial
  page request or normal access logs.
- Completion requires a strong confirmed password.
- Completion revokes active sessions and registered passkeys.
- The Principal chooses the permanent password, so `mustChange` is cleared.

### Temporary password

- A strong random temporary password is generated and returned once to the
  approving administrator.
- Only its password hash is stored.
- Existing sessions and passkeys are revoked immediately.
- `mustChange=true` is enforced centrally, so protected workflows remain blocked
  until the Principal changes the temporary password.

The one-time link or temporary password must be delivered only through a
verified channel. It must not be copied into tickets, audit notes, source code,
documentation, or chat transcripts.

## Notification Status

No approved email or SMS provider is configured. The system therefore records
`MANUAL_DELIVERY_REQUIRED` and shows only a masked registered destination in the
queue. It does not claim that an email or message was sent. Automated delivery
requires a separate approved provider, consent, template, retry, and delivery
tracking implementation.

## Principal IDs

Newly provisioned school Principals receive the tenant-local identifier
`PRINCIPAL-001`. The additive migration assigns deterministic tenant-local IDs
to existing canonical or legacy Principal assignments and enforces uniqueness
within each tenant. The identifier is a lookup key, not an authentication
secret.

## Audit and Security

The workflow records safe tenant and platform audit events for request,
approval, rejection, expiry, temporary-password issuance, and completed reset.
Records include the responsible administrator where applicable, affected tenant,
institution, Principal user, request source, method, status, and timestamps.

The workflow never stores or audits raw passwords, password hashes, raw reset
tokens, session secrets, or client-supplied tenant, institution, user, or role
claims. Platform administrators are separate from school Principals. School
users cannot access the platform recovery queue or reset a Principal through
this workflow.

## Deployment and QA Gate

The migration `20260812143000_add_principal_password_recovery` is additive. It
was applied on 2026-08-13 to the approved isolated staging database through the
guarded migration process. The post-deploy status reports 22 migrations and an
up-to-date schema. It has not been applied to production and must not be applied
there without a separate approved release decision and backup verification.

The following DB-backed checks passed in staging:

- eligible email and Principal-ID requests produce the same public response
- an explicitly authorized recovery administrator can approve and reject
- an ordinary platform administrator, school Principal, and anonymous user are denied
- direct-route, direct-API, and cross-tenant request/token combinations are denied safely
- reset links expire, are single-use, and reject reuse
- reset completion revokes existing authenticated sessions
- the synthetic Principal credential was restored from the protected staging
  secret, then login, dashboard access, logout, and protected-route redirect passed
- approval, rejection, expiry, and completion exist in both required audit ledgers
- audit output and UI contain no password, hash, session secret, or token material
- all tested requests retain `MANUAL_DELIVERY_REQUIRED`

Detailed evidence is recorded in
`docs/principal-password-recovery-staging-qa.md`.

Local source and public-route verification completed on 2026-08-13: Prisma
format/validate/generate, TypeScript, the full automated suite, and the
production build passed. `/forgot-password` and `/principal-password-reset`
rendered successfully at a true 390 x 844 Chrome viewport with no horizontal
overflow. Malformed requests returned safe errors, cross-origin reset requests
were denied, and the unauthenticated Administrator queue redirected to the
Administrator login. No recovery request, credential, or deployment database
record was created during this public-route pass.

## Deferred

- Approved email/SMS delivery integration
- Automated delivery retries and provider status tracking
- Formal support identity-verification playbook and service-level target
