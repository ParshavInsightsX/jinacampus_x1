# Auth Password Recovery and Mandatory Password Change

Date: 2026-08-13

Status: Principal recovery queue, administrator-assisted school-user resets,
and central `mustChange` enforcement are implemented. The additive recovery
migration and authenticated security matrix passed in approved staging;
production migration and live external delivery remain pending.

## Login Model

JinaCampus uses user-based login. Institutions and roles do not log in. School
users enter School ID plus employee code or email and authenticate with a
registered passkey or case-sensitive password. Platform Administrators use the
separate Administrator Portal.

The public phone-OTP login and public OTP password-reset routes are not exposed.

## Public Forgot Password Behavior

The login page links to `/forgot-password`. The public form accepts:

- School ID
- registered account email or Principal ID

For any syntactically valid request, the public response remains generic and
does not reveal whether the school, email, or user exists:

```text
If this account is eligible for password recovery, the request will be reviewed by an authorised JinaCampus Administrator. Institution staff should contact their Principal/Admin for password reset.
```

No email or OTP delivery is claimed because no approved delivery provider
exists. An eligible Principal request enters the separately authorized
Administrator Portal queue. Other institution users continue to contact their
Principal or school administrator. The route does not accept tenant IDs, user
IDs, roles, permissions, passwords, or reset tokens from the client.

When an active Principal can be resolved inside the submitted School ID, the
server writes a safe request and audit record using HMAC identifier fingerprints.
Unknown or ineligible accounts return the same public shape without creating an
account-specific record. Identifier and source-address rate limits do not alter
the public response.

## Principal Recovery Queue

Only an active JinaCampus platform administrator with the explicit
`canManagePrincipalRecovery` capability can open
`/administrator/principal-recovery` or decide a request. The capability is not
granted automatically with ordinary Administrator Portal access.

After documented identity and institution verification, that administrator can:

- issue a 30-minute, single-use reset link whose raw token is never stored
- issue a one-time temporary password whose hash is stored with `mustChange=true`
- reject the request with safe review notes

Both successful reset methods revoke active Principal sessions and registered
passkeys. Because no delivery provider is approved, delivery is marked
`MANUAL_DELIVERY_REQUIRED`; the Administrator Portal does not pretend a message
was sent. See `docs/principal-password-recovery.md` for the deployment and QA
gate.

## Administrator-Assisted Reset

Authenticated Principal user management remains the supported operational
recovery flow for school users:

- `/campus-core/users/[userId]/reset-password`

The reset requires `campuscore.user.reset_password` and server-derived tenant
and branch scope. A Principal cannot reset a platform Administrator or a user
outside the Principal's governance scope. Teacher, Staff, and Office Staff do
not receive reset authority by default.

A successful administrative reset:

- hashes the new temporary password
- sets `mustChange=true`
- revokes all active sessions for the target user
- removes target-user passkeys
- activates an invited user where applicable
- writes a safe audit event without password material

Removing passkeys on administrative reset prevents a previously enrolled
credential from bypassing the newly issued temporary-password lifecycle.

## Mandatory Password Change

`mustChange` is enforced centrally by tenant-context resolution, not only by
navigation hiding.

- Password and passkey login return the change-password route for a temporary credential.
- Protected web contexts reject the session until the password is changed.
- Mobile protected-token resolution rejects a temporary credential.
- `/api/auth/me` exposes only the safe `passwordChangeRequired` flag.
- Logout and the change-own-password route remain available.
- Passkey registration is unavailable until the temporary password is replaced.

A successful own-password change:

- verifies the current password
- hashes the new password
- clears `mustChange`
- keeps the current session where it can be identified
- revokes the user's other active sessions
- writes `user.password_changed` with safe metadata

## Show Password UX

Password inputs include a keyboard-accessible show/hide control on:

- `/login`
- `/account/change-password`
- `/campus-core/users/[userId]/reset-password`
- CampusCore user creation where an initial password is present

The toggle is a non-submit button, defaults to hidden, and does not log or
persist the password.

## Security Rules

- Do not reveal public account, role, school, or recovery eligibility.
- Do not store plaintext passwords.
- Do not expose password hashes, session tokens, OTP hashes, or reset tokens.
- Do not log passwords or WebAuthn credential payloads.
- Do not trust tenant, user, role, permission, or branch claims from clients.
- Do not permit school login for a platform Administrator.
- Do not let public recovery change a password.
- Do not weaken Principal reset scope.

## Audit

Relevant audit actions include:

- `auth.password_recovery_requested`
- `auth.principal_password_recovery_approved`
- `auth.principal_password_recovery_rejected`
- `auth.principal_password_recovery_expired`
- `auth.principal_password_reset_completed`
- `auth.login.password_success`
- `auth.login.passkey_success`
- `user.password_reset`
- `user.password_changed`
- `user.passkey_registered`
- `user.passkey_removed`

Audit metadata may contain safe outcome, authentication-method, session-revoke,
and passkey-removal counts. It must not contain raw passwords, password hashes,
session tokens, WebAuthn challenges, OTPs, or reset secrets.

## Deferred

- Email provider integration
- SMS recovery provider
- Automated recovery delivery and provider-status tracking
- Invite-based onboarding
- Forced passkey enrollment
