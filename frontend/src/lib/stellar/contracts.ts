import {
  Address,
  BASE_FEE,
  Contract,
  nativeToScVal,
  TransactionBuilder,
  xdr
} from "@stellar/stellar-sdk";
import { createRpcServer, submitTransactionXdr, type SubmittedTransaction } from "./client";
import type { StellarFrontendConfig } from "./config";
import { signTransactionXdr } from "./wallet";

export type ExecutePaymentParams = {
  agent: string;
  mandateId: string;
  vendor: string;
  vendorHash: string;
  amount: string;
  amountInput: string;
  invoiceCommitment: string;
  nullifier: string;
  mandateIdHash: string;
  proofBytes: Uint8Array;
  publicInputs: string[];
};

export type ExecutePaymentState =
  | "preparing_transaction"
  | "awaiting_signature"
  | "submitting_to_stellar"
  | "confirming"
  | "verified"
  | "payment_released";

export type ExecutePaymentResult = SubmittedTransaction & {
  pactraContractId: string;
  verifierContractId: string;
  tokenContractId: string;
};

export async function executePactraPayment(
  config: StellarFrontendConfig,
  params: ExecutePaymentParams,
  onState: (state: ExecutePaymentState) => void
): Promise<ExecutePaymentResult> {
  validateExecuteParams(params);

  onState("preparing_transaction");
  const server = createRpcServer(config.rpcUrl);
  const source = await server.getAccount(params.agent);
  const contract = new Contract(config.pactraContractId);

  const transaction = new TransactionBuilder(source, {
    fee: BASE_FEE,
    networkPassphrase: config.passphrase
  })
    .addOperation(
      contract.call(
        "execute_payment",
        new Address(params.agent).toScVal(),
        bytesScVal(params.mandateId),
        new Address(params.vendor).toScVal(),
        bytesScVal(params.vendorHash),
        nativeToScVal(BigInt(params.amount), { type: "i128" }),
        bytesScVal(params.amountInput),
        bytesScVal(params.invoiceCommitment),
        bytesScVal(params.nullifier),
        bytesScVal(params.mandateIdHash),
        nativeToScVal(params.proofBytes),
        xdr.ScVal.scvVec(params.publicInputs.map(bytesScVal))
      )
    )
    .setTimeout(300)
    .build();

  const prepared = await server.prepareTransaction(transaction);

  onState("awaiting_signature");
  const signedXdr = await signTransactionXdr(prepared.toXDR(), config, params.agent);

  onState("submitting_to_stellar");
  const submitted = await submitTransactionXdr(config, signedXdr);

  onState("confirming");
  if (submitted.status === "SUCCESS") {
    onState("verified");
    onState("payment_released");
  }

  return {
    ...submitted,
    pactraContractId: config.pactraContractId,
    verifierContractId: config.groth16VerifierContractId,
    tokenContractId: config.tokenContractId
  };
}

export function validateExecuteParams(params: ExecutePaymentParams): void {
  if (params.proofBytes.length !== 256) {
    throw new Error(`Proof must be exactly 256 bytes, got ${params.proofBytes.length}.`);
  }

  if (params.publicInputs.length !== 6) {
    throw new Error(`Expected six public inputs, got ${params.publicInputs.length}.`);
  }

  for (const [label, value] of [
    ["mandate ID", params.mandateId],
    ["vendor hash", params.vendorHash],
    ["amount input", params.amountInput],
    ["invoice commitment", params.invoiceCommitment],
    ["nullifier", params.nullifier],
    ["mandate ID hash", params.mandateIdHash]
  ] as const) {
    if (hexToBytes(value).length !== 32) {
      throw new Error(`${label} must be a 32-byte hex value.`);
    }
  }
}

function bytesScVal(hex: string): xdr.ScVal {
  return nativeToScVal(hexToBytes(hex));
}

function hexToBytes(hex: string): Uint8Array {
  const normalized = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (normalized.length !== 64) {
    throw new Error(`Expected 32-byte hex value, got ${normalized.length / 2} bytes.`);
  }

  return Uint8Array.from(normalized.match(/.{2}/g)?.map((byte) => Number.parseInt(byte, 16)) ?? []);
}
