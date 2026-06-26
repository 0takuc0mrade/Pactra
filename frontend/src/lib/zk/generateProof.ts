import { groth16 } from "snarkjs";
import { fieldHex } from "./formatForContract";
import type { BrowserProofResult, PrivateWitnessInput } from "./types";

const WASM_URL = "/zk/mandate.wasm";
const ZKEY_URL = "/zk/mandate_final.zkey";

export async function assertBrowserArtifacts(): Promise<void> {
  const missing: string[] = [];

  await Promise.all([
    assertArtifact(WASM_URL, missing),
    assertArtifact(ZKEY_URL, missing)
  ]);

  if (missing.length > 0) {
    throw new Error(
      [
        `Missing browser proving artifact${missing.length === 1 ? "" : "s"}: ${missing.join(", ")}`,
        "Run `npm run zk:export` after generating circuit artifacts:",
        "`npm run circuit:build && npm run circuit:setup && npm run circuit:input && npm run witness:generate && npm run proof:generate && npm run proof:verify`"
      ].join(" ")
    );
  }
}

export async function generateProof(input: PrivateWitnessInput): Promise<BrowserProofResult> {
  const started = performance.now();
  const { proof, publicSignals } = await groth16.fullProve(input, WASM_URL, ZKEY_URL);
  const generationMs = Math.round(performance.now() - started);

  return {
    proof,
    publicSignals,
    generationMs,
    summary: {
      circuit: "mandate.circom",
      proofSystem: "Groth16",
      curve: "BN254",
      publicInputCount: publicSignals.length,
      invoiceCommitment: publicSignals[3] ? fieldHex(publicSignals[3]) : "missing",
      nullifier: publicSignals[4] ? fieldHex(publicSignals[4]) : "missing",
      generationMs
    }
  };
}

async function assertArtifact(url: string, missing: string[]): Promise<void> {
  try {
    const response = await fetch(url, { method: "HEAD" });
    if (!response.ok) missing.push(url);
  } catch {
    missing.push(url);
  }
}
