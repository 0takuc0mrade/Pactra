import {
  Address,
  BASE_FEE,
  Contract,
  Keypair,
  TransactionBuilder,
  nativeToScVal
} from "@stellar/stellar-sdk";
import { randomBytes } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { rpc } from "@stellar/stellar-sdk";

type PactraPublicInputs = {
  mode: string;
  generationId?: string;
  generatedAt?: string;
  publicInputsForContract: string[];
  proofBytes?: string;
};

type Deployment = {
  network: string;
  rpcUrl: string;
  passphrase: string;
  pactraContractId: string | null;
  groth16VerifierContractId: string | null;
  tokenContractId: string | null;
};

const LIVE_MANDATE_PATH = "frontend/public/demo/live-mandate.json";
const ARCHIVE_DIR = "contracts/deployments/archive";
const DEPLOYMENT_PATH = "contracts/deployments/testnet.json";
const PROOF_INPUTS_PATH = "pactra-public-inputs.json";

async function main() {
  const deployment = readDeployment();
  const proofBundle = readProofInputs();
  const ownerSecret = requireEnv("PACTRA_OWNER_SECRET");
  const ownerKeypair = Keypair.fromSecret(ownerSecret);
  const ownerPublicKey = ownerKeypair.publicKey();
  const agentPublicKey = process.env.PACTRA_AGENT_PUBLIC_KEY || ownerPublicKey;
  const vendorPublicKey = process.env.PACTRA_VENDOR_PUBLIC_KEY || ownerPublicKey;

  if (!deployment.pactraContractId || !deployment.groth16VerifierContractId || !deployment.tokenContractId) {
    throw new Error(`Missing contract IDs in ${DEPLOYMENT_PATH}. Deploy contracts and token first.`);
  }

  if (proofBundle.mode !== "groth16") {
    throw new Error(`${PROOF_INPUTS_PATH} must contain a Groth16 proof bundle. Run npm run proof:inputs after generating the real proof.`);
  }

  if (proofBundle.publicInputsForContract.length !== 6) {
    throw new Error("Expected exactly six Pactra public inputs.");
  }

  if (!proofBundle.proofBytes) {
    throw new Error(`${PROOF_INPUTS_PATH} is missing proofBytes. Run npm run proof:generate, then npm run proof:inputs.`);
  }

  const [policyCommitment, , amountInput, invoiceCommitment, nullifier, mandateIdHash] =
    proofBundle.publicInputsForContract;
  const amount = BigInt(amountInput).toString();
  const fundingAmount = process.env.PACTRA_FUNDING_AMOUNT || amount;
  const expiresAt = Number(process.env.PACTRA_EXPIRES_AT || Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30);
  const mandateId = process.env.PACTRA_MANDATE_ID || `0x${randomBytes(32).toString("hex")}`;
  const generationId = proofBundle.generationId || `seed-${new Date().toISOString().replace(/[:.]/g, "-")}`;

  const server = new rpc.Server(deployment.rpcUrl);
  const source = await server.getAccount(ownerPublicKey);
  const contract = new Contract(deployment.pactraContractId);

  console.log("Creating live Pactra mandate on Stellar testnet...");
  console.log(`Owner:  ${ownerPublicKey}`);
  console.log(`Agent:  ${agentPublicKey}`);
  console.log(`Vendor: ${vendorPublicKey}`);
  console.log(`Amount: ${amount}`);
  console.log(`Mandate ID: ${mandateId}`);
  console.log(`Generation ID: ${generationId}`);
  console.log(`Nullifier: ${nullifier}`);

  const tx = new TransactionBuilder(source, {
    fee: BASE_FEE,
    networkPassphrase: deployment.passphrase
  })
    .addOperation(
      contract.call(
        "create_mandate",
        bytesScVal(mandateId),
        new Address(ownerPublicKey).toScVal(),
        new Address(agentPublicKey).toScVal(),
        new Address(deployment.tokenContractId).toScVal(),
        bytesScVal(policyCommitment),
        nativeToScVal(BigInt(fundingAmount), { type: "i128" }),
        nativeToScVal(BigInt(expiresAt), { type: "u64" })
      )
    )
    .setTimeout(300)
    .build();

  const prepared = await server.prepareTransaction(tx);
  prepared.sign(ownerKeypair);

  const sent = await server.sendTransaction(prepared);
  if (sent.status === "ERROR") {
    throw new Error(`create_mandate was rejected: ${sent.errorResult?.toXDR("base64") || "unknown error"}`);
  }
  if (!sent.hash) {
    throw new Error("Stellar RPC did not return a transaction hash.");
  }

  const confirmed = await pollTransaction(server, sent.hash);
  archiveExistingLiveMandate();
  const liveState = {
    network: deployment.network,
    generationId,
    proofGeneratedAt: proofBundle.generatedAt,
    pactraContractId: deployment.pactraContractId,
    groth16VerifierContractId: deployment.groth16VerifierContractId,
    tokenContractId: deployment.tokenContractId,
    mandateId,
    mandateIdHash,
    ownerPublicKey,
    agentPublicKey,
    vendorPublicKey,
    fundingAmount,
    amountToPay: amount,
    expiresAt,
    policyCommitment,
    invoiceCommitment,
    nullifier,
    publicInputs: proofBundle.publicInputsForContract,
    proofBytes: proofBundle.proofBytes,
    createdTransactionHash: sent.hash,
    createdTransactionStatus: confirmed.status,
    createdAt: new Date().toISOString()
  };

  mkdirSync(dirname(LIVE_MANDATE_PATH), { recursive: true });
  writeFileSync(LIVE_MANDATE_PATH, `${JSON.stringify(liveState, null, 2)}\n`);
  console.log(`Wrote ${LIVE_MANDATE_PATH}`);
  console.log(`Mandate transaction: ${sent.hash}`);
  console.log(`Fresh nullifier: ${nullifier}`);
}

function readDeployment(): Deployment {
  return JSON.parse(readFileSync(DEPLOYMENT_PATH, "utf8")) as Deployment;
}

function readProofInputs(): PactraPublicInputs {
  try {
    return JSON.parse(readFileSync(PROOF_INPUTS_PATH, "utf8")) as PactraPublicInputs;
  } catch {
    throw new Error(`Missing ${PROOF_INPUTS_PATH}. Run npm run proof:inputs after generating the real Groth16 proof.`);
  }
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name}. Export it locally; never commit secret keys.`);
  }
  return value;
}

function archiveExistingLiveMandate(): void {
  if (!existsSync(LIVE_MANDATE_PATH)) return;

  mkdirSync(ARCHIVE_DIR, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const destination = `${ARCHIVE_DIR}/live-mandate-${timestamp}.json`;
  copyFileSync(LIVE_MANDATE_PATH, destination);
  console.log(`Archived previous live mandate to ${destination}`);
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

async function pollTransaction(server: rpc.Server, hash: string) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const result = await server.getTransaction(hash);
    if (result.status === "SUCCESS") return result;
    if (result.status === "FAILED") {
      throw new Error(`create_mandate failed: ${result.resultXdr?.toXDR("base64") || "no result XDR"}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 1200));
  }
  throw new Error("Timed out waiting for create_mandate confirmation.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
