import { existsSync, readFileSync } from "node:fs";
import { VKEY, assertFile, run, snarkjsBin } from "./tooling.js";

assertFile("proof.json", "Run npm run proof:generate first.");

const proofJson = JSON.parse(readFileSync("proof.json", "utf8")) as {
  pi_a?: unknown;
  pi_b?: unknown;
  pi_c?: unknown;
  proof?: { mode?: string; proofHash?: string };
  publicSignals?: string[];
  publicInputsForContract?: string[];
  nullifier?: string;
};

if (existsSync(VKEY) && existsSync("public.json") && proofJson.pi_a && proofJson.pi_b && proofJson.pi_c) {
  if (!existsSync(snarkjsBin())) {
    console.error("Local snarkjs is missing. Run npm install.");
    process.exit(1);
  }

  run(snarkjsBin(), ["groth16", "verify", VKEY, "public.json", "proof.json"]);
  process.exit(0);
}

if (
  proofJson.proof?.mode === "demo-local" &&
  typeof proofJson.proof.proofHash === "string" &&
  proofJson.publicInputsForContract?.length === 6 &&
  proofJson.publicSignals?.length === 6 &&
  proofJson.nullifier === proofJson.publicInputsForContract[4]
) {
  console.log("Verified local demo proof bundle shape.");
  console.log("proof.json is a local demo bundle, so snarkjs verification was not run.");
  console.log("For the real proof path run: npm run circuit:build && npm run circuit:setup && npm run witness:generate && npm run proof:generate && npm run proof:verify");
  process.exit(0);
}

console.error("proof.json is neither a verifiable Groth16 proof with public.json nor a valid local demo proof bundle.");
process.exit(1);
