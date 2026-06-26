import { existsSync, readFileSync, statSync } from "node:fs";

type PactraPublicInputs = {
  mode: string;
  generationId?: string;
  generatedAt?: string;
  publicInputsForContract: string[];
  proofBytes?: string;
};

type LiveMandate = {
  network: string;
  generationId?: string;
  proofGeneratedAt?: string;
  pactraContractId: string;
  groth16VerifierContractId: string;
  tokenContractId: string;
  mandateId: string;
  mandateIdHash: string;
  ownerPublicKey: string;
  agentPublicKey: string;
  vendorPublicKey: string;
  fundingAmount: string;
  amountToPay: string;
  policyCommitment: string;
  invoiceCommitment: string;
  nullifier: string;
  publicInputs: string[];
  proofBytes?: string;
  createdTransactionHash: string;
};

const ENV_PATH = "frontend/.env.local";
const LIVE_MANDATE_PATH = "frontend/public/demo/live-mandate.json";
const PROOF_INPUTS_PATH = "pactra-public-inputs.json";
const ZK_ARTIFACTS = [
  "frontend/public/zk/mandate.wasm",
  "frontend/public/zk/mandate_final.zkey",
  "frontend/public/zk/verification_key.json"
];

const REQUIRED_ENV = [
  "VITE_STELLAR_RPC_URL",
  "VITE_STELLAR_PASSPHRASE",
  "VITE_PACTRA_CONTRACT_ID",
  "VITE_GROTH16_VERIFIER_CONTRACT_ID",
  "VITE_TOKEN_CONTRACT_ID"
];

const REQUIRED_LIVE_FIELDS = [
  "network",
  "generationId",
  "pactraContractId",
  "groth16VerifierContractId",
  "tokenContractId",
  "mandateId",
  "mandateIdHash",
  "ownerPublicKey",
  "agentPublicKey",
  "vendorPublicKey",
  "fundingAmount",
  "amountToPay",
  "policyCommitment",
  "invoiceCommitment",
  "nullifier",
  "publicInputs",
  "proofBytes",
  "createdTransactionHash"
];

let failed = false;

function main() {
  console.log("Pactra live flow checklist\n");

  const env = loadEnv();
  check(
    existsSync(ENV_PATH) || REQUIRED_ENV.every((key) => Boolean(process.env[key])),
    `${ENV_PATH} exists or required VITE env vars are present`,
    `Create ${ENV_PATH} from frontend/.env.example or export the VITE_... values.`
  );

  for (const key of REQUIRED_ENV) {
    check(Boolean(readConfig(env, key)), `${key} configured`, `Set ${key} in ${ENV_PATH}.`);
  }

  let liveMandate: LiveMandate | null = null;
  if (check(existsSync(LIVE_MANDATE_PATH), `${LIVE_MANDATE_PATH} exists`, "Run npm run seed:live-mandate.")) {
    liveMandate = readJson<LiveMandate>(LIVE_MANDATE_PATH);
    checkLiveMandateShape(liveMandate);
    checkLiveMandateMatchesEnv(liveMandate, env);
  }

  for (const artifact of ZK_ARTIFACTS) {
    check(fileHasBytes(artifact), `${artifact} exists`, "Run npm run zk:export.");
  }

  let proofBundle: PactraPublicInputs | null = null;
  if (check(existsSync(PROOF_INPUTS_PATH), `${PROOF_INPUTS_PATH} exists`, "Run npm run proof:inputs.")) {
    proofBundle = readJson<PactraPublicInputs>(PROOF_INPUTS_PATH);
    check(proofBundle.mode === "groth16", "Proof bundle is Groth16 mode", "Run the real proof path, then npm run proof:inputs.");
    check(
      Array.isArray(proofBundle.publicInputsForContract) && proofBundle.publicInputsForContract.length === 6,
      "Proof bundle has six public inputs",
      "Regenerate with npm run proof:inputs."
    );
    check(
      Boolean(proofBundle.proofBytes) && hexByteLength(proofBundle.proofBytes || "0x") === 256,
      "Proof bundle has a 256-byte proof",
      "Regenerate the proof with npm run proof:generate, then npm run proof:inputs."
    );
  }

  if (liveMandate && proofBundle) {
    checkMandateMatchesProof(liveMandate, proofBundle);
  }

  console.log(failed ? "\nLive flow is not ready yet." : "\nLive flow checklist passed.");
  if (failed) {
    console.log("Next useful command: npm run live:reset, then npm run live:check again.");
    process.exit(1);
  }
}

function checkLiveMandateShape(mandate: LiveMandate): void {
  for (const field of REQUIRED_LIVE_FIELDS) {
    check(
      Object.prototype.hasOwnProperty.call(mandate, field),
      `live-mandate.json includes ${field}`,
      "Regenerate it with npm run live:reset."
    );
  }

  check(Array.isArray(mandate.publicInputs) && mandate.publicInputs.length === 6, "Live mandate has six public inputs", "Regenerate it with npm run live:reset.");
  check(Boolean(mandate.generationId), "Live mandate has a generation ID", "Regenerate it with npm run live:reset.");
  check(Boolean(mandate.proofBytes) && hexByteLength(mandate.proofBytes || "0x") === 256, "Live mandate includes a public 256-byte proof", "Run npm run live:reset.");
  check(hexByteLength(mandate.mandateId) === 32, "Mandate ID is 32 bytes", "Regenerate it with npm run live:reset.");
  check(hexByteLength(mandate.policyCommitment) === 32, "Policy commitment is 32 bytes", "Regenerate proof inputs and seed again.");
  check(hexByteLength(mandate.invoiceCommitment) === 32, "Invoice commitment is 32 bytes", "Regenerate proof inputs and seed again.");
  check(hexByteLength(mandate.nullifier) === 32, "Nullifier is 32 bytes", "Regenerate proof inputs and seed again.");
}

function checkLiveMandateMatchesEnv(mandate: LiveMandate, env: Record<string, string>): void {
  check(
    mandate.pactraContractId === readConfig(env, "VITE_PACTRA_CONTRACT_ID"),
    "Live mandate Pactra ID matches frontend env",
    "Update frontend/.env.local or rerun npm run seed:live-mandate after deployment metadata changes."
  );
  check(
    mandate.groth16VerifierContractId === readConfig(env, "VITE_GROTH16_VERIFIER_CONTRACT_ID"),
    "Live mandate verifier ID matches frontend env",
    "Update frontend/.env.local or rerun npm run seed:live-mandate."
  );
  check(
    mandate.tokenContractId === readConfig(env, "VITE_TOKEN_CONTRACT_ID"),
    "Live mandate token ID matches frontend env",
    "Update frontend/.env.local or rerun npm run seed:live-mandate."
  );
}

function checkMandateMatchesProof(mandate: LiveMandate, proofBundle: PactraPublicInputs): void {
  const inputs = proofBundle.publicInputsForContract;
  if (mandate.generationId && proofBundle.generationId) {
    warn(
      mandate.generationId === proofBundle.generationId,
      `Generation IDs differ: live mandate ${mandate.generationId}, proof bundle ${proofBundle.generationId}. Run npm run seed:live-mandate or npm run live:reset.`
    );
  }
  check(equalArrays(mandate.publicInputs, inputs), "Proof public inputs match live mandate", "Run npm run live:reset.");
  check(mandate.proofBytes === proofBundle.proofBytes, "Live mandate proof bytes match proof bundle", "Run npm run live:reset.");
  check(inputs[0] === mandate.policyCommitment, "Policy commitment matches live mandate", "Regenerate and reseed.");
  check(inputs[2] === toThirtyTwoByteHex(mandate.amountToPay), "Amount input matches amountToPay", "Regenerate and reseed.");
  check(inputs[3] === mandate.invoiceCommitment, "Invoice commitment matches live mandate", "Regenerate and reseed.");
  check(inputs[4] === mandate.nullifier, "Nullifier matches live mandate", "Regenerate and reseed.");
  check(inputs[5] === mandate.mandateIdHash, "Mandate ID hash matches live mandate", "Regenerate and reseed.");
}

function check(condition: boolean, passMessage: string, failMessage: string): boolean {
  if (condition) {
    console.log(`PASS ${passMessage}`);
    return true;
  }
  failed = true;
  console.log(`FAIL ${passMessage}`);
  console.log(`     ${failMessage}`);
  return false;
}

function warn(condition: boolean, message: string): void {
  if (condition) return;
  console.log(`WARN ${message}`);
}

function loadEnv(): Record<string, string> {
  const values: Record<string, string> = {};
  if (!existsSync(ENV_PATH)) return values;

  for (const line of readFileSync(ENV_PATH, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator === -1) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^["']|["']$/g, "");
    values[key] = value;
  }

  return values;
}

function readConfig(env: Record<string, string>, key: string): string {
  return process.env[key] || env[key] || "";
}

function readJson<T>(path: string): T {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch (error) {
    throw new Error(`Could not parse ${path}: ${error instanceof Error ? error.message : "invalid JSON"}`);
  }
}

function fileHasBytes(path: string): boolean {
  return existsSync(path) && statSync(path).size > 0;
}

function hexByteLength(hex: string): number {
  const normalized = hex.startsWith("0x") ? hex.slice(2) : hex;
  return normalized.length / 2;
}

function toThirtyTwoByteHex(value: string): string {
  return `0x${BigInt(value).toString(16).padStart(64, "0")}`;
}

function equalArrays(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

main();
