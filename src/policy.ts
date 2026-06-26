export type DemoPolicyInput = {
  owner: string;
  agent: string;
  token: string;
  vendorAddress: string;
  maxPayment: string;
  invoiceId: string;
  invoiceSecret?: string;
  fundingAmount: string;
  expiresAt: number;
};

export type PrivatePolicy = {
  mandateId: string;
  owner: string;
  agent: string;
  token: string;
  maxPayment: string;
  vendorAddresses: string[];
  vendorHashes: string[];
  vendorMerkleRoot: string;
  policySalt: string;
  policyNonce: string;
  invoiceId: string;
  invoiceSecret: string;
  invoiceCommitment: string;
  fundingAmount: string;
  expiresAt: number;
  policyCommitment: string;
};

export type PaymentRequest = {
  mandateId: string;
  vendorAddress: string;
  amount: string;
  invoiceSecret: string;
};

export type DemoProofBundle = {
  proof: {
    mode: "demo-local";
    proofHash: string;
  };
  publicSignals: string[];
  publicInputsForContract: string[];
  nullifier: string;
  vendorHash: string;
  invoiceCommitment: string;
};

export function hex32(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let a = 0x6a09e667;
  let b = 0xbb67ae85;
  let c = 0x3c6ef372;
  let d = 0xa54ff53a;

  for (const byte of bytes) {
    a = Math.imul(a ^ byte, 0x85ebca6b) >>> 0;
    b = Math.imul(b + byte + a, 0xc2b2ae35) >>> 0;
    c = Math.imul(c ^ (byte + b), 0x27d4eb2f) >>> 0;
    d = Math.imul(d + (byte ^ c), 0x165667b1) >>> 0;
  }

  const words = [a, b, c, d, a ^ c, b ^ d, a ^ b ^ c, b ^ c ^ d];
  return `0x${words.map((word) => (word >>> 0).toString(16).padStart(8, "0")).join("")}`;
}

export function makeSalt(): string {
  const values = new Uint32Array(8);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(values);
  } else {
    for (let index = 0; index < values.length; index += 1) {
      values[index] = Math.floor(Math.random() * 0xffffffff);
    }
  }

  return `0x${Array.from(values).map((word) => word.toString(16).padStart(8, "0")).join("")}`;
}

export function hashVendor(address: string): string {
  return hex32(`vendor:${address.trim()}`);
}

export function hashInvoice(secret: string, vendorHash: string, amount: string): string {
  return hex32(`invoice:${secret}:${vendorHash}:${amount}`);
}

export function hashMandateId(owner: string, agent: string, invoiceCommitment: string, salt: string): string {
  return hex32(`mandate:${owner}:${agent}:${invoiceCommitment}:${salt}`);
}

export function hashPolicy(maxPayment: string, vendorRoot: string, invoiceCommitment: string, salt: string, mandateId: string): string {
  return hex32(`policy:${maxPayment}:${vendorRoot}:${invoiceCommitment}:${salt}:${mandateId}`);
}

export function deriveNullifier(policyNonce: string, invoiceCommitment: string, mandateId: string): string {
  return hex32(`nullifier:${policyNonce}:${invoiceCommitment}:${mandateId}`);
}

export function createOneInvoicePolicy(input: DemoPolicyInput): PrivatePolicy {
  const vendorHash = hashVendor(input.vendorAddress);
  const invoiceSecret = input.invoiceSecret || makeSalt();
  const invoiceCommitment = hashInvoice(invoiceSecret, vendorHash, input.maxPayment);
  const policySalt = makeSalt();
  const policyNonce = makeSalt();
  const mandateId = hashMandateId(input.owner, input.agent, invoiceCommitment, policySalt);
  const policyCommitment = hashPolicy(input.maxPayment, vendorHash, invoiceCommitment, policySalt, mandateId);

  return {
    mandateId,
    owner: input.owner,
    agent: input.agent,
    token: input.token,
    maxPayment: input.maxPayment,
    vendorAddresses: [input.vendorAddress],
    vendorHashes: [vendorHash],
    vendorMerkleRoot: vendorHash,
    policySalt,
    policyNonce,
    invoiceId: input.invoiceId,
    invoiceSecret,
    invoiceCommitment,
    fundingAmount: input.fundingAmount,
    expiresAt: input.expiresAt,
    policyCommitment
  };
}

export function generateDemoProof(policy: PrivatePolicy, payment: PaymentRequest): DemoProofBundle {
  const vendorHash = hashVendor(payment.vendorAddress);
  const amount = BigInt(payment.amount);
  const maxPayment = BigInt(policy.maxPayment);

  if (!policy.vendorHashes.includes(vendorHash)) {
    throw new Error("Vendor is not approved by this private policy");
  }

  if (amount <= 0n) {
    throw new Error("Payment amount must be positive");
  }

  if (amount > maxPayment) {
    throw new Error("Payment exceeds the mandate max payment");
  }

  const invoiceCommitment = hashInvoice(payment.invoiceSecret, vendorHash, payment.amount);
  if (invoiceCommitment !== policy.invoiceCommitment) {
    throw new Error("Invoice secret, vendor, or amount does not match the committed invoice");
  }

  const nullifier = deriveNullifier(policy.policyNonce, invoiceCommitment, policy.mandateId);
  const publicInputsForContract = [
    policy.policyCommitment,
    vendorHash,
    payment.amount,
    invoiceCommitment,
    nullifier,
    hex32(policy.mandateId)
  ];
  const proofHash = hex32(`proof:${publicInputsForContract.join(":")}:${policy.policySalt}`);

  return {
    proof: {
      mode: "demo-local",
      proofHash
    },
    publicSignals: publicInputsForContract,
    publicInputsForContract,
    nullifier,
    vendorHash,
    invoiceCommitment
  };
}

export const demoDefaults: DemoPolicyInput = {
  owner: "Ada Studio",
  agent: "Procurement Bot",
  token: "test-USDC",
  vendorAddress: "CloudAPI Ltd.",
  maxPayment: "750000000",
  invoiceId: "CLOUD-042",
  invoiceSecret: "demo invoice reference",
  fundingAmount: "750000000",
  expiresAt: 1800000000
};
