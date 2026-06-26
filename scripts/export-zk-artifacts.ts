import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { basename, dirname } from "node:path";

const artifacts = [
  ["circuits/build/mandate_js/mandate.wasm", "frontend/public/zk/mandate.wasm"],
  ["circuits/keys/mandate_final.zkey", "frontend/public/zk/mandate_final.zkey"],
  ["circuits/keys/verification_key.json", "frontend/public/zk/verification_key.json"]
] as const;

const missing = artifacts.filter(([source]) => !existsSync(source));

if (missing.length > 0) {
  console.error("Missing browser proving artifacts:");
  for (const [source] of missing) {
    console.error(`- ${source}`);
  }
  console.error("");
  console.error("Build the circuit artifacts first:");
  console.error("  npm run circuit:check");
  console.error("  npm run circuit:build");
  console.error("  npm run circuit:setup");
  console.error("  npm run circuit:input");
  console.error("  npm run witness:generate");
  console.error("  npm run proof:generate");
  console.error("  npm run proof:verify");
  process.exit(1);
}

for (const [source, destination] of artifacts) {
  mkdirSync(dirname(destination), { recursive: true });
  copyFileSync(source, destination);
  console.log(`Copied ${basename(source)} -> ${destination}`);
}

console.log("Browser proving artifacts exported to frontend/public/zk");
