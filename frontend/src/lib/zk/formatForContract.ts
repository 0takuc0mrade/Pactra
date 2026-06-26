import type { ContractProofBundle, ExpectedContractInputs, SafeProofSummary, SnarkG2, SnarkProof } from "./types";

export const PUBLIC_INPUT_ORDER = [
  "policy_commitment",
  "vendor_hash",
  "amount",
  "invoice_commitment",
  "nullifier",
  "mandate_id_hash"
] as const;

export class ProofFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProofFormatError";
  }
}

export function formatForContract(
  proof: SnarkProof | undefined,
  publicSignals: string[] | undefined,
  expected: ExpectedContractInputs,
  generationMs?: number
): ContractProofBundle {
  if (!proof) {
    throw new ProofFormatError("Missing Groth16 proof. Generate a proof before formatting for Pactra.");
  }

  if (!publicSignals) {
    throw new ProofFormatError("Missing public signals. Generate a proof before formatting for Pactra.");
  }

  if (publicSignals.length !== PUBLIC_INPUT_ORDER.length) {
    throw new ProofFormatError(`Expected 6 public inputs, received ${publicSignals.length}.`);
  }

  const publicInputsForContract = publicSignals.map(fieldHex);
  const proofHex = packProof(proof);
  const proofBytes = bytesFromHex(proofHex);

  if (proofBytes.length !== 256) {
    throw new ProofFormatError(`Expected proof encoding to be exactly 256 bytes, got ${proofBytes.length}.`);
  }

  const amountInput = fieldHex(expected.amount);
  const invoiceCommitment = fieldHex(expected.invoiceCommitment);
  const mandateIdHash = fieldHex(expected.mandateIdHash);
  const nullifier = publicInputsForContract[4];

  if (publicInputsForContract[2] !== amountInput) {
    throw new ProofFormatError("Amount public input does not match the requested payment amount.");
  }

  if (publicInputsForContract[3] !== invoiceCommitment) {
    throw new ProofFormatError("Invoice commitment public input does not match the payment request.");
  }

  if (publicInputsForContract[5] !== mandateIdHash) {
    throw new ProofFormatError("Mandate ID hash public input does not match the mandate.");
  }

  if (BigInt(nullifier) === 0n) {
    throw new ProofFormatError("Nullifier public input is missing or zero.");
  }

  return {
    proofBytes,
    proofHex,
    publicInputsForContract,
    summary: safeSummary(publicInputsForContract, proofBytes.length, generationMs)
  };
}

export function packProof(proof: SnarkProof): string {
  assertG1(proof.pi_a, "pi_a");
  assertG2(proof.pi_b, "pi_b");
  assertG1(proof.pi_c, "pi_c");

  return `0x${[
    fieldHex(proof.pi_a[0]),
    fieldHex(proof.pi_a[1]),
    g2Hex(proof.pi_b),
    fieldHex(proof.pi_c[0]),
    fieldHex(proof.pi_c[1])
  ].map((value) => value.slice(2)).join("")}`;
}

export function fieldHex(value: string | bigint | number): string {
  try {
    const bigint = typeof value === "bigint" ? value : BigInt(value);
    if (bigint < 0n) {
      throw new ProofFormatError("Field values must be non-negative.");
    }
    return `0x${bigint.toString(16).padStart(64, "0")}`;
  } catch (error) {
    if (error instanceof ProofFormatError) throw error;
    throw new ProofFormatError(`Invalid field value: ${String(value)}`);
  }
}

export function bytesFromHex(hex: string): Uint8Array {
  const normalized = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (normalized.length % 2 !== 0) {
    throw new ProofFormatError("Hex value has an odd number of characters.");
  }

  const bytes = normalized.match(/.{2}/g)?.map((byte) => Number.parseInt(byte, 16)) ?? [];
  if (bytes.some((byte) => Number.isNaN(byte))) {
    throw new ProofFormatError("Hex value contains non-hex characters.");
  }

  return Uint8Array.from(bytes);
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

function safeSummary(publicInputsForContract: string[], proofByteLength: number, generationMs?: number): SafeProofSummary {
  return {
    circuit: "mandate.circom",
    proofSystem: "Groth16",
    curve: "BN254",
    publicInputCount: publicInputsForContract.length,
    proofByteLength,
    invoiceCommitment: publicInputsForContract[3],
    nullifier: publicInputsForContract[4],
    generationMs
  };
}

function assertG1(point: unknown, label: string): asserts point is [string, string, string] {
  if (!Array.isArray(point) || point.length < 2) {
    throw new ProofFormatError(`Missing ${label} G1 point in proof.`);
  }
}

function assertG2(point: unknown, label: string): asserts point is SnarkG2 {
  if (!Array.isArray(point) || point.length < 2 || !Array.isArray(point[0]) || !Array.isArray(point[1])) {
    throw new ProofFormatError(`Missing ${label} G2 point in proof.`);
  }
}
