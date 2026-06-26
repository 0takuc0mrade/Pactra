import { existsSync, readFileSync, writeFileSync } from "node:fs";

type ExportedInputs = {
  mode: "groth16" | "demo-local";
  generationId: string;
  generatedAt: string;
  order: string[];
  publicInputsForContract: string[];
  proofBytes?: string;
};

type InputMetadata = {
  generationId?: string;
  generatedAt?: string;
};

const order = [
  "policy_commitment",
  "vendor_hash",
  "amount",
  "invoice_commitment",
  "nullifier",
  "mandate_id_hash"
];

let output: ExportedInputs;
const metadata = readInputMetadata();

if (existsSync("public.json")) {
  const publicSignals = JSON.parse(readFileSync("public.json", "utf8")) as string[];
  const proofJson = existsSync("proof.json") ? JSON.parse(readFileSync("proof.json", "utf8")) as SnarkProof : undefined;
  output = {
    mode: "groth16",
    generationId: metadata.generationId,
    generatedAt: metadata.generatedAt,
    order,
    publicInputsForContract: publicSignals.map(fieldHex),
    proofBytes: proofJson ? packProof(proofJson) : undefined
  };
} else {
  const proofBundle = JSON.parse(readFileSync("proof.json", "utf8")) as {
    publicInputsForContract?: string[];
  };
  if (!proofBundle.publicInputsForContract) {
    throw new Error("proof.json does not contain publicInputsForContract. Run npm run proof:generate first.");
  }

  output = {
    mode: "demo-local",
    generationId: metadata.generationId,
    generatedAt: metadata.generatedAt,
    order,
    publicInputsForContract: proofBundle.publicInputsForContract
  };
}

writeFileSync("pactra-public-inputs.json", `${JSON.stringify(output, null, 2)}\n`);
console.log("Wrote pactra-public-inputs.json");
console.log(`Generation ID: ${output.generationId}`);

type SnarkG1 = [string, string, string];
type SnarkG2 = [[string, string], [string, string], [string, string]];
type SnarkProof = {
  pi_a: SnarkG1;
  pi_b: SnarkG2;
  pi_c: SnarkG1;
};

function packProof(proof: SnarkProof): string {
  return `0x${[
    fieldHex(proof.pi_a[0]),
    fieldHex(proof.pi_a[1]),
    g2Hex(proof.pi_b),
    fieldHex(proof.pi_c[0]),
    fieldHex(proof.pi_c[1])
  ].map((value) => value.slice(2)).join("")}`;
}

function g2Hex(point: SnarkG2): string {
  const [x, y] = point;
  return `0x${[
    fieldHex(x[1]),
    fieldHex(x[0]),
    fieldHex(y[1]),
    fieldHex(y[0])
  ].map((value) => value.slice(2)).join("")}`;
}

function fieldHex(value: string): string {
  return `0x${BigInt(value).toString(16).padStart(64, "0")}`;
}

function readInputMetadata(): Required<InputMetadata> {
  if (!existsSync("circuits/input.metadata.json")) {
    return {
      generationId: `unknown-${new Date().toISOString().replace(/[:.]/g, "-")}`,
      generatedAt: new Date().toISOString()
    };
  }

  const metadata = JSON.parse(readFileSync("circuits/input.metadata.json", "utf8")) as InputMetadata;
  return {
    generationId: metadata.generationId || `unknown-${new Date().toISOString().replace(/[:.]/g, "-")}`,
    generatedAt: metadata.generatedAt || new Date().toISOString()
  };
}
