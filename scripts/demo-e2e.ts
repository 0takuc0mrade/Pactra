import { writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createOneInvoicePolicy, demoDefaults, generateDemoProof } from "../src/policy.js";

function run(command: string, args: string[]) {
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

console.log("Pactra one-off invoice demo");
console.log("1. Generated private mandate policy");
const policy = createOneInvoicePolicy(demoDefaults);
writeFileSync("policy.private.json", `${JSON.stringify(policy, null, 2)}\n`);

console.log("2. Created mandate commitment");
console.log(`   mandate_id: ${policy.mandateId}`);
console.log(`   policy_commitment: ${policy.policyCommitment}`);

console.log("3. Generated proof");
const proof = generateDemoProof(policy, {
  mandateId: policy.mandateId,
  vendorAddress: policy.vendorAddresses[0],
  amount: policy.maxPayment,
  invoiceSecret: policy.invoiceSecret
});
writeFileSync("proof.json", `${JSON.stringify(proof, null, 2)}\n`);

console.log("4. Verified proof");
run("npm", ["run", "proof:verify"]);

console.log("5. Simulated Stellar payment release through Pactra contract test");
run("cargo", ["test", "-p", "pactra-contract", "valid_proof_releases_payment_and_records_nullifier", "--quiet"]);

console.log("6. Receipt emitted");
console.log("Demo complete: private invoice mandate -> proof -> verifier boundary -> payment release -> receipt.");
