import { getLegalReadinessIssues, resolveLegalPublicationConfig } from "../src/config/legal";

const config = resolveLegalPublicationConfig(process.env);
const issues = getLegalReadinessIssues(config);

if (issues.length > 0) {
  console.error("JinaCampus legal publication gate: BLOCKED");
  for (const issue of issues) console.error(`- ${issue}`);
  console.error("Qualified Indian counsel and authorised signatories must approve the final documents before setting EFFECTIVE.");
  process.exitCode = 1;
} else {
  console.log(`JinaCampus legal publication gate: READY (${config.version}, effective ${config.effectiveDate})`);
}
