# Browser Proving

Pactra's frontend can generate the real `mandate.circom` Groth16 proof in the browser for the judge demo.

The browser does not compile Circom. It only loads precompiled artifacts:

- `frontend/public/zk/mandate.wasm`
- `frontend/public/zk/mandate_final.zkey`
- `frontend/public/zk/verification_key.json`

## Export Artifacts

Build the circuit artifacts first:

```bash
npm run circuit:check
npm run circuit:build
npm run circuit:setup
npm run circuit:input
npm run witness:generate
npm run proof:generate
npm run proof:verify
```

Then copy the browser-safe proving artifacts:

```bash
npm run zk:export
```

If an artifact is missing, `zk:export` fails with the exact commands to run first. The frontend also fails gracefully if `/zk/mandate.wasm` or `/zk/mandate_final.zkey` are missing.

## Frontend Flow

The `/review` page includes:

- `Generate Real Groth16 Proof`: primary browser proving path.
- `Use Demo Proof Fixture`: fallback demo proof. Browser proving is the primary path.

Real proving runs inside `frontend/src/workers/proofWorker.ts` so the UI does not freeze. The worker loads:

```text
/zk/mandate.wasm
/zk/mandate_final.zkey
```

and calls `snarkjs.groth16.fullProve`.

## Privacy

Private witness data is passed to the worker and is not logged or displayed in the UI.

The UI only shows a safe summary:

- circuit: `mandate.circom`
- proof system: `Groth16`
- curve: `BN254`
- public input count
- proof byte length
- invoice commitment
- nullifier

Do not display:

- max payment
- policy salt
- vendor Merkle path
- invoice secret
- private witness JSON

## Contract Formatting

`frontend/src/lib/zk/formatForContract.ts` formats browser proof output into the same shape used by Pactra's real verifier integration tests:

- proof bytes: exactly 256 bytes
- public inputs: exactly six 32-byte big-endian values
- order:
  1. `policy_commitment`
  2. `vendor_hash`
  3. `amount`
  4. `invoice_commitment`
  5. `nullifier`
  6. `mandate_id_hash`

The proof byte layout matches `docs/GROTH16_VERIFIER.md`:

```text
a: G1 affine point, 64 bytes
b: G2 affine point, 128 bytes
c: G1 affine point, 64 bytes
total: 256 bytes
```

## Verification

Browser proof generation prepares the proof bundle for Pactra. Verification still happens at the Soroban contract boundary:

```text
browser proof generation
↓
format proof/public inputs for Pactra
↓
Pactra validates public input mapping
↓
groth16-verifier checks BN254 Groth16 proof
↓
Pactra releases escrow and records receipt
```

## Tests

Run the formatter tests:

```bash
npm run test:zk
```

The tests cover:

- valid proof fixture formats to 256 bytes
- missing proof fails cleanly
- wrong public signal count fails cleanly
- altered amount fails cleanly
- altered invoice commitment fails cleanly
- altered mandate ID hash fails cleanly
