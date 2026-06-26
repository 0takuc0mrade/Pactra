# Pactra Architecture

Pactra is a ZK payment firewall for autonomous agents on Stellar. The architecture separates human policy, agent requests, proof verification, and payment release so funds only move after private mandate compliance is proven.

Pactra is split into four layers:

1. Soroban escrow contract: owns mandate state, token escrow, nullifier tracking, and receipts.
2. Verifier contract boundary: accepts proof bytes plus six public inputs and returns `true` only for valid proofs.
3. Circom circuit: proves the MVP payment satisfies the hidden mandate.
4. Frontend and scripts: create the private policy JSON, simulate proof inputs, and drive the demo.

The first demo is deliberately one invoice: one approved vendor path, one max payment, and one nullifier derivation. This is the minimal working example of private policy-gated agent payments and avoids cumulative private spend state in the MVP.

## Public Inputs

The verifier receives these public inputs in order:

1. `policy_commitment`
2. `vendor_hash`
3. `amount`
4. `invoice_commitment`
5. `nullifier`
6. `mandate_id_hash`

The Pactra contract checks that the public inputs match the payment request before calling the verifier.

## Contract Boundary

`contracts/pactra` calls an external verifier through:

```rust
verify(proof: Bytes, public_inputs: Vec<BytesN<32>>) -> bool
```

`contracts/mock-verifier` is only a development helper. It lets contract tests prove that proof verification gates payment release, but it is not the final demo verifier.

`contracts/groth16-verifier` is the real verifier crate. It preserves the verifier interface, imports exported Groth16 verifying-key constants, parses the 256-byte proof shape, combines the six public inputs, and runs the BN254 pairing check.

The proof/public-input shape is specified in `docs/GROTH16_VERIFIER.md`.

## Events

Pactra emits typed Soroban events with `#[contractevent]`:

1. `mandate_created`
2. `payment_executed`
3. `mandate_cancelled`
4. `proof_rejected`

The receipt UI should consume `payment_executed` events for the verified payment timeline.

## ZK Toolchain

The Circom compiler is an external Rust binary. The JavaScript proof tooling is local to this repo through `snarkjs`, `circomlib`, and `circomlibjs` dev dependencies.

Run:

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
```
