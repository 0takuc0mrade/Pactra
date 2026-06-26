import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

type ProofBundle = {
  generationId?: string;
  publicInputsForContract: string[];
};

type LiveMandate = {
  generationId?: string;
  mandateId: string;
  nullifier: string;
  createdTransactionHash: string;
};

const STEPS = [
  ["circuit:input", "Generate fresh circuit input"],
  ["witness:generate", "Generate witness"],
  ["proof:generate", "Generate Groth16 proof"],
  ["proof:verify", "Verify Groth16 proof"],
  ["proof:inputs", "Export Pactra public inputs"],
  ["verifier:test-vector", "Regenerate Rust verifier fixtures"],
  ["zk:export", "Export browser ZK artifacts"],
  ["seed:live-mandate", "Seed fresh funded live mandate"],
  ["live:check", "Check live files"],
  ["live:dry-run", "Dry-run live RPC path"]
] as const;

function main() {
  console.log("Resetting Pactra live one-use demo state\n");
  console.log("This creates a fresh proof/nullifier and a fresh on-chain mandate.");
  console.log("It never writes Stellar secret keys or private witness values into frontend/public.\n");

  if (!process.env.PACTRA_OWNER_SECRET) {
    throw new Error("Missing PACTRA_OWNER_SECRET. Export the local testnet owner secret before running live:reset.");
  }

  let previousNullifier: string | null = null;
  if (existsSync("frontend/public/demo/live-mandate.json")) {
    const previous = JSON.parse(readFileSync("frontend/public/demo/live-mandate.json", "utf8")) as Partial<LiveMandate>;
    previousNullifier = previous.nullifier || null;
  }

  for (const [script, label] of STEPS) {
    runStep(script, label);
  }

  const proofBundle = JSON.parse(readFileSync("pactra-public-inputs.json", "utf8")) as ProofBundle;
  const liveMandate = JSON.parse(readFileSync("frontend/public/demo/live-mandate.json", "utf8")) as LiveMandate;
  const nextNullifier = liveMandate.nullifier || proofBundle.publicInputsForContract[4];

  console.log("\nLive reset complete.");
  console.log(`Generation ID: ${liveMandate.generationId || proofBundle.generationId || "unknown"}`);
  console.log(`Mandate ID: ${liveMandate.mandateId}`);
  console.log(`Nullifier: ${nextNullifier}`);
  console.log(`Seed transaction: ${liveMandate.createdTransactionHash}`);

  if (previousNullifier && previousNullifier === nextNullifier) {
    throw new Error("Reset completed but nullifier did not change. Check circuit input randomness before using the live demo.");
  }
}

function runStep(script: string, label: string): void {
  console.log(`\n==> ${label}`);
  const result = spawnSync("npm", ["run", script], {
    stdio: "inherit",
    env: process.env
  });

  if (result.status !== 0) {
    throw new Error(`live:reset stopped at npm run ${script}.`);
  }
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
