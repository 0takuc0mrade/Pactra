import { BUILD_DIR, CIRCUIT, ensureDir, run } from "./tooling.js";

await import("./check-circom.js");

ensureDir(BUILD_DIR);
run(
  "circom",
  [CIRCUIT, "--r1cs", "--wasm", "--sym", "-l", "node_modules", "-o", BUILD_DIR]
);
