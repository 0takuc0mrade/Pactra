declare module "snarkjs" {
  import type { SnarkProof } from "./types";

  export const groth16: {
    fullProve: (
      input: unknown,
      wasmFile: string,
      zkeyFile: string
    ) => Promise<{ proof: SnarkProof; publicSignals: string[] }>;
  };
}
