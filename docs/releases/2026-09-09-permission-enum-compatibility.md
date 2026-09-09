# Disabled KinBridge Compatibility Release

## Approval and Scope

On 2026-09-09 the user explicitly approved a reviewed source-only compatibility
commit, push, and production deployment with KinBridge remaining disabled.
Baseline: production commit 22870c8f4785e2f2c11a2697b082024bc6fe2f07.

The upgraded database already contains PermissionModule.KINBRIDGE. The baseline
client cannot decode this value when its shared role query selects full permission
records. This release narrows that query and adds enum recognition to the generated
client. It does not add KinBridge pages, APIs, permission grants, account creation,
feature enablement, schema migrations, workers, providers, or environment changes.

The source schema enum addition describes existing database state; it is not a
database migration. The full KinBridge development tree and its migration history
remain outside this hotfix. Never use this deliberately narrow hotfix schema to
generate destructive drift corrections against the upgraded database.

## Verification and Deployment

Verify strict TypeScript, Prisma schema/client generation, all baseline regression
tests plus compatibility tests, production build, and secret-free release diff.
Check the actual release client against existing demo role grants using read-only
transactions. Confirm all KinBridge institution entitlements remain disabled.

Deploy only the reviewed commit to the existing JinaCampus Vercel project. No
database migration or seed command runs during install/build. Record the commit,
deployment ID/time, operator, HTTP smoke results, log checks, and remaining
authenticated-smoke limitations in the post-deployment evidence record.

## Rollback

Pre-publication checks on 2026-09-09: 1,024 tests passed across 133 files;
strict TypeScript, Prisma validation, and production build passed. Tests/build
used synthetic local configuration, not copied production secrets. The native
utility tests reused the existing ignored Expo compiler dependency. Required
Vercel production variable names were present; their values were not logged.

A read-only primary-database probe using this exact release client passed enum
decoding and demo Principal role loading. All 28 KinBridge entitlement entries
were DISABLED. The migration ledger remained at 36 completed migrations. No
database mutation was performed.

The former production build is known to be incompatible with the upgraded
permission catalog. Do not blindly roll back to 22870c8. Preserve this minimal
enum/query compatibility fix in any replacement release. Do not remove permission
grants, applied migrations, guardian links, or academic data to revert code.
Database restore or destructive recovery requires separate approval.

Source-only deployment does not refresh backup/PITR certification, legal approval,
device QA, or approve any later KinBridge pilot.
