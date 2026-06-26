export type LiveMandate = {
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
  expiresAt: number;
  policyCommitment: string;
  invoiceCommitment: string;
  nullifier: string;
  publicInputs: string[];
  proofBytes?: string;
  createdTransactionHash: string;
  createdTransactionStatus: string;
  createdAt: string;
};

export async function loadLiveMandate(): Promise<LiveMandate | null> {
  try {
    const response = await fetch("/demo/live-mandate.json", { cache: "no-store" });
    if (!response.ok) return null;
    return (await response.json()) as LiveMandate;
  } catch {
    return null;
  }
}

export function validateLiveMandateProof(mandate: LiveMandate | null, publicInputs?: string[], amount?: string): string | null {
  if (!mandate) return "Run `npm run seed:live-mandate` first.";
  if (!publicInputs) return "Generate and format a Groth16 proof first.";
  if (publicInputs.length !== 6) return `Expected six public inputs, got ${publicInputs.length}.`;
  if (amount && amount !== mandate.amountToPay) return "Requested amount does not match the live seeded mandate.";
  if (publicInputs[0] !== mandate.policyCommitment) return "Policy commitment does not match the live seeded mandate.";
  if (publicInputs[2] !== mandate.publicInputs[2]) return "Amount public input does not match the live seeded mandate.";
  if (publicInputs[3] !== mandate.invoiceCommitment) return "Invoice commitment does not match the live seeded mandate.";
  if (publicInputs[4] !== mandate.nullifier) return "Nullifier does not match the live seeded mandate.";
  if (publicInputs[5] !== mandate.mandateIdHash) return "Mandate ID hash does not match the live seeded mandate.";
  return null;
}
