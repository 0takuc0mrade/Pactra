# Groth16 Verifier Path

This is the exact real-verifier target for Pactra's one-off invoice mandate circuit.

## Circuit

Source: `circuits/mandate.circom`

Public signals, in order:

1. `policy_commitment`
2. `vendor_hash`
3. `amount`
4. `invoice_commitment`
5. `nullifier`
6. `mandate_id_hash`

Pactra's `execute_payment` checks this same order before calling the verifier.

## Proof Shape

`contracts/groth16-verifier` keeps the same interface used by Pactra:

```rust
verify(proof: Bytes, public_inputs: Vec<BytesN<32>>) -> bool
```

The Groth16 proof byte encoding is:

```text
a: G1 affine point, 64 bytes
b: G2 affine point, 128 bytes
c: G1 affine point, 64 bytes
total: 256 bytes
```

The byte order should match Soroban SDK BN254 expectations:

- G1: `be_bytes(x) || be_bytes(y)`
- G2: `be_bytes(x.c1) || be_bytes(x.c0) || be_bytes(y.c1) || be_bytes(y.c0)`

## Pactra Mapping

`contracts/pactra` calls the verifier only after it checks the proof boundary:

- `proof.len() == 256`
- `public_inputs.len() == 6`
- `public_inputs[0] == mandate.policy_commitment`
- `public_inputs[1] == vendor_hash`
- `public_inputs[2] == amount` encoded as a 32-byte big-endian unsigned integer
- `public_inputs[3] == invoice_commitment`
- `public_inputs[4] == nullifier`
- `public_inputs[5] == mandate_id_hash`

If any field does not match, Pactra rejects before calling the verifier. If the verifier returns `false`, Pactra emits `proof_rejected` and does not release escrow.

## Local Commands

Install Circom:

```bash
cd /tmp
git clone https://github.com/iden3/circom.git
cd circom
cargo build --release
cargo install --path circom
circom --help
```

Build and export Pactra artifacts:

```bash
npm run circuit:check
npm run circuit:build
npm run circuit:setup
npm run circuit:input
npm run witness:generate
npm run proof:generate
npm run proof:verify
npm run proof:inputs
npm run verifier:export
npm run verifier:test-vector
cargo test --workspace
```

`circuit:input` writes a deterministic valid one-off invoice input to `circuits/input.example.json`.

`proof:inputs` writes `pactra-public-inputs.json` in the order expected by `execute_payment`. When Groth16 artifacts exist, it also packs `proof.json` into the 256-byte proof encoding expected by `contracts/groth16-verifier`.

`verifier:export` reads `circuits/keys/verification_key.json` and rewrites `contracts/groth16-verifier/src/verifying_key.rs`. The generated file is marked with `@generated`; regenerate it any time `circuits/mandate.circom` or the trusted setup changes.

`verifier:test-vector` reads `pactra-public-inputs.json` and rewrites:

- `contracts/groth16-verifier/src/test_vector.rs`
- `contracts/pactra/src/fixtures/valid_groth16_proof.rs`

The Pactra fixture includes proof bytes, ordered public inputs, and named payment fields used by the real verifier integration tests.

The current setup script uses BN128 power 14. Power 12 is too small for this circuit.

## Proof Tracks

- Demo/UI track: `npm run demo:e2e` uses a readable local proof bundle so the product story stays fast and deterministic.
- Real Groth16 track: `proof.json`, `public.json`, `pactra-public-inputs.json`, exported verifier constants, and Rust fixtures come from the Circom/snarkjs flow above.
- Pactra integration track: `cargo test --workspace` deploys Pactra with the real `groth16-verifier`, submits the generated proof vector, and verifies escrow release, receipt storage, event emission, and nullifier replay protection.

## Current Status

Implemented:

- Verifying-key export from snarkjs JSON into Rust constants.
- Proof byte shape for `a`, `b`, and `c`.
- Public input order and conversion into BN254 scalar field elements.
- BN254 public-input linear combination using Soroban SDK primitives.
- Pairing check path with `e(-A, B) * e(alpha, beta) * e(vk_x, gamma) * e(C, delta) == 1`.

Verified locally:

- `npm run proof:verify` accepts the generated Groth16 proof with snarkjs.
- `cargo test --workspace` accepts the generated proof in `contracts/groth16-verifier`.
- `cargo test --workspace` proves Pactra can release escrow through the real `groth16-verifier` contract using the generated proof vector.
- Invalid well-formed proof bytes and altered public inputs are rejected.
- Pactra rejects altered amount, invoice commitment, mandate ID hash, proof replay, and short proof shape before funds move.

Remaining hardening:

- Defensive handling for malformed 256-byte point encodings should be reviewed against Soroban host behavior. Pactra already rejects bad proof length; invalid curve-point encodings remain verifier/host-level hardening.
- A production setup must use a proper trusted setup ceremony or audited reusable parameters, not the local demo contribution.
