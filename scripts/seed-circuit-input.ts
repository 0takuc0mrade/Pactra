import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import { buildPoseidon } from "circomlibjs";

const outputPath = process.argv[2] || "circuits/input.example.json";
const metadataPath = "circuits/input.metadata.json";
const MERKLE_DEPTH = 8;
const deterministic = process.argv.includes("--deterministic") || process.env.PACTRA_DETERMINISTIC_INPUT === "1";

const poseidon = await buildPoseidon();
const F = poseidon.F;

function hash(inputs: bigint[]): string {
  return F.toString(poseidon(inputs));
}

const vendorHash = 456n;
const amount = 750_000_000n;
const maxPayment = 750_000_000n;
const invoiceSecret = freshField(222n);
const policySalt = freshField(111n);
const policyNonce = freshField(333n);
const mandateIdHash = freshField(654n);
const pathElements = [101n, 202n, 303n, 404n, 505n, 606n, 707n, 808n];
const pathIndices = [0n, 1n, 0n, 1n, 0n, 1n, 0n, 1n];

const invoiceCommitment = BigInt(hash([invoiceSecret, vendorHash, amount]));

let levelHash = vendorHash;
for (let i = 0; i < MERKLE_DEPTH; i += 1) {
  const sibling = pathElements[i];
  const left = pathIndices[i] === 1n ? sibling : levelHash;
  const right = pathIndices[i] === 1n ? levelHash : sibling;
  levelHash = BigInt(hash([left, right]));
}

const vendorRoot = levelHash;
const policyCommitment = hash([maxPayment, vendorRoot, invoiceCommitment, policySalt, mandateIdHash]);
const nullifier = hash([policyNonce, invoiceCommitment, mandateIdHash]);

const input = {
  policy_commitment: policyCommitment,
  vendor_hash: vendorHash.toString(),
  amount: amount.toString(),
  invoice_commitment: invoiceCommitment.toString(),
  nullifier,
  mandate_id_hash: mandateIdHash.toString(),
  max_payment: maxPayment.toString(),
  vendor_root: vendorRoot.toString(),
  path_elements: pathElements.map((value) => value.toString()),
  path_indices: pathIndices.map((value) => value.toString()),
  policy_salt: policySalt.toString(),
  invoice_secret: invoiceSecret.toString(),
  policy_nonce: policyNonce.toString()
};

const metadata = {
  generationId: deterministic ? "deterministic-demo-input" : `live-${new Date().toISOString().replace(/[:.]/g, "-")}-${randomBytes(4).toString("hex")}`,
  generatedAt: new Date().toISOString(),
  deterministic,
  outputPath,
  public: {
    policy_commitment: policyCommitment,
    vendor_hash: vendorHash.toString(),
    amount: amount.toString(),
    invoice_commitment: invoiceCommitment.toString(),
    nullifier,
    mandate_id_hash: mandateIdHash.toString()
  }
};

writeFileSync(outputPath, `${JSON.stringify(input, null, 2)}\n`);
writeFileSync(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);
console.log(`Wrote valid one-off invoice circuit input to ${outputPath}`);
console.log(`Wrote circuit input metadata to ${metadataPath}`);
console.log(`Generation ID: ${metadata.generationId}`);
console.log(`Nullifier: ${nullifier}`);

function freshField(fallback: bigint): bigint {
  if (deterministic) return fallback;
  return BigInt(`0x${randomBytes(16).toString("hex")}`);
}
