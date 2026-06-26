import type { StellarFrontendConfig } from "./config";
import { Networks, StellarWalletsKit } from "@creit.tech/stellar-wallets-kit";
import { FREIGHTER_ID, FreighterModule } from "@creit.tech/stellar-wallets-kit/modules/freighter";

export type WalletConnection = {
  publicKey: string;
};

let walletKitReady = false;

export async function connectWallet(config: Pick<StellarFrontendConfig, "passphrase">): Promise<WalletConnection> {
  ensureWalletKit(config);

  try {
    const { address } = await StellarWalletsKit.authModal();
    if (address) return { publicKey: address };
  } catch (error) {
    throw new Error(walletError(error, "Wallet connection failed."));
  }

  throw new Error("Freighter did not return a public key.");
}

export async function signTransactionXdr(
  unsignedXdr: string,
  config: Pick<StellarFrontendConfig, "network" | "passphrase">,
  publicKey: string
): Promise<string> {
  ensureWalletKit(config);

  try {
    const result = await StellarWalletsKit.signTransaction(unsignedXdr, {
      networkPassphrase: config.passphrase,
      address: publicKey
    });

    const signedXdr = result.signedTxXdr;
    if (!signedXdr) {
      throw new Error("Freighter did not return signed transaction XDR.");
    }

    return signedXdr;
  } catch (error) {
    throw new Error(walletError(error, "Wallet signing failed."));
  }
}

function ensureWalletKit(config: Pick<StellarFrontendConfig, "passphrase">): void {
  if (walletKitReady) {
    StellarWalletsKit.setNetwork(networkFromPassphrase(config.passphrase));
    return;
  }

  StellarWalletsKit.init({
    modules: [new FreighterModule()],
    selectedWalletId: FREIGHTER_ID,
    network: networkFromPassphrase(config.passphrase),
    authModal: {
      showInstallLabel: true,
      hideUnsupportedWallets: false
    }
  });
  walletKitReady = true;
}

function networkFromPassphrase(passphrase: string): Networks {
  if (passphrase === Networks.PUBLIC) return Networks.PUBLIC;
  if (passphrase === Networks.FUTURENET) return Networks.FUTURENET;
  if (passphrase === Networks.SANDBOX) return Networks.SANDBOX;
  if (passphrase === Networks.STANDALONE) return Networks.STANDALONE;
  return Networks.TESTNET;
}

function walletError(error: unknown, fallback: string): string {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    if (message.includes("not installed") || message.includes("not available")) {
      return "Freighter is not available to this browser tab. Enable the extension for localhost, then refresh.";
    }
    if (message.includes("reject") || message.includes("denied")) {
      return "Wallet request was rejected.";
    }
    if (message.includes("network")) {
      return "Wallet network mismatch. Switch Freighter to Stellar testnet.";
    }
    return error.message;
  }

  return fallback;
}
