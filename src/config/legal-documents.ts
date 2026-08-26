import { LEGAL_PUBLICATION, type LegalDocumentStatus } from "@/config/legal";

export type LegalDocumentSection = {
  heading: string;
  paragraphs?: readonly string[];
  bullets?: readonly string[];
};

export type LegalDocumentDefinition = {
  slug: LegalDocumentSlug;
  title: string;
  description: string;
  status: LegalDocumentStatus;
  version: string;
  effectiveDate: string | null;
  sections: readonly LegalDocumentSection[];
};

export const LEGAL_DOCUMENT_SLUGS = [
  "privacy",
  "terms",
  "cookies",
  "acceptable-use",
  "data-rights",
  "security",
  "data-processing"
] as const;

export type LegalDocumentSlug = (typeof LEGAL_DOCUMENT_SLUGS)[number];

const contactInstruction = LEGAL_PUBLICATION.privacyContactEmail
  ? `Contact ${LEGAL_PUBLICATION.privacyContactEmail}.`
  : "Use the privacy contact stated in your institution's JinaCampus agreement. The public privacy contact is pending authorised publication.";

const grievanceInstruction = LEGAL_PUBLICATION.grievanceContactEmail
  ? `Contact ${LEGAL_PUBLICATION.grievanceOfficerName ?? "the Grievance Officer"} at ${LEGAL_PUBLICATION.grievanceContactEmail}.`
  : "Use the grievance contact stated in your institution's JinaCampus agreement. The public Grievance Officer details are pending authorised publication.";

const common = {
  status: LEGAL_PUBLICATION.status,
  version: LEGAL_PUBLICATION.version,
  effectiveDate: LEGAL_PUBLICATION.effectiveDate
};

export const LEGAL_DOCUMENTS: Record<LegalDocumentSlug, LegalDocumentDefinition> = {
  privacy: {
    ...common,
    slug: "privacy",
    title: "Privacy Notice",
    description: "How JinaCampus handles personal data for school operations.",
    sections: [
      {
        heading: "1. Scope and responsibilities",
        paragraphs: [
          "This notice applies to JinaCampus school-management services and the related public sign-in and support surfaces. Under the usual service arrangement, the school or institution decides why student, guardian, staff, and academic data is used. JinaCampus processes that data under the institution's documented instructions and the signed service and data-processing agreements. The final legal allocation of responsibilities must match the executed agreement.",
          "This document is a controlled draft unless it is marked Effective. A draft is provided for transparency and review but is not a substitute for an approved institution agreement or legal advice."
        ]
      },
      {
        heading: "2. Data we process",
        bullets: [
          "Institution, branch, academic-year, class, section, and subject records.",
          "Student identity, admission, enrollment, attendance, academic, guardian, and authorised document records.",
          "Staff identity, employment, role, leave, attendance, and account-access records.",
          "Account, authentication, session, permission, audit, security, device, and support metadata.",
          "Optional communication preferences and consent evidence where a communication feature is enabled.",
          "Subscription, service, and billing records when an institution purchases a paid service."
        ]
      },
      {
        heading: "3. Purpose and data minimisation",
        paragraphs: [
          "Data is used to provide authorised school administration, attendance, academic, staff, reporting, security, support, and contractual services. Institutions and authorised users must collect only information that is necessary and permitted for a stated school purpose.",
          "Aadhaar is optional in JinaCampus and must not be made a condition of school admission. When an authorised institution enters Aadhaar or bank details, JinaCampus stores only masked references and the last four digits in the student record."
        ]
      },
      {
        heading: "4. Children and guardian authority",
        paragraphs: [
          "Schools must establish and document the lawful authority to process children's data, including verifiable parent or lawful-guardian consent where required. JinaCampus does not use student data for behavioural advertising, targeted advertising, or commercial profiling.",
          "Schools must not upload documents, photographs, identifiers, health details, or guardian contact details unless they are necessary, authorised, and covered by the institution's notice and consent process."
        ]
      },
      {
        heading: "5. Sharing and service providers",
        paragraphs: [
          "Data is available only to authorised users within the applicable tenant, institution, branch, academic year, and role scope. JinaCampus may use contracted hosting, database, storage, security, and support providers listed in the current subprocessor register. Optional communication providers are used only when separately configured and approved.",
          "Personal data is not sold. It may be disclosed where required by law, to protect users or the service, or under documented institutional instructions and contractual safeguards."
        ]
      },
      {
        heading: "6. Security, retention, and location",
        paragraphs: [
          "JinaCampus applies tenant isolation, permission-based access, secure session controls, private storage where required, audit logging, encryption provided by approved infrastructure, backup controls, and incident procedures. No system is risk-free, and institutions must also protect their accounts, devices, networks, and authorised-user access.",
          "Records are retained only for the documented school, statutory, contractual, security, backup, dispute, and audit purposes in the approved retention schedule. Expired data is deleted, anonymised, or returned through an authorised process. Cross-border processing, if any, must be documented in the service agreement and subprocessor register and reviewed against applicable restrictions."
        ]
      },
      {
        heading: "7. Access, correction, erasure, withdrawal, and grievances",
        paragraphs: [
          "Students and guardians should normally submit requests through their school because the institution controls the school record and must verify the requester's authority. Staff and account users may contact their institution administrator. JinaCampus supports verified institutions with access, correction, export, restriction, withdrawal, and deletion requests, subject to legal retention and security requirements.",
          `${contactInstruction} For an unresolved grievance, ${grievanceInstruction}`
        ]
      },
      {
        heading: "8. Changes",
        paragraphs: [
          "Material changes require versioning, approval, an effective date, and appropriate notice. The version and status shown on this page are authoritative only after the publication gate is complete."
        ]
      }
    ]
  },
  terms: {
    ...common,
    slug: "terms",
    title: "Terms of Service",
    description: "Rules governing institutional and authorised-user access to JinaCampus.",
    sections: [
      {
        heading: "1. Contract and authority",
        paragraphs: [
          "These Terms work with the signed order form, service agreement, data-processing agreement, and applicable schedules. If there is a conflict, the signed agreement controls. A person creating or administering an institution workspace confirms that they are authorised to act for that institution.",
          "These Terms are a controlled draft unless marked Effective and formally approved."
        ]
      },
      {
        heading: "2. Accounts and school responsibilities",
        bullets: [
          "Provide accurate institution and authorised-user information and keep it current.",
          "Assign the minimum permissions required and promptly disable access that is no longer authorised.",
          "Protect passwords, passkeys, devices, and recovery channels, and report suspected misuse promptly.",
          "Provide legally sufficient notices and obtain required parent, guardian, staff, and recipient consent.",
          "Use JinaCampus only for lawful school and institutional purposes."
        ]
      },
      {
        heading: "3. Services, modules, and changes",
        paragraphs: [
          "Access depends on the institution's active subscription, feature entitlements, role permissions, and service configuration. Disabled modules preserve historical data according to the agreement and retention policy; disabling access does not automatically delete records.",
          "Material service changes, deprecations, maintenance, and security actions will be managed under the signed agreement and published operational procedures."
        ]
      },
      {
        heading: "4. Fees, renewal, cancellation, and refunds",
        paragraphs: [
          "Prices, taxes, payment dates, limits, renewal, trial, grace, cancellation, and refund terms are defined in the institution's signed order form and applicable law. JinaCampus currently does not represent an unconfigured billing provider or checkout flow as operational."
        ]
      },
      {
        heading: "5. Data and intellectual property",
        paragraphs: [
          "The institution and relevant individuals retain their rights in institution-provided data. The institution grants only the limited rights needed to operate, secure, support, and improve the contracted service without using identifiable student data for advertising.",
          "JinaCampus software, branding, documentation, and service materials remain owned by their applicable rights holder. No right is granted except the limited subscription licence in the signed agreement."
        ]
      },
      {
        heading: "6. Availability, backup, and security",
        paragraphs: [
          "Service levels, support windows, backup scope, recovery objectives, maintenance, and exclusions must be stated in the signed service schedule. Users must not treat an unverified free-tier recovery capability as a contractual guarantee.",
          "JinaCampus may suspend access needed to contain a security incident, comply with law, prevent misuse, or protect tenant data, with notice where practicable."
        ]
      },
      {
        heading: "7. Suspension, termination, and exit",
        paragraphs: [
          "Suspension and termination follow the signed agreement, including notice, cure periods, payment status, security needs, export assistance, retention, and deletion. Production data is never deleted merely because a module is hidden or a subscription expires."
        ]
      },
      {
        heading: "8. Warranties, liability, disputes, and notices",
        paragraphs: [
          "Any warranty exclusions, liability limits, indemnities, governing law, venue, dispute process, and formal notice addresses require authorised legal and business approval in the signed agreement. This public draft does not create an unapproved liability cap or jurisdiction commitment.",
          `${contactInstruction}`
        ]
      }
    ]
  },
  cookies: {
    ...common,
    slug: "cookies",
    title: "Cookie Notice",
    description: "The limited cookies and browser storage used by JinaCampus.",
    sections: [
      {
        heading: "1. Current use",
        paragraphs: [
          "JinaCampus currently uses strictly necessary, secure session cookies to keep school and platform-administrator sign-ins separate and to maintain authorised school context. These cookies are required for authentication, security, and requested application functionality.",
          "The reviewed application does not currently include advertising cookies, behavioural profiling, or optional analytics cookies. Because only strictly necessary cookies are used, a marketing-style consent banner would be misleading."
        ]
      },
      {
        heading: "2. Cookie controls",
        bullets: [
          "Session cookies are HTTP-only and are not available to browser scripts.",
          "Secure transport is required in production and same-site protections reduce cross-site request risks.",
          "Signing out clears or revokes the applicable session.",
          "Blocking necessary cookies will prevent sign-in and authenticated workflows."
        ]
      },
      {
        heading: "3. Future tracking",
        paragraphs: [
          "Any future non-essential analytics, advertising, or cross-site tracking requires a separate assessment, an updated notice, purpose-specific controls, and consent where required before activation. Institutions must not add unapproved tracking code to JinaCampus pages."
        ]
      }
    ]
  },
  "acceptable-use": {
    ...common,
    slug: "acceptable-use",
    title: "Acceptable Use Policy",
    description: "Safe and authorised use of JinaCampus services.",
    sections: [
      {
        heading: "1. Permitted use",
        paragraphs: [
          "Use JinaCampus only for authorised educational, administrative, attendance, employment, reporting, support, and institutional purposes within the user's assigned role and scope."
        ]
      },
      {
        heading: "2. Prohibited activity",
        bullets: [
          "Accessing another tenant, institution, branch, academic year, user, student, or staff record without authority.",
          "Sharing credentials, bypassing permissions, probing security controls, or introducing malware.",
          "Uploading unlawful, unnecessary, misleading, abusive, infringing, or unlicensed content.",
          "Using student, guardian, or staff data for advertising, profiling, harassment, discrimination, or unrelated commercial purposes.",
          "Sending communications without authority, consent, approved content, or recipient safeguards.",
          "Exporting records to unmanaged personal devices or services contrary to institutional policy."
        ]
      },
      {
        heading: "3. Enforcement",
        paragraphs: [
          "JinaCampus and the institution may investigate, restrict, suspend, preserve evidence, or terminate access in accordance with the signed agreement, law, security procedures, and due process appropriate to the risk. Suspected misuse should be reported through the approved support or grievance channel."
        ]
      }
    ]
  },
  "data-rights": {
    ...common,
    slug: "data-rights",
    title: "Data Rights and Grievance Requests",
    description: "How verified individuals can request access, correction, export, or deletion.",
    sections: [
      {
        heading: "1. Where to submit a request",
        paragraphs: [
          "For school records, contact the relevant institution first. The institution controls the record, knows the authorised guardian or staff relationship, and can correct operational data. If the request concerns JinaCampus's independent processing or remains unresolved, use the privacy or grievance contact published here.",
          `${contactInstruction} ${grievanceInstruction}`
        ]
      },
      {
        heading: "2. Supported requests",
        bullets: [
          "A summary of personal data and processing information available under applicable law.",
          "Correction, completion, or updating of inaccurate school or account records.",
          "Export or portability support where contractually and technically available.",
          "Erasure where the purpose has ended and no legal, security, audit, dispute, or retention requirement applies.",
          "Withdrawal of consent with consequences explained before the withdrawal is completed.",
          "Grievance escalation and nomination requests where applicable."
        ]
      },
      {
        heading: "3. Verification and safety",
        paragraphs: [
          "Requests are verified using the minimum information needed to prevent disclosure to an unauthorised person. A parent or guardian may need to demonstrate authority for a child. JinaCampus will not ask for a password, reset token, full payment credential, or unnecessary identity document in an ordinary rights request.",
          "Some records cannot be changed or deleted immediately because of legal obligations, audit integrity, dispute preservation, backup cycles, or the rights of another person. Any restriction will be explained through the verified response channel."
        ]
      }
    ]
  },
  security: {
    ...common,
    slug: "security",
    title: "Security and Incident Notice",
    description: "Public security commitments and responsible reporting guidance.",
    sections: [
      {
        heading: "1. Security controls",
        bullets: [
          "Server-side authentication, tenant isolation, branch scope, role permissions, and feature entitlements.",
          "Password hashing, secret-safe sessions, passkey support, forced password change, and session revocation controls.",
          "Private document storage and time-limited access where the feature is configured.",
          "Audit logging for critical identity, attendance, academic, administrative, and data actions.",
          "Validated inputs, controlled migrations, backup and recovery procedures, monitoring, and incident response."
        ]
      },
      {
        heading: "2. Reporting a vulnerability or incident",
        paragraphs: [
          "Do not include passwords, session cookies, reset tokens, database credentials, raw student documents, or unnecessary personal data in an initial report. Provide a concise description, affected page or feature, time observed, and safe reproduction details through the approved support channel.",
          `${LEGAL_PUBLICATION.supportContactEmail ? `Contact ${LEGAL_PUBLICATION.supportContactEmail}.` : "The public security-support address is pending authorised publication; use the support contact in the institution agreement."}`
        ]
      },
      {
        heading: "3. Incident handling",
        paragraphs: [
          "JinaCampus triages incidents, contains affected access, preserves evidence, assesses affected data and tenants, coordinates required notifications, remediates the cause, and records lessons learned. Regulatory and affected-person notifications follow applicable law and the signed incident schedule."
        ]
      }
    ]
  },
  "data-processing": {
    ...common,
    slug: "data-processing",
    title: "Data Processing Summary",
    description: "The operational division of responsibilities between institutions and JinaCampus.",
    sections: [
      {
        heading: "1. Institution responsibilities",
        bullets: [
          "Define lawful, specific school purposes and provide required notices.",
          "Verify parent, guardian, student, staff, and authorised-user identity and authority.",
          "Configure roles, branches, academic years, retention, communications, and enabled modules.",
          "Keep records accurate and respond to rights requests with JinaCampus support.",
          "Avoid uploading unnecessary or unauthorised personal data."
        ]
      },
      {
        heading: "2. JinaCampus responsibilities",
        bullets: [
          "Process institution data only for documented service purposes and instructions.",
          "Apply contractual confidentiality, security, tenant isolation, access control, and audit safeguards.",
          "Control subprocessors and assist with incidents, rights requests, exports, return, and deletion.",
          "Notify institutions of material security incidents and service changes under the signed agreement.",
          "Keep independent platform-administrator access separate from school-user access."
        ]
      },
      {
        heading: "3. Binding agreement",
        paragraphs: [
          "This summary does not replace the signed Data Processing Agreement. The DPA must identify the parties, instructions, duration, data categories, data subjects, subprocessors, security schedule, incident process, return/deletion rules, audit rights, cross-border position, liability allocation, and authorised signatories."
        ]
      }
    ]
  }
};

export const LEGAL_DOCUMENT_LINKS = LEGAL_DOCUMENT_SLUGS.map((slug) => ({
  href: `/legal/${slug}`,
  label: LEGAL_DOCUMENTS[slug].title
}));

export function isLegalDocumentSlug(value: string): value is LegalDocumentSlug {
  return LEGAL_DOCUMENT_SLUGS.some((slug) => slug === value);
}
