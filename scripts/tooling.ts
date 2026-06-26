import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

export const CIRCUIT = "circuits/mandate.circom";
export const BUILD_DIR = "circuits/build";
export const KEYS_DIR = "circuits/keys";
export const R1CS = `${BUILD_DIR}/mandate.r1cs`;
export const WASM = `${BUILD_DIR}/mandate_js/mandate.wasm`;
export const WITNESS_GENERATOR = `${BUILD_DIR}/mandate_js/generate_witness.js`;
export const WITNESS = `${BUILD_DIR}/witness.wtns`;
export const PTAU_0 = `${KEYS_DIR}/pot14_0000.ptau`;
export const PTAU_1 = `${KEYS_DIR}/pot14_0001.ptau`;
export const PTAU_FINAL = `${KEYS_DIR}/pot14_final.ptau`;
export const ZKEY_0 = `${KEYS_DIR}/mandate_0000.zkey`;
export const ZKEY_FINAL = `${KEYS_DIR}/mandate_final.zkey`;
export const VKEY = `${KEYS_DIR}/verification_key.json`;

export function ensureDir(path: string) {
  if (!existsSync(path)) {
    mkdirSync(path, { recursive: true });
  }
}

export function snarkjsBin(): string {
  const suffix = process.platform === "win32" ? ".cmd" : "";
  return join("node_modules", ".bin", `snarkjs${suffix}`);
}

export function checkBinary(command: string, args: string[], installHint: string): void {
  const result = spawnSync(command, args, { stdio: "pipe" });
  if (result.status !== 0) {
    console.error(`${command} is missing or not executable.`);
    console.error(installHint);
    process.exit(1);
  }
}

export function run(command: string, args: string[]): void {
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

export function assertFile(path: string, hint: string): void {
  if (!existsSync(path)) {
    console.error(`Missing ${path}.`);
    console.error(hint);
    process.exit(1);
  }
}
