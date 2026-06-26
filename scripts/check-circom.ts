import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { checkBinary, snarkjsBin } from "./tooling.js";

checkBinary(
  "circom",
  ["--version"],
  "Install circom from source: git clone https://github.com/iden3/circom.git && cd circom && cargo build --release && cargo install --path circom"
);

const snarkjs = snarkjsBin();

if (!existsSync(snarkjs)) {
  console.error("Local snarkjs is missing.");
  console.error("Run npm install. For a global CLI, Circom docs also support: npm install -g snarkjs");
  process.exit(1);
}

const snarkjsCheck = spawnSync(snarkjs, ["--help"], { encoding: "utf8" });
if (!`${snarkjsCheck.stdout}${snarkjsCheck.stderr}`.includes("snarkjs@")) {
  console.error("Local snarkjs did not run as expected.");
  console.error("Run npm install to install the local snarkjs dev dependency.");
  process.exit(1);
}

console.log("Circom and snarkjs tooling are available.");
