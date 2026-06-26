import { rpc, TransactionBuilder } from "@stellar/stellar-sdk";
import type { StellarFrontendConfig } from "./config";

export type SubmittedTransaction = {
  hash: string;
  status: string;
  resultXdr?: string;
};

export function createRpcServer(rpcUrl: string): rpc.Server {
  return new rpc.Server(rpcUrl);
}

export async function submitTransactionXdr(
  config: Pick<StellarFrontendConfig, "rpcUrl" | "passphrase">,
  signedXdr: string
): Promise<SubmittedTransaction> {
  if (!signedXdr) {
    throw new Error("Missing signed transaction XDR.");
  }

  const server = createRpcServer(config.rpcUrl);
  const signedTransaction = TransactionBuilder.fromXDR(signedXdr, config.passphrase);
  const sent = await server.sendTransaction(signedTransaction);

  if (sent.status === "ERROR") {
    throw new Error(`Stellar RPC rejected the transaction: ${sent.errorResult?.toXDR("base64") || "unknown error"}`);
  }

  if (!sent.hash) {
    throw new Error("Stellar RPC did not return a transaction hash.");
  }

  return pollTransaction(server, sent.hash);
}

export async function pollTransaction(server: rpc.Server, hash: string): Promise<SubmittedTransaction> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const result = await server.getTransaction(hash);
    if (result.status === "SUCCESS") {
      return {
        hash,
        status: result.status,
        resultXdr: result.resultXdr?.toXDR("base64")
      };
    }

    if (result.status === "FAILED") {
      throw new Error(`Stellar transaction failed: ${result.resultXdr?.toXDR("base64") || "no result XDR"}`);
    }

    await sleep(1200);
  }

  return { hash, status: "PENDING" };
}

export function safeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Unexpected Stellar error.";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
