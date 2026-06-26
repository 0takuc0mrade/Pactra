import { writeFileSync } from "node:fs";
import { createOneInvoicePolicy, demoDefaults } from "../src/policy.js";

const policy = createOneInvoicePolicy(demoDefaults);
writeFileSync("policy.private.json", `${JSON.stringify(policy, null, 2)}\n`);

console.log("Wrote policy.private.json for one-off invoice CLOUD-042");
console.log(`Mandate ID: ${policy.mandateId}`);
console.log(`Policy commitment: ${policy.policyCommitment}`);
