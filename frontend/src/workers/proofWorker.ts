import { assertBrowserArtifacts, generateProof } from "../lib/zk/generateProof";
import type { BrowserProofResult, PrivateWitnessInput } from "../lib/zk/types";

type WorkerRequest = {
  witness: PrivateWitnessInput;
};

type WorkerStatus =
  | "loading_artifacts"
  | "generating_witness"
  | "generating_proof"
  | "proof_ready";

type WorkerResponse =
  | { type: "status"; status: WorkerStatus }
  | { type: "result"; ok: true; proof: BrowserProofResult["proof"]; publicSignals: string[]; summary: BrowserProofResult["summary"] }
  | { type: "result"; ok: false; error: string };

function post(message: WorkerResponse): void {
  self.postMessage(message);
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  try {
    post({ type: "status", status: "loading_artifacts" });
    await assertBrowserArtifacts();

    post({ type: "status", status: "generating_witness" });
    await Promise.resolve();

    post({ type: "status", status: "generating_proof" });
    const result = await generateProof(event.data.witness);

    post({ type: "status", status: "proof_ready" });
    post({
      type: "result",
      ok: true,
      proof: result.proof,
      publicSignals: result.publicSignals,
      summary: result.summary
    });
  } catch (error) {
    post({
      type: "result",
      ok: false,
      error: error instanceof Error ? error.message : "Failed to generate Groth16 proof."
    });
  }
};
