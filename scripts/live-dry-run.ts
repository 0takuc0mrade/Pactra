import {
  BASE_FEE,
  Contract,
  rpc,
  TransactionBuilder,
  nativeToScVal,
  scValToNative
} from "@stellar/stellar-sdk";
import { existsSync, readFileSync } from "node:fs";

type LiveMandate = {
  generationId?: string;
  pactraContractId: string;
  groth16VerifierContractId: string;
  tokenContractId: string;
  mandateId: string;
  ownerPublicKey: string;
  fundingAmount: string;
  amountToPay: string;
  policyCommitment: string;
  invoiceCommitment: string;
  nullifier: string;
  mandateIdHash: string;
  publicInputs: string[];
  proofBytes?: string;
};

type PactraPublicInputs = {
  mode: string;
  generationId?: string;
  publicInputsForContract: string[];
  proofBytes?: string;
};

const ENV_PATH = "frontend/.env.local";
const LIVE_MANDATE_PATH = "frontend/public/demo/live-mandate.json";
const PROOF_INPUTS_PATH = "pactra-public-inputs.json";

let failed = false;

async function main() {
  console.log("Pactra live flow dry-run\n");

  const env = loadEnv();
  const rpcUrl = readConfig(env, "VITE_STELLAR_RPC_URL") || "https://soroban-testnet.stellar.org";
  const passphrase = readConfig(env, "VITE_STELLAR_PASSPHRASE") || "Test SDF Network ; September 2015";
  const pactraContractId = readConfig(env, "VITE_PACTRA_CONTRACT_ID");
  const verifierContractId = readConfig(env, "VITE_GROTH16_VERIFIER_CONTRACT_ID");
  const tokenContractId = readConfig(env, "VITE_TOKEN_CONTRACT_ID");

  check(Boolean(pactraContractId), "Pactra contract ID configured", "Set VITE_PACTRA_CONTRACT_ID.");
  check(Boolean(verifierContractId), "Groth16 verifier contract ID configured", "Set VITE_GROTH16_VERIFIER_CONTRACT_ID.");
  check(Boolean(tokenContractId), "Token contract ID configured", "Set VITE_TOKEN_CONTRACT_ID.");

  const mandate = existsSync(LIVE_MANDATE_PATH) ? readJson<LiveMandate>(LIVE_MANDATE_PATH) : null;
  check(Boolean(mandate), "live-mandate.json parses", "Run npm run seed:live-mandate.");

  const proofBundle = existsSync(PROOF_INPUTS_PATH) ? readJson<PactraPublicInputs>(PROOF_INPUTS_PATH) : null;
  check(Boolean(proofBundle), "pactra-public-inputs.json parses", "Run npm run proof:inputs.");

  if (mandate && proofBundle) {
    checkProofMatch(mandate, proofBundle);
    check(mandate.pactraContractId === pactraContractId, "Mandate Pactra ID matches env", "Reseed or update frontend/.env.local.");
    check(mandate.groth16VerifierContractId === verifierContractId, "Mandate verifier ID matches env", "Reseed or update frontend/.env.local.");
    check(mandate.tokenContractId === tokenContractId, "Mandate token ID matches env", "Reseed or update frontend/.env.local.");
  }

  try {
    const server = new rpc.Server(rpcUrl);
    const network = await server.getNetwork();
    check(network.passphrase === passphrase, "RPC reachable and passphrase matches", `Expected ${passphrase}, got ${network.passphrase}.`);

    const ledger = await server.getLatestLedger();
    check(Boolean(ledger.sequence), `Latest ledger reachable (${ledger.sequence})`, "Check the RPC URL.");

    if (mandate && pactraContractId) {
      await dryRunGetMandate(server, {
        passphrase,
        pactraContractId,
        sourcePublicKey: mandate.ownerPublicKey,
        mandateId: mandate.mandateId,
        expectedFundingAmount: mandate.fundingAmount
      });
    }
  } catch (error) {
    failed = true;
    console.log("FAIL RPC dry-run");
    console.log(`     ${error instanceof Error ? error.message : "Unknown RPC error."}`);
  }

  console.log(failed ? "\nDry-run found blockers. No transaction was submitted." : "\nDry-run passed. No transaction was submitted.");
  if (failed) process.exit(1);
}

async function dryRunGetMandate(
  server: rpc.Server,
  args: {
    passphrase: string;
    pactraContractId: string;
    sourcePublicKey: string;
    mandateId: string;
    expectedFundingAmount: string;
  }
): Promise<void> {
  const source = await server.getAccount(args.sourcePublicKey);
  const contract = new Contract(args.pactraContractId);
  const tx = new TransactionBuilder(source, {
    fee: BASE_FEE,
    networkPassphrase: args.passphrase
  })
    .addOperation(contract.call("get_mandate", bytesScVal(args.mandateId)))
    .setTimeout(60)
    .build();

  const simulation = await server.simulateTransaction(tx);
  if ("error" in simulation) {
    check(false, "Pactra get_mandate simulation succeeds", explainContractSimulationError(simulation.error));
    return;
  }

  check(true, "Pactra get_mandate simulation succeeds", "The seeded mandate was not found.");

  const native = simulation.result?.retval ? scValToNative(simulation.result.retval) : null;
  const remainingAmount = readNativeField(native, "remaining_amount");
  const status = readNativeField(native, "status");

  if (remainingAmount) {
    check(
      BigInt(remainingAmount) >= BigInt(args.expectedFundingAmount),
      `Mandate remaining amount is ${remainingAmount}`,
      "The mandate may already be spent or underfunded. Reseed a fresh mandate."
    );
  } else {
    console.log("SKIP Mandate funding read");
    console.log("     get_mandate simulated, but the SDK did not expose remaining_amount in a parsed shape.");
  }

  if (status) {
    check(status === "Active", `Mandate status is ${status}`, "Reseed a fresh active mandate.");
  } else {
    console.log("SKIP Mandate status read");
    console.log("     get_mandate simulated, but the SDK did not expose status in a parsed shape.");
  }
}

function checkProofMatch(mandate: LiveMandate, proofBundle: PactraPublicInputs): void {
  const inputs = proofBundle.publicInputsForContract;
  check(proofBundle.mode === "groth16", "Proof bundle is Groth16 mode", "Run the real proof path, then npm run proof:inputs.");
  if (mandate.generationId && proofBundle.generationId && mandate.generationId !== proofBundle.generationId) {
    console.log(`WARN Generation IDs differ: live mandate ${mandate.generationId}, proof bundle ${proofBundle.generationId}.`);
  }
  check(Array.isArray(inputs) && inputs.length === 6, "Proof bundle has six public inputs", "Regenerate with npm run proof:inputs.");
  check(equalArrays(mandate.publicInputs, inputs), "Proof public inputs match live mandate", "Run npm run seed:live-mandate with the current proof bundle.");
  check(mandate.proofBytes === proofBundle.proofBytes, "Proof bytes match live mandate", "Run npm run seed:live-mandate with the current proof bundle.");
  if (inputs.length === 6) {
    check(inputs[0] === mandate.policyCommitment, "Policy commitment matches", "Regenerate and reseed.");
    check(inputs[2] === toThirtyTwoByteHex(mandate.amountToPay), "Amount matches", "Regenerate and reseed.");
    check(inputs[3] === mandate.invoiceCommitment, "Invoice commitment matches", "Regenerate and reseed.");
    check(inputs[4] === mandate.nullifier, "Nullifier matches", "Regenerate and reseed.");
    check(inputs[5] === mandate.mandateIdHash, "Mandate ID hash matches", "Regenerate and reseed.");
  }
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

function loadEnv(): Record<string, string> {
  const values: Record<string, string> = {};
  if (!existsSync(ENV_PATH)) return values;

  for (const line of readFileSync(ENV_PATH, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator === -1) continue;
    values[trimmed.slice(0, separator).trim()] = trimmed.slice(separator + 1).trim().replace(/^["']|["']$/g, "");
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

function bytesScVal(hex: string) {
  return nativeToScVal(hexToBytes(hex));
}

function hexToBytes(hex: string): Uint8Array {
  const normalized = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (normalized.length !== 64) {
    throw new Error(`Expected 32-byte hex value, got ${normalized.length / 2} bytes.`);
  }
  return Uint8Array.from(normalized.match(/.{2}/g)?.map((byte) => Number.parseInt(byte, 16)) ?? []);
}

function toThirtyTwoByteHex(value: string): string {
  return `0x${BigInt(value).toString(16).padStart(64, "0")}`;
}

function equalArrays(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function readNativeField(native: unknown, field: string): string | null {
  if (!native || typeof native !== "object") return null;
  const record = native as Record<string, unknown>;
  const value = record[field] ?? record[toCamelCase(field)];
  if (value === undefined || value === null) return null;
  if (typeof value === "object" && "name" in value && typeof (value as { name?: unknown }).name === "string") {
    return (value as { name: string }).name;
  }
  return String(value);
}

function toCamelCase(value: string): string {
  return value.replace(/_([a-z])/g, (_, char: string) => char.toUpperCase());
}

function explainContractSimulationError(error: string): string {
  if (error.includes("Error(Contract, #4)")) return "Mandate not found. Run npm run seed:live-mandate.";
  return `Simulation error: ${error}`;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
