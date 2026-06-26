import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { WITNESS, WITNESS_GENERATOR, WASM, assertFile } from "./tooling.js";

const inputPath = process.argv[2] || "circuits/input.example.json";

assertFile(WITNESS_GENERATOR, "Run npm run circuit:build first.");
assertFile(WASM, "Run npm run circuit:build first.");
assertFile(inputPath, `Provide a witness input JSON file. Missing ${inputPath}.`);

writeFileSync(join(dirname(WITNESS_GENERATOR), "package.json"), "{\"type\":\"commonjs\"}\n");

const result = spawnSync("node", [WITNESS_GENERATOR, WASM, inputPath, WITNESS], { stdio: "inherit" });
process.exit(result.status ?? 1);
