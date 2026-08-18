# Live Communications Feasibility And Recommendation

## Decision Status

- Assessment date: 2026-08-05
- Scope: attendance alerts, attendance reports, operational reminders, and future institution communications
- Current WhatsApp status: application foundation exists, but live provider delivery is not enabled
- Recommended operating model: WhatsApp-first for consented attendance exceptions, SMS fallback for urgent failures, email or secure portal links for long reports, and push notifications later
- Recommended sender ownership: one school-owned WhatsApp Business Account and sender number per institution, connected to JinaCampus through a provider-neutral adapter

This document is a feasibility and procurement decision record. It does not enable a provider, apply a migration, create consent, approve templates, or send a message.

## Executive Recommendation

Live WhatsApp attendance messaging is feasible and is a good fit for Indian school operations, but it should not be JinaCampus's only communication channel.

Use this channel policy:

1. Send WhatsApp utility templates for explicitly consented, time-sensitive attendance exceptions such as Absent, Late, and selected staff attendance summaries.
2. Use SMS only as a controlled fallback when WhatsApp is unavailable, the recipient has no WhatsApp consent, or a time-critical WhatsApp attempt fails and SMS consent/DLT requirements are satisfied.
3. Use email and an authenticated JinaCampus link for detailed weekly/monthly reports, documents, and future salary information. A short WhatsApp summary may link to the report.
4. Add push notifications only after parent/staff app or installed-PWA adoption is sufficient. Push should reduce routine channel cost, not replace SMS for urgent reach.
5. Do not send every student's normal Present status every day by default. Exception-only delivery is materially cheaper and less likely to trigger opt-outs or poor WhatsApp quality ratings.

For the first controlled pilot, use an India-capable Business Solution Provider (BSP) that supports WhatsApp, DLT-compliant SMS, per-school account ownership, template management, delivery webhooks, data-processing terms, and account portability. Keep the existing `META_CLOUD` adapter option so high-volume customers can use direct Meta Cloud API later.

## Current JinaCampus Readiness

The repository already contains the correct provider-neutral foundation:

- tenant/branch-scoped `CommunicationPreference`
- tenant/branch-scoped `NotificationTemplate`
- duplicate-safe `NotificationOutbox`
- provider status `NotificationDeliveryLog`
- tenant/branch-scoped `WhatsAppIntegrationSetting`
- explicit guardian and employee consent gates
- student attendance alert queueing
- weekly and monthly employee attendance summaries
- immediate best-effort dispatch plus a protected recurring worker endpoint
- webhook status handling foundation
- audit logging, error sanitisation, and institutional time-zone resolution
- safe `DRY_RUN` mode

The live adapter currently and intentionally stops before sending because approved provider credential decryption is not configured. That is the correct production-safe behavior.

### Remaining Live Gates

1. Choose the sender ownership and provider model.
2. Complete Meta/provider business onboarding and phone verification.
3. Approve the WhatsApp templates and language variants.
4. Implement approved encrypted secret storage and the live provider adapter.
5. Apply pending notification migration(s) to the selected environment.
6. Capture explicit, versioned recipient consent; a stored phone number alone is not consent.
7. Configure the recurring worker and delivery-failure monitoring.
8. Complete provider sandbox, controlled-recipient, duplicate, webhook, and fallback QA.
9. Sign school, JinaCampus, and provider privacy/data-processing terms.
10. Establish monthly cost caps and support/escalation ownership.

## WhatsApp Account And Sender Model

### Available Models

| Model | Benefit | Material risk | Recommendation |
|---|---|---|---|
| One JinaCampus WABA/number for every school | Fastest initial setup | One school's complaints or poor quality can reduce limits or suspend messaging for every tenant; weak school identity; combined billing and consent risk | Do not use for commercial multi-tenant rollout |
| One school-owned WABA/number per institution | Strong identity, account portability, quality and billing isolation | More onboarding and support work | Preferred production model |
| One pilot-school WABA managed through a BSP | Fast controlled launch while preserving school ownership | BSP dependency and recurring fee | Preferred pilot model |

Meta's onboarding guidance states that a business needs a dedicated number capable of SMS or voice verification, an accurate display name, customer opt-in, business verification, templates, and gradual scaling based on message quality. New accounts begin with limited business-initiated reach and scale through quality tiers, which makes a shared platform-wide sender especially risky for a multi-tenant product. See Meta's [official onboarding guide](https://whatsappbusiness.com/wp-content/uploads/2026/04/Onboarding-to-the-WhatsApp-Business-Platform.pdf).

For scalable self-service school onboarding, Meta's Embedded Signup flow requires App Review and Advanced Access for relevant business/WhatsApp management permissions, secure HTTPS endpoints, system-user access, WABA subscription, phone registration, and billing integration. See Meta's [official Embedded Signup collection](https://www.postman.com/meta/whatsapp-business-platform/documentation/du6gzjv/embedded-signup).

### Existing School Numbers

The preferred onboarding path is an institution-owned WhatsApp Business App number when Meta and the selected provider expose an eligible Embedded Signup or Coexistence path. Eligibility must be checked during onboarding and must never be promised in advance. If Coexistence is unavailable, the school should use a dedicated institution-owned number accepted by the current WhatsApp Business registration process.

A number registered only with personal WhatsApp Messenger is not accepted directly as an automated institutional sender. An authorised school representative must first complete a supported move to WhatsApp Business App or WhatsApp Business Platform.

Schools must not manually enter access tokens, app secrets, webhook secrets, WABA IDs, phone-number IDs, or other provider internals into JinaCampus. Any guided provider-onboarding workflow requires a separate approved architecture, security review, and release plan before implementation.

## WhatsApp Administrative Requirements

### JinaCampus / Legal Entity

- Meta Business Portfolio controlled by the responsible legal entity
- verified legal business name, address, telephone, website/domain, and supporting registration documents
- named business and technical administrators with MFA
- privacy policy and support contact visible on the business profile
- Meta app and app review if JinaCampus onboards customer-owned WABAs directly
- provider contract, billing account, tax details, and incident escalation contacts
- documented ownership and exit/number-porting process

### Per School

- institution-approved WhatsApp sender policy
- school-owned or contractually assigned WABA and dedicated phone number
- display name matching school branding and legal/operating identity
- phone capable of receiving the registration SMS or voice call
- school administrator responsible for consent, template content, and opt-outs
- approved primary and backup contacts for provider incidents
- current guardian and employee numbers in international/E.164 form

Meta's Cloud API requires a Business Portfolio, WABA, business phone number, access token, phone-number ID, WABA ID, phone registration, and two-step verification PIN. Production should use a least-privilege system-user token rather than a temporary user token. Meta's official [Cloud API collection](https://www.postman.com/meta/whatsapp-business-platform/documentation/wlk6lh4/whatsapp-cloud-api) documents these assets and registration calls.

## Message Templates And Content Policy

Business-initiated attendance alerts must use approved templates. Free-form replies are allowed only during the 24-hour customer-service window opened by a recipient message. Meta may approve, reject, pause, or reclassify a template. Its [Business Messaging Policy](https://whatsappbusiness.com/policy/) also requires that the recipient provided the number, opted in, and can opt out.

Prepare separate non-promotional templates for:

- `student_attendance_exception`
- `student_attendance_daily_status`, only if a school intentionally enables all-status messaging
- `staff_weekly_attendance_summary`
- `staff_monthly_attendance_summary`
- `communication_delivery_fallback_notice`, only if operationally necessary

Template rules:

- submit attendance templates as Utility candidates, but treat Meta's final classification as authoritative
- no marketing copy, promotions, admissions campaigns, or unrelated content in attendance templates
- keep variables bounded and mapped to named server-side fields
- approve every required language variant separately
- include institution identity and a clear support/opt-out path
- use one template message when possible to avoid extra cost and fragmented delivery
- put detailed reports behind an authenticated, short-lived JinaCampus link rather than sending sensitive full records in chat
- do not send payroll or salary amounts over WhatsApp by default; require a separately approved privacy decision and secure portal access

Meta charges per delivered message based on recipient market and category, provides free service messages, and does not charge utility messages sent in response to users during the service window. Current rates and tiers are dynamic and must be read from Meta's [official pricing page](https://whatsappbusiness.com/products/platform-pricing/) during procurement.

## Consent, Privacy, And Legal Requirements

This section is an implementation checklist, not legal advice. Indian counsel should confirm the final school/JinaCampus/provider contract and the phased commencement dates that apply at launch.

### WhatsApp Consent

Capture a clear affirmative opt-in that identifies:

- the school and JinaCampus as the communication service
- the destination WhatsApp number
- attendance alerts and report categories
- expected frequency
- language preference
- how to withdraw consent
- whether SMS fallback is separately enabled
- consent time, source, policy version, and authorised school actor

Do not infer WhatsApp consent from admission, employment, a general terms checkbox, or the presence of a phone number. Respect opt-outs immediately. Meta makes the business responsible for lawful notice, permission, opt-in, and opt-out handling in its [Business Messaging Policy](https://whatsappbusiness.com/policy/).

### India Data Protection

Attendance messages process student, guardian, employee, phone, and behavioral/attendance data. The school will generally determine the educational purpose, while JinaCampus and the provider process data under contractual instructions; counsel must confirm the exact Data Fiduciary/Data Processor roles.

The Digital Personal Data Protection Act and 2025 Rules use phased commencement. The notified framework includes purpose-specific notice, security, grievance handling, withdrawal, retention/deletion controls, and special rules for children's data. The official [India Code Act record](https://www.indiacode.nic.in/handle/123456789/22037?col=123456789%2F1362&view_type=search), [commencement schedule](https://www.indiacode.nic.in/show-data?abv=CEN&actid=AC_CEN_45_0_00003_2023-22_1763464807080&orderno=1&orgactid=AC_CEN_45_0_00003_2023-22_1763464807080&sectionId=101267&sectionno=1&statehandle=123456789%2F1362), and [DPDP Rules 2025](https://www.meity.gov.in/documents/act-and-policies/digital-personal-data-protection-rules-2025-gDOxUjMtQWa) must be reviewed again immediately before go-live.

Required controls:

- school-JinaCampus Data Processing Agreement
- provider/subprocessor schedule and cross-border processing disclosure
- purpose and data-minimisation statement for each message category
- parent/authorised-guardian identity and relationship verification
- no direct child messaging in the first release
- retention limits for payloads, provider status, consent evidence, and audit records
- correction, withdrawal, deletion, and grievance workflow
- breach response and provider incident notification clauses
- no advertising, profiling, or unrelated reuse of attendance recipient data

### SMS Compliance

India SMS fallback requires Principal Entity registration, a registered sender header, registered content templates, and consent handling under the TRAI commercial communications framework. TRAI states these sender/header/template/consent steps are required before commercial communication can be sent. See [TRAI Advice to Senders](https://www.trai.gov.in/advice-to-senders).

WhatsApp opt-in does not automatically grant SMS consent. Keep channel consents separate.

## Live Technical Architecture

The existing outbox architecture should remain the single orchestration path:

```text
Attendance transaction commits
  -> tenant/branch policy and recipient consent evaluated
  -> immutable notification intent queued with idempotency key
  -> worker claims row atomically
  -> provider adapter sends approved template
  -> provider message ID stored
  -> signed webhook updates sent/delivered/read/failed state
  -> retry, dead-letter, or eligible SMS fallback
  -> audit and operational metrics updated
```

### Provider Adapter Contract

Each adapter should support:

- `sendTemplate()` with tenant-derived configuration only
- provider message ID and safe error code mapping
- idempotency/retry classification
- signed webhook verification and replay protection
- sent, delivered, read, failed, and template/account status updates
- health/readiness check without exposing credentials
- per-tenant cost/volume counters

Meta exposes sent, delivered, read, and failed status events through webhooks; delivery and read states should be recorded but must not be treated as proof that a human acted on the message. See Meta's [official webhook/API collection](https://www.postman.com/meta/whatsapp-business-platform/documentation/wlk6lh4/whatsapp-cloud-api).

### Secrets

- store provider access tokens in an approved secrets manager or envelope-encrypted store
- store only an encrypted value or secret reference in tenant settings
- use different credentials or scoped access per school/WABA where supported
- never return tokens to the browser or include them in audit metadata
- rotate tokens and app secrets on a schedule and after personnel/provider changes
- hash webhook verification tokens and verify request signatures before parsing status updates
- redact phone numbers and provider payloads in application logs

### Worker And Reliability Controls

For the ten-minute absence target:

- attempt immediate processing after attendance commits
- run a worker every minute where the hosting plan permits; ten minutes leaves no delay margin
- alert when the oldest eligible queued alert exceeds five minutes
- retry transient provider/network failures with bounded exponential backoff and jitter
- do not retry invalid numbers, revoked consent, rejected templates, or permanent policy errors
- move exhausted items to a reviewable failed/dead-letter state
- trigger SMS fallback only once and only with separate SMS eligibility
- retain the existing database uniqueness/idempotency guard
- keep notification failure non-blocking for the attendance transaction

Suggested operational SLOs for the pilot:

- 99% of eligible absence intents receive a first provider attempt within five minutes
- 95% of accepted WhatsApp messages reach delivered status within ten minutes, measured separately from queue time
- duplicate sends: zero
- unconsented sends: zero
- webhook signature failures: alert immediately
- provider/template/account disablement: alert immediately and pause affected sender

The provider must publish a status page and offer a documented support escalation path. JinaCampus should monitor both its own queue and Meta's [business product status](https://metastatus.com/whatsapp-business-api).

## Provider Options

| Path | Integration effort | Recurring provider cost | Tenant onboarding | Support | Best use |
|---|---:|---:|---|---|---|
| Direct Meta Cloud API | Highest | Meta message charges plus JinaCampus infrastructure/operations | JinaCampus must implement Embedded Signup/app review for scale | Meta support model | Mature, high-volume platform |
| India-focused BSP | Medium/low | Meta charges plus monthly/platform or message fee | Often assisted; may combine WhatsApp and DLT SMS | India business-hours/onboarding support | Recommended pilot |
| Global BSP such as Twilio | Medium/low | Meta charges plus provider fee | Managed onboarding and unified APIs | Mature global support | Multi-country rollout or existing Twilio estate |

Examples are not procurement endorsements:

- Twilio publicly charges USD 0.005 per inbound or outbound WhatsApp message in addition to Meta template fees, with other optional/failed-message charges described on its [WhatsApp pricing page](https://www.twilio.com/en-us/whatsapp/pricing).
- MSG91 publicly lists an `INR 500/month/number` WhatsApp subscription after its introductory period, plus per-message pricing, on its [subscription page](https://msg91.com/help/whatsapp/whatsapp-subscription).

Request written proposals from at least two India-capable providers and score:

- school-owned WABA and phone-number portability
- Embedded Signup support
- WhatsApp plus India DLT SMS support
- current Meta-rate pass-through and all markups
- delivery/webhook completeness
- retry behavior and idempotency support
- DPA, subprocessors, data locations, retention, and deletion
- SLA, support hours, incident response, and escalation
- dashboard/API export and billing per tenant
- template approval assistance and language support
- ability to leave without losing the WABA, number, or templates

## Channel Comparison

| Channel | Reach and urgency | Delivery evidence | Typical recurring cost | Administrative burden | Main limitation |
|---|---|---|---|---|---|
| WhatsApp Business Platform | High in India for recipients with WhatsApp/data | sent/delivered/read/failed webhooks | Per delivered template plus provider fees | Meta verification, WABA, templates, consent, quality management | Platform policy/account-quality dependency |
| SMS | Highest handset reach; no app/data required | carrier submitted/delivery receipt, not human read | Per segment plus DLT/provider/tax | India PE/header/template/consent registration | Cost, short/Unicode segmentation, weak rich-report UX |
| Email | Good for detailed reports, low urgency | send/delivery/bounce/complaint; opens are imperfect | Very low per recipient | domain verification, SPF/DKIM/DMARC, reputation | Spam filtering and lower immediate attention |
| App/PWA push | Fast when installed and permitted | accepted/device-token outcomes, limited human confirmation | No FCM transport charge; engineering/operations remain | app/PWA install, permission, token lifecycle | Cannot reach users without an installed/authorised client |
| Portal/in-app inbox | Strong source of truth and privacy | full application audit | Existing application cost | authenticated user adoption | No proactive reach without another channel |

Current public reference prices, which must be refreshed before contracting:

- Meta WhatsApp pricing is per delivered message and varies by market/category; use the current India Utility rate from the [Meta pricing calculator](https://whatsappbusiness.com/products/platform-pricing/).
- MSG91 publishes India SMS tiers from `INR 0.25` at 5,000 messages to `INR 0.16` at 962,500 messages, excluding 18% GST, on its [SMS pricing page](https://msg91.com/in/pricing/sms). Messages can consume multiple billable segments.
- New Amazon SES accounts currently start at `USD 0.16 per 1,000` outbound emails on Essentials, plus data and optional features, according to [Amazon SES pricing](https://aws.amazon.com/ses/pricing/). Production email also needs authenticated sending; AWS documents SPF, DKIM, and DMARC on its [DMARC guide](https://docs.aws.amazon.com/ses/latest/dg/send-email-authentication-dmarc.html).
- Firebase lists Cloud Messaging as no-cost, while app/backend, support, analytics, and operations still have engineering cost. See [Firebase pricing](https://firebase.google.com/pricing) and [FCM documentation](https://firebase.google.com/docs/cloud-messaging).

## Cost Model For A Representative School

Illustrative volume, not a provider quote:

- 1,000 students
- 22 attendance days per month
- 5% daily attendance exceptions
- 100 employees
- 4 weekly summaries plus 1 monthly summary per employee

| Policy | Approximate monthly outbound items |
|---|---:|
| Every student receives every daily status | 22,000 student messages |
| Exception-only student WhatsApp | 1,100 student alerts |
| Employee weekly and monthly summaries | 500 employee summaries |
| Recommended WhatsApp total | About 1,600 templates |
| Optional SMS fallback at 10% of student exceptions | About 110 SMS segments, before multipart effects |

Sending every status would produce roughly twenty times the student WhatsApp volume of a 5% exception-only policy. This is why exception-only should be the commercial default.

Use these budgeting formulas:

```text
WhatsApp monthly = delivered templates x current India category rate
                 + BSP per-message/platform/number fees
                 + taxes

SMS monthly      = submitted billable segments x India route rate
                 + DLT/provider fees
                 + taxes

Email monthly    = recipients x email rate
                 + attachment/data/deliverability options

Push monthly     = application infrastructure and operations
                 + zero FCM transport charge
```

Set a budget per tenant and channel, alert at 70/90/100%, and fail closed for non-urgent bulk messages when the cap is reached. Attendance recording must never fail because a communication budget is exhausted.

## Report-Sharing Policy

Recommended channel split:

- Student Absent/Late: concise WhatsApp template, SMS fallback if separately eligible
- Student daily Present: portal only by default
- Employee weekly summary: WhatsApp summary or email according to preference
- Employee monthly detailed report: email plus authenticated portal; optional WhatsApp link
- Future salary report: portal only by default, with a generic WhatsApp/email availability notice
- institution reminders: channel chosen by urgency, recipient preference, template classification, and budget

Any report link should be authenticated or use a short-lived, single-purpose signed token, avoid record IDs that reveal tenancy, and be invalidated after expiry or consent/account changes.

## Required JinaCampus Settings

Keep settings small and operational:

### Platform Administrator Only

- provider type and tenant integration provisioning
- encrypted secret reference and webhook readiness
- provider health and template/account status sync
- tenant channel budget/cap
- provider suspension and incident controls

### Principal / Authorised School Administrator

- school sender identity/readiness view without secrets
- student exception policy and eligible statuses
- employee weekly/monthly schedule
- approved template/language selection
- guardian and employee channel consent/preferences
- SMS fallback policy
- institution support/opt-out contact
- institutional time zone and report timing

### Operational Health View

- queued, sent, delivered, read, failed, and fallback counts
- oldest queued item age
- consent-ineligible/skipped counts
- template rejected/paused state
- WABA/phone quality state
- monthly volume and estimated cost by tenant/channel
- last successful worker and webhook time

Do not expose provider tokens, webhook secrets, raw provider payloads, or full recipient numbers in settings or logs.

## Phased Delivery Plan

### Phase 0: Procurement And Governance

1. Approve per-school WABA ownership.
2. Select a pilot BSP after security, DPA, portability, SLA, and price review.
3. Approve privacy notice, channel-specific consent wording, opt-out, and retention.
4. Approve exception-only default and SMS fallback policy.
5. Obtain current India rate cards and a written all-in quote.

### Phase 1: Provider Sandbox

1. Create/verify the pilot school's WABA, sender number, display name, and two-step PIN.
2. Approve templates in required languages.
3. Implement live adapter and approved secret decryption.
4. Verify signed webhooks and all delivery states.
5. Apply migrations and configure recurring worker/monitoring.
6. Run synthetic and `DRY_RUN` tests without real recipient data.

### Phase 2: Controlled Real-Recipient Pilot

1. Use one branch and a small group of staff/guardians with recorded consent.
2. Test Absent, duplicate submission, correction, invalid number, opt-out, provider failure, and SMS fallback.
3. Verify the ten-minute SLO, cost counters, status reconciliation, and support escalation.
4. Run for at least two school weeks before increasing scope.

### Phase 3: Scale And Omnichannel

1. Add school self-onboarding through BSP or Meta Embedded Signup.
2. Add email report delivery and secure links.
3. Add SMS fallback for eligible tenants.
4. Add app/PWA push when adoption supports it.
5. Re-evaluate direct Meta Cloud API when volume savings exceed BSP support value.

## Go-Live Checklist

Live WhatsApp must remain disabled until every item is true:

- [ ] School owns or contractually controls its WABA and sender number
- [ ] Meta/provider business and phone verification passed
- [ ] Display name approved
- [ ] Message templates and required languages approved
- [ ] Legal/privacy/DPA review completed
- [ ] Explicit recipient consent captured and withdrawal tested
- [ ] Live provider adapter and encrypted secrets verified
- [ ] Tenant/branch isolation and RBAC tests passed
- [ ] Idempotency and concurrent-worker duplicate tests passed
- [ ] Webhook signature, replay, delivered, read, and failed tests passed
- [ ] Retry/dead-letter and provider outage alerts passed
- [ ] Recurring worker and ten-minute SLO monitoring passed
- [ ] Channel budgets and cost alerts configured
- [ ] SMS DLT and separate consent completed before SMS fallback is enabled
- [ ] Controlled real-recipient pilot signed off

## Final Feasibility Assessment

| Dimension | Assessment | Reason |
|---|---|---|
| Technical feasibility | High | Core tenant-safe consent, template, outbox, delivery-log, worker, and audit foundations already exist |
| Delivery reliability | High with fallback; medium as WhatsApp-only | API and status webhooks are robust, but provider, account-quality, template, handset, and network failures remain |
| Scalability | High | Queue-based delivery and per-school WABAs isolate scale and quality limits |
| Security | High if release gates are followed | Requires encrypted secrets, signed webhooks, minimal payloads, retention, and strict tenant scope |
| Administrative effort | Medium/high | Each school needs identity, number, consent, templates, and ongoing quality governance |
| Recurring cost | Low/medium for exception-only; potentially high for all-status | Cost is linear by delivered template and provider fees |
| Long-term suitability | Strong as part of hybrid communications | WhatsApp is accessible, but SMS/email/push cover different reliability and cost needs |

**Recommendation:** proceed with a controlled BSP-backed, per-school WABA pilot using exception-only WhatsApp attendance alerts. Add DLT-compliant SMS only as an urgent fallback, use email/portal for detailed reports, and preserve the existing provider abstraction for direct Meta and push integrations later. Do not declare live communication ready until consent, templates, encrypted credentials, worker monitoring, webhook status QA, and a real-recipient pilot all pass.
