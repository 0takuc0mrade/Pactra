import {
  KEYS_DIR,
  PTAU_0,
  PTAU_1,
  PTAU_FINAL,
  R1CS,
  VKEY,
  ZKEY_0,
  ZKEY_FINAL,
  assertFile,
  ensureDir,
  run,
  snarkjsBin
} from "./tooling.js";
import { existsSync, rmSync } from "node:fs";

await import("./check-circom.js");

assertFile(R1CS, "Run npm run circuit:build first.");
ensureDir(KEYS_DIR);

for (const file of [PTAU_0, PTAU_1, PTAU_FINAL, ZKEY_0, ZKEY_FINAL, VKEY]) {
  if (existsSync(file)) {
    rmSync(file);
  }
}

run(snarkjsBin(), ["powersoftau", "new", "bn128", "14", PTAU_0, "-v"]);
run(snarkjsBin(), ["powersoftau", "contribute", PTAU_0, PTAU_1, "--name=Pactra demo contribution", "-v", "-e=pactra-demo"]);
run(snarkjsBin(), ["powersoftau", "prepare", "phase2", PTAU_1, PTAU_FINAL, "-v"]);
run(snarkjsBin(), ["groth16", "setup", R1CS, PTAU_FINAL, ZKEY_0]);
run(snarkjsBin(), ["zkey", "contribute", ZKEY_0, ZKEY_FINAL, "--name=Pactra final contribution", "-v", "-e=pactra-final"]);
run(snarkjsBin(), ["zkey", "export", "verificationkey", ZKEY_FINAL, VKEY]);

console.log(`Wrote ${ZKEY_FINAL} and ${VKEY}`);
