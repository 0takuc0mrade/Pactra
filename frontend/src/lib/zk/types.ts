export type SnarkG1 = [string, string, string];
export type SnarkG2 = [[string, string], [string, string], [string, string]];

export type SnarkProof = {
  pi_a: SnarkG1;
  pi_b: SnarkG2;
  pi_c: SnarkG1;
  protocol?: string;
  curve?: string;
};

export type PrivateWitnessInput = {
  policy_commitment: string;
  vendor_hash: string;
  amount: string;
  invoice_commitment: string;
  nullifier: string;
  mandate_id_hash: string;
  max_payment: string;
  vendor_root: string;
  path_elements: string[];
  path_indices: string[];
  policy_salt: string;
  invoice_secret: string;
  policy_nonce: string;
};

export type ExpectedContractInputs = {
  amount: string;
  invoiceCommitment: string;
  mandateIdHash: string;
};

export type ContractProofBundle = {
  proofBytes: Uint8Array;
  proofHex: string;
  publicInputsForContract: string[];
  summary: SafeProofSummary;
};

export type SafeProofSummary = {
  circuit: "mandate.circom";
  proofSystem: "Groth16";
  curve: "BN254";
  publicInputCount: number;
  proofByteLength: number;
  invoiceCommitment: string;
  nullifier: string;
  generationMs?: number;
};

export type BrowserProofResult = {
  proof: SnarkProof;
  publicSignals: string[];
  generationMs: number;
  summary: Omit<SafeProofSummary, "proofByteLength">;
};
