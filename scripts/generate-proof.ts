import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { generateDemoProof, type PaymentRequest, type PrivatePolicy } from "../src/policy.js";
import { VKEY, WITNESS, ZKEY_FINAL, snarkjsBin } from "./tooling.js";

const hasGroth16Artifacts = existsSync(WITNESS) && existsSync(ZKEY_FINAL);

if (hasGroth16Artifacts) {
  const result = spawnSync(
    snarkjsBin(),
    ["groth16", "prove", ZKEY_FINAL, WITNESS, "proof.json", "public.json"],
    { stdio: "inherit" }
  );

  if (result.status === 0 && existsSync(VKEY)) {
    console.log("Generated Groth16 proof.json and public.json from circuit artifacts.");
  }

  process.exit(result.status ?? 1);
}

const policyPath = process.argv[2] || "policy.private.json";

if (!existsSync(policyPath)) {
  throw new Error(`Missing ${policyPath}. Run npm run policy:demo first.`);
}

const policy = JSON.parse(readFileSync(policyPath, "utf8")) as PrivatePolicy;
const payment: PaymentRequest = {
  mandateId: policy.mandateId,
  vendorAddress: policy.vendorAddresses[0],
  amount: policy.maxPayment,
  invoiceSecret: policy.invoiceSecret
};

const bundle = generateDemoProof(policy, payment);
writeFileSync("proof.json", `${JSON.stringify(bundle, null, 2)}\n`);

console.log("Wrote proof.json");
console.log("This is a local demo proof bundle because Groth16 artifacts were not found.");
console.log("For the final proof path run: npm run circuit:build && npm run circuit:setup && npm run witness:generate && npm run proof:generate");
console.log(`Nullifier: ${bundle.nullifier}`);
