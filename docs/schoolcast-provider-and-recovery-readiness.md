# SchoolCast Provider and Recovery Readiness

## Current Decision

**NO-GO for production as of 15 August 2026.**

The guarded staging readiness audit confirms:

- one synthetic SchoolCast tenant is enabled;
- delivery remains `DRY_RUN` and in-application only;
- no external provider configuration exists;
- no approved external template exists;
- no external consent record exists;
- no non-dry-run external outbox row exists; and
- no email or WhatsApp provider request was made.

Local `.env` and `.env.local` contain none of the SchoolCast provider variable names. `.env.example` documents server-only placeholders only. Provider credentials, recipient contacts, database credentials, and webhook secrets must never be placed in this document or committed to Git.

## Evidence Contract

`infra/schoolcast-self-hosted/production-readiness-evidence.example.json` is the redacted template for the final production dossier. Copy it to the Git-ignored path:

```powershell
Copy-Item `
  .\infra\schoolcast-self-hosted\production-readiness-evidence.example.json `
  .\infra\schoolcast-self-hosted\production-readiness-evidence.local.json
$env:SCHOOLCAST_PRODUCTION_READINESS_EVIDENCE_FILE = `
  '.\infra\schoolcast-self-hosted\production-readiness-evidence.local.json'
npm run release:schoolcast:evidence
```

The validator accepts evidence references and aggregate pilot counts only. Unknown fields are rejected so API keys, webhook secrets, raw recipient contacts, database URLs, and message bodies cannot become part of the approved contract. A passing dossier still returns all production-action authorisations as `false`; migration, worker activation, and live delivery each require a separate explicit release approval.

## Email Gate

The implemented provider is Resend. Before an email pilot:

1. Assign an accountable owner for the Resend account and sending domain.
2. Verify a dedicated sending domain or subdomain with SPF and DKIM; record the provider evidence reference.
3. Store the production API key and webhook signing secret in server-only environment variables.
4. Create and approve versioned JinaCampus templates with fixed variable contracts and language mappings.
5. Record purpose-specific recipient consent, notice version, guardian authority, preferences, opt-out, withdrawal suppression, and retention policy.
6. Configure the provider quota, monthly spend cap or approved overage, alert threshold, and billing owner.
7. Register `/api/webhooks/resend`; test raw-body signature verification, invalid signatures, duplicate/replayed callbacks, bounces, complaints, failures, and provider disablement.
8. Run a controlled pilot only with explicitly consented test recipients. Record aggregate attempted, delivered, permanent-failure, duplicate, unconsented, and cross-tenant counts without addresses.

Resend currently requires domain ownership and SPF/DKIM verification for a custom sender. Its transactional plans are volume-based and the free plan has daily and monthly limits, so a billing decision and capacity calculation are required before pilot approval.

## WhatsApp Gate

The implemented provider is Meta Cloud API. Before a WhatsApp pilot:

1. Assign ownership of the Meta business, app, WhatsApp Business Account, and phone number.
2. Complete business and phone-number verification and store the access token and app/webhook secrets server-side.
3. Submit every template and language variant for provider approval; record exact variable order and purpose classification.
4. Complete the same purpose-specific consent, guardian-authority, preference, opt-out, withdrawal, retention, and legal/privacy review used by the application eligibility service.
5. Approve the Meta rate card, per-message category, monthly cap, alert threshold, quota, and overage policy.
6. Register `/api/webhooks/whatsapp`; test challenge verification, HMAC signature denial, replay/duplicate callbacks, sent/delivered/read/failed reconciliation, and provider disablement.
7. Run a controlled, consented recipient pilot and retain aggregate evidence only.

Meta states that WhatsApp Business Platform charges are based on delivered messages, recipient market, and message category. Actual rates must be captured from the approved business account at pilot time because rate cards can change.

## Consent and Privacy Gate

The current code already fails closed when a recipient lacks a usable contact, an enabled channel/purpose preference, or a current consent record. Production evidence must additionally show that the institution-approved notice is specific and understandable, guardian authority has been reviewed for student communications, withdrawal immediately suppresses future delivery, and retention/deletion procedures have passed legal and privacy review.

Indian regulatory obligations depend on message purpose and delivery channel. TRAI requires robust, verifiable consent records for regulated commercial communication, and the Digital Personal Data Protection Rules require clear notice for specific and informed consent. Qualified Indian privacy/telecom counsel must classify SchoolCast attendance, academic, and institutional messages before approval; this document is an engineering gate, not legal advice.

## Production Recovery Decision

The approved target remains **RPO at or below 15 minutes and RTO at or below 4 hours**. A live control-plane check on 15 August 2026 confirmed that the production Supabase project is healthy but belongs to an organisation on the Free plan. No protected production continuous-recovery dossier or production-representative restore evidence is available.

Supabase documents automatic daily backups for Pro, Team, and Enterprise projects, while Free projects should maintain manual off-site exports. Supabase PITR is a paid add-on for Pro, Team, and Enterprise and requires at least a Small compute add-on. Manual logical exports do not certify the approved 15-minute RPO, and database backup alone does not restore deleted Storage objects.

A guarded synthetic-staging rehearsal on 15 August 2026 created and checksum-verified a custom logical dump, restored it into an isolated disposable database, and validated 23 completed migrations, 116 public tables, 409 foreign keys, zero failed migrations, zero invalid indexes, and zero unvalidated constraints. Backup took 61.872 seconds, restore validation took 10.436 seconds, and the full rehearsal took 73.314 seconds. This proves restore mechanics only; it is on-demand, has no verified off-site copy, excludes Storage object bytes, and does not certify production RPO or RTO. See `docs/schoolcast-production-recovery-rehearsal.md`.

Only two acceptable paths remain:

1. **Funded Supabase PITR:** approve the required plan/compute/PITR costs, enable PITR, configure recovery monitoring, separately protect Storage objects, and pass an isolated restore rehearsal measuring RPO and RTO.
2. **Separately approved self-managed recovery:** approve an architecture with continuous WAL recovery, encryption, monitoring, independent off-site copies, key recovery, Storage recovery, named ownership, and an isolated restore rehearsal. This is a major database-operations change and must not be inferred from the preference for free infrastructure.

Until one path is funded or formally approved and rehearsed, the SchoolCast production migration and disabled-scope code deployment remain blocked. Migration, code deployment, workers, providers, feature-scope activation, and pilot-tenant enablement are independent authorisations.

## Formal Approvals

Operations, security/privacy, technical/engineering, and business/product approvals remain pending. Each approval must include the accountable person, UTC timestamp, immutable evidence reference, and zero open conditions. Development activity, a test pass, or a product request is not a stakeholder approval.

The authoritative summary and independent action ledger remain `docs/schoolcast-release-approval-ledger.md`.
