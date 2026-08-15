import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const requestPacket = readFileSync(
  join(process.cwd(), "docs", "schoolcast-production-approval-requests.md"),
  "utf8"
);
const acknowledgement = JSON.parse(
  readFileSync(
    join(
      process.cwd(),
      "docs",
      "evidence",
      "schoolcast-production-approval-acknowledgement-2026-08-15.json"
    ),
    "utf8"
  )
) as {
  acknowledgementId: string;
  formalApprovalsComplete: boolean;
  recoveryGate: string;
  productionActions: Record<string, boolean>;
  authorizationRequests: Array<{
    requestId: string;
    scope: string;
    status: string;
  }>;
};

const deploymentAuthorization = JSON.parse(
  readFileSync(
    join(
      process.cwd(),
      "docs",
      "evidence",
      "schoolcast-disabled-scope-deployment-authorization-2026-08-15.json"
    ),
    "utf8"
  )
) as {
  requestId: string;
  status: string;
  prohibitedActions: string[];
  technicalPreflight: {
    productionMigrationPresent: boolean;
    productionDeploymentSafeBeforeMigration: boolean;
  };
};
describe("SchoolCast production authorization separation", () => {
  it("records acknowledgement without recording production activity", () => {
    expect(acknowledgement.acknowledgementId).toBe("SC-ACK-20260815-01");
    expect(acknowledgement.formalApprovalsComplete).toBe(false);
    expect(acknowledgement.recoveryGate).toBe("BLOCKED");
    expect(Object.keys(acknowledgement.productionActions)).toHaveLength(8);
    expect(
      Object.values(acknowledgement.productionActions).every(
        (performed) => performed === false
      )
    ).toBe(true);
    expect(acknowledgement.authorizationRequests).toEqual([
      {
        requestId: "SC-AUTH-MIG-20260815",
        scope: "ADDITIVE_DATABASE_MIGRATION_AND_VALIDATION_ONLY",
        status: "PREPARED_NOT_AUTHORIZED"
      },
      {
        requestId: "SC-AUTH-DEPLOY-20260815",
        scope: "COMMIT_PUSH_AND_DISABLED_SCOPE_DEPLOYMENT_ONLY",
        status: "PREPARED_NOT_AUTHORIZED"
      }
    ]);
  });

  it("keeps all formal approvals pending until named signatories respond", () => {
    expect(requestPacket).toContain("SC-APR-OPS-20260815");
    expect(requestPacket).toContain("SC-APR-ENG-20260815");
    expect(requestPacket).toContain("SC-APR-SEC-20260815");
    expect(requestPacket).toContain("SC-APR-PROD-20260815");
    expect(requestPacket).toContain(
      "Development work, QA results, repository changes, or this request packet do not constitute any of the four approvals."
    );
  });

  it("limits migration authorization to the database migration and validation", () => {
    expect(requestPacket).toContain("SC-AUTH-MIG-20260815");
    expect(requestPacket).toContain(
      "It explicitly excludes:\n\n- Preparing or pushing a source commit.\n- Deploying application code."
    );
  });

  it("keeps disabled-scope deployment separate from migration and activation", () => {
    expect(requestPacket).toContain("SC-AUTH-DEPLOY-20260815");
    expect(requestPacket).toContain("SCHOOLCAST_RELEASE_SCOPE=DISABLED");
    expect(requestPacket).toContain("SCHOOLCAST_WORKER_ENABLED=false");
    expect(requestPacket).toContain("- Database migration authority.");
    expect(requestPacket).toContain(
      "- Changing SchoolCast to `IN_APP_CORE` or `FULL`."
    );
  });
  it("records restricted deployment authorization without granting migration authority", () => {
    expect(deploymentAuthorization.requestId).toBe("SC-AUTH-DEPLOY-20260815");
    expect(deploymentAuthorization.status).toBe(
      "AUTHORIZED_EXECUTION_BLOCKED_BY_SEPARATE_MIGRATION_GATE"
    );
    expect(deploymentAuthorization.technicalPreflight).toMatchObject({
      productionMigrationPresent: false,
      productionDeploymentSafeBeforeMigration: false
    });
    expect(deploymentAuthorization.prohibitedActions).toContain(
      "production_database_migration_without_separate_authorization"
    );
    expect(deploymentAuthorization.prohibitedActions).toContain(
      "schoolcast_feature_flag_enablement"
    );
  });
});
