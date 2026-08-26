# Subprocessor and Third-Party Service Register

Status: **Draft - contracts, locations, and production configuration require verification**
Version: `draft-0.1`

No entry in this document authorises a provider or confirms that a production contract, DPA, regional configuration, or security review is complete.

| Provider/service | Intended purpose | Typical data | Production status | Required evidence before approval |
|---|---|---|---|---|
| Vercel | Next.js application hosting, functions and deployment | Requests, account identifiers, operational/security metadata, application responses | In use; contract and region evidence pending | Contract/DPA, region and support-access review, logs, security, deletion, incident terms |
| Supabase | Managed PostgreSQL and private/public object storage | Institution, user, student, guardian, staff, academic, attendance, document metadata and configured files | In use; project-specific controls vary | Contract/DPA, project/region inventory, backup/PITR, RLS/storage policies, access, encryption, restore and deletion evidence |
| GitHub | Source control and release collaboration | Source code and secret-free issue/release metadata | Verify current use and organisation controls | Organisation ownership, MFA, branch protection, secret scanning, retention, access review |
| Meta WhatsApp Business Platform | Optional institutional communications | Approved recipient contacts, template variables, delivery/webhook metadata | Deferred/disabled unless separately approved | Sender ownership, consent, templates, credentials, webhook, billing, retention, location and pilot evidence |
| Email provider | Optional transactional/institution communications | Recipient email, approved content, delivery metadata | Not approved/configured | Provider selection, sender/domain verification, DPA, consent, templates, webhook and pilot evidence |
| SMS provider | Optional OTP or communications | Phone number, OTP/delivery metadata | Development configuration only unless approved | Provider selection, DPA, template/telecom compliance, credentials, billing, retention and pilot evidence |
| Malware scanning provider | File safety scanning | File content or hashes and scan metadata | Not approved as a hosted production control | Private connectivity, quarantine, data location, retention, incident handling, availability and failure-mode tests |
| Payment/billing provider | Future subscription billing | Institution billing contacts and provider references | Deferred | Provider, PCI responsibility, contract/DPA, checkout/refund terms, webhooks and reconciliation |

## Provider Change Gate

Before adding or changing a provider:

1. Document purpose, necessity, data categories, data subjects, regions and access paths.
2. Complete privacy, security, child-data, transfer, contract, pricing, reliability, deletion and incident review.
3. Approve credentials and environment variables through server-only secret management.
4. Update the privacy notice, DPA, contract schedules and this register before processing begins.
5. Run tenant-isolation, failure, webhook, retry, duplicate, retention and deletion tests as applicable.
6. Record authorised decision and effective date.

Client-side provider keys, private service-role keys, access tokens, database URLs and webhook secrets must never appear in this register.
