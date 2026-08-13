# Principal Password Recovery Staging QA

Date: 2026-08-13

Status: **Staging release gate passed; production remains unchanged**

## Environment and Migration

- Target: approved isolated Supabase staging project `gradebook-mvp-staging`.
- Production-target detection remained active for every guarded command.
- Migration `20260812143000_add_principal_password_recovery` applied successfully.
- Post-deploy Prisma status: 22 migrations, schema up to date.
- Catalog audit: 97 tables, 325 foreign keys, 402 valid indexes, no invalid
  indexes, and no unvalidated constraints.
- Drift comparison reports only inherited legacy index-name truncation and SQL
  default differences. No Principal recovery table or relation appears in the
  drift report.

No production database migration, production feature enablement, or production
recovery-authority assignment was performed.

## Recovery Authority

The protected server-side authorization command explicitly granted
`canManagePrincipalRecovery` to one designated synthetic staging Platform
Administrator. A second active synthetic Platform Administrator was explicitly
revoked and used as the forbidden observer.

The authorization change:

- accepted only an active Platform Administrator
- required the explicit confirmation phrase
- revoked the affected Administrator session
- wrote a platform audit event
- did not print or persist a password

## Authenticated Browser Matrix

| Scenario | Result |
|---|---|
| Designated Platform Administrator opens recovery queue | Pass |
| Observer Platform Administrator opens recovery queue | Denied safely |
| School Principal opens Administrator recovery route | Redirected safely |
| Anonymous direct-route access | Redirected safely |
| Public email recovery request | Generic, non-enumerating response |
| Public Principal-ID recovery request | Same generic response shape |
| Approve reset-link request | Pass |
| Reject recovery request | Pass |
| Expired reset link | Denied with safe public error |
| Valid single-use reset | Pass |
| Reuse consumed reset token | Denied |
| Mismatched cross-tenant request/token pair | Denied |
| Existing Principal session after reset | Revoked |
| Synthetic Principal login after controlled credential restoration | Pass |
| Principal logout and protected-route revisit | Redirected to login |

The synthetic staging queue ended with no `PENDING` or `APPROVED` request.
Observed terminal states were:

- pilot tenant: 2 completed, 1 rejected, 3 expired
- control tenant: 1 completed, 2 expired

Extra expired records came from deliberately stranded staging-only links used
to verify origin and expiry handling. They were expired through the guarded QA
helper; no broad data deletion or production record was involved.

## Delivery Truthfulness

All nine synthetic recovery records remain
`MANUAL_DELIVERY_REQUIRED`. JinaCampus did not claim that email or SMS was sent.
Automated delivery remains blocked until an approved provider confirms delivery.

## Audit Verification

The verifier found the required request, approval, rejection, expiry, and
completion events in both the Platform Administrator and tenant audit ledgers.
Approval, rejection, and administrator-triggered expiry identify the designated
Platform Administrator as actor. Tenant events retain tenant, institution,
affected Principal, source, status, and timestamp context.

Audit metadata was checked for prohibited password, hash, token, session-secret,
and credential material. The staging verifier recorded 17 matching platform
events, 26 matching tenant events, and five revoked pre-reset session records.

## Security Result

- Tenant, institution, Principal identity, and authority were resolved server-side.
- Public request output did not reveal account, role, tenant, or institution existence.
- Raw reset tokens were never stored in the database or documentation.
- Expired, consumed, mismatched, and replayed tokens failed safely.
- Unauthorized roles could not bypass the queue through direct routes or API calls.
- Synthetic passwords were restored only from the protected staging environment
  and were not printed, documented, or committed.

## Remaining Production Gates

- Verify a current production backup and rollback procedure.
- Apply the additive migration through a separately approved production release.
- Explicitly authorize the approved production Platform Administrator.
- Run a short production smoke test without exposing reset credentials.
- Integrate an approved email/SMS provider before changing delivery status from
  `MANUAL_DELIVERY_REQUIRED`.
