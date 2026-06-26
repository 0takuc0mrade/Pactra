export type StellarFrontendConfig = {
  network: string;
  rpcUrl: string;
  passphrase: string;
  pactraContractId: string;
  groth16VerifierContractId: string;
  tokenContractId: string;
};

export type StellarConfigStatus = StellarFrontendConfig & {
  isTestnetConfigured: boolean;
  missingConfigKeys: string[];
};

export function getStellarConfig(): StellarConfigStatus {
  const config: StellarFrontendConfig = {
    network: import.meta.env.VITE_STELLAR_NETWORK || "testnet",
    rpcUrl: import.meta.env.VITE_STELLAR_RPC_URL || "https://soroban-testnet.stellar.org",
    passphrase: import.meta.env.VITE_STELLAR_PASSPHRASE || "Test SDF Network ; September 2015",
    pactraContractId: import.meta.env.VITE_PACTRA_CONTRACT_ID || "",
    groth16VerifierContractId: import.meta.env.VITE_GROTH16_VERIFIER_CONTRACT_ID || "",
    tokenContractId: import.meta.env.VITE_TOKEN_CONTRACT_ID || ""
  };

  const required = [
    ["VITE_PACTRA_CONTRACT_ID", config.pactraContractId],
    ["VITE_GROTH16_VERIFIER_CONTRACT_ID", config.groth16VerifierContractId],
    ["VITE_TOKEN_CONTRACT_ID", config.tokenContractId]
  ] as const;

  const missingConfigKeys = required.filter(([, value]) => !value).map(([key]) => key);

  return {
    ...config,
    isTestnetConfigured: missingConfigKeys.length === 0,
    missingConfigKeys
  };
}
