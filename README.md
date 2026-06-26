# Pactra

Pactra is a ZK payment firewall for autonomous agents on Stellar.

AI agents can request payments, but funds only move after zero-knowledge proof verification. The browser generates a Groth16 proof for a private human mandate, Stellar/Soroban verifies that proof on-chain, and Pactra releases escrow only if the proof is accepted. A successful release records a receipt and nullifier so the same authorization cannot be replayed.

The public sees a verified payment. The agent gets limited spending power. The business keeps its spending policy private.

## Submission Links

- Live Demo: `TODO`
- Demo Video: `TODO`
- Stellar Expert Transaction: `TODO`
- GitHub Repo: `TODO`

## Core Flow

```text
Agent requests payment
-> browser generates Groth16 proof
-> Soroban verifier checks BN254 proof
-> Pactra releases escrow
-> receipt/nullifier prevents replay
```

## MVP Shape

The first demo proves the simplest useful version of the firewall: one approved vendor, one approved invoice, one payment, one nullifier. That keeps the circuit small and the security boundary easy to judge. Cumulative private spend and recurring budgets are future work.

The current repository includes:

- Soroban escrow contract in `contracts/pactra`
- Development-only mock verifier in `contracts/mock-verifier`
- Groth16 verifier contract in `contracts/groth16-verifier`
- Circom mandate circuit in `circuits/mandate.circom`
- Local policy/proof helper scripts in `scripts`
- Vite React demo console in `frontend`
- Architecture and demo notes in `docs`
- Judge-facing demo guide in `JUDGE_DEMO.md`
- Security/audit notes in `SECURITY.md`

## What Is Public

The recipient, amount, invoice commitment, nullifier, and receipt are public in the MVP. Pactra hides the internal mandate rules: max payment, policy salt, invoice secret, vendor tree path, and policy JSON.

## What Is Real vs Demo-Limited

Real:

- Browser Groth16 proof generation.
- Real BN254 Groth16 verifier contract.
- Proof-gated escrow release.
- Nullifier replay protection.
- Stellar testnet transaction flow with Freighter/Stellar Wallets Kit.

Demo-limited:

- One-off invoice mandate.
- Testnet only.
- Demo trusted setup.
- Public recipient and amount.
- No self-serve faucet/backend yet; Live Testnet Mode is prepared for judges/developers.

## Commands

Install frontend/script dependencies:

```bash
npm install
```

Install the Circom toolchain:

```bash
cd /tmp
git clone https://github.com/iden3/circom.git
cd circom
cargo build --release
cargo install --path circom
circom --help
```

Pactra uses a local `snarkjs` dev dependency, installed by `npm install`. Circom's docs also support a global install:

```bash
npm install -g snarkjs
```

Check local ZK tooling:

```bash
npm run circuit:check
```

Run the app:

```bash
npm run dev
```

Generate a local one-invoice policy:

```bash
npm run policy:demo
```

Generate a local demo proof bundle:

```bash
npm run proof:generate
```

Verify the proof bundle. If Groth16 artifacts exist, this runs `snarkjs groth16 verify`; otherwise it verifies the local demo proof bundle shape and says so explicitly.

```bash
npm run proof:verify
```

Run the full local story:

```bash
npm run demo:e2e
```

Run Soroban contract tests:

```bash
npm run contracts:test
```

Build the circuit:

```bash
npm run circuit:build
```

Run the local Groth16 setup, generate a witness, prove, and verify:

```bash
npm run circuit:build
npm run circuit:setup
npm run circuit:input
npm run witness:generate
npm run proof:generate
npm run proof:verify
npm run proof:inputs
npm run verifier:export
npm run verifier:test-vector
npm run zk:export
cargo test --workspace
```

The setup script uses a local BN128 powers-of-tau size of 14, which fits the current `mandate.circom` circuit.

## Verifier Status

The Pactra contract already treats verification as load-bearing: payment is released only after the verifier returns `true`.

There are two local proof tracks. `npm run demo:e2e` uses the fast demo/UI proof bundle for the judge story. The real Groth16 path uses Circom/snarkjs artifacts, exported verifier constants, and Rust fixtures; `cargo test --workspace` includes a Pactra integration test that releases escrow only after the real verifier accepts the generated proof.

`contracts/mock-verifier` is escrow/dev testing only. It accepts any non-empty proof with exactly six public inputs, so it must never be presented as the ZK proof path. Pactra itself now also requires a 256-byte proof shape before calling any verifier.

`contracts/groth16-verifier` is the real-verifier boundary. It exposes the same interface Pactra calls and implements the BN254 Groth16 verification path using exported verifying-key constants. The current generated key and test vector are for `circuits/mandate.circom`.

If the generated verifying key is removed or replaced by the placeholder, `GENERATED = false` makes the verifier reject every proof. This is intentional: the real verifier must not return `true` without exported constants and a pairing check.

See `docs/GROTH16_VERIFIER.md` for the exact proof byte shape, public input order, Pactra field mapping, and fixture regeneration path.

See `docs/BROWSER_PROVING.md` for the frontend proof-generation path. Browser proving loads precompiled Circom artifacts from `frontend/public/zk`; it does not compile Circom in the browser.

## Live Testnet

Current public testnet deployment:

```text
Pactra:           CB2FRNMIQ6JZ4SYWHRO5JIKXRVXMXSJMTLNN6JQON7H73YFXLSMGVPC3
Groth16 verifier: CCVHPHJKA4RIXRQLQEZ6OGIYGA6LIYLLJBSEOSIM4LJICGGMIW6VUKDI
Token:            CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC
```

Configure `frontend/.env.local` from `frontend/.env.example`, run `npm run zk:export`, then use `/review` in Live Testnet Mode. See `docs/DEPLOYMENT.md` for the full deployment and frontend setup path.

Live mode is one-use by design. After the prepared mandate pays out, Pactra records the nullifier and exhausts the one-off mandate. Replaying the same proof should fail. To prepare another live run, reset the demo state:

```bash
export PACTRA_OWNER_SECRET="S..."
export PACTRA_AGENT_PUBLIC_KEY="G..."
export PACTRA_VENDOR_PUBLIC_KEY="G..."
npm run live:reset
```

`live:reset` generates fresh circuit input, witness, Groth16 proof, public inputs, Rust test vectors, browser ZK artifacts, and a fresh funded mandate. It prints the new nullifier and archives the previous public live mandate JSON under `contracts/deployments/archive`.

Live demo order:

1. `npm run zk:export`
2. `npm run proof:inputs`
3. deploy/configure contracts
4. configure `frontend/.env.local`
5. `npm run live:check`
6. `PACTRA_OWNER_SECRET=S... PACTRA_AGENT_PUBLIC_KEY=G... PACTRA_VENDOR_PUBLIC_KEY=G... npm run live:reset`
7. `npm run live:check`
8. `npm run live:dry-run`
9. open `/review`
10. use the prepared proof or generate proof
11. submit proof
12. view `/receipt`

`npm run live:check` is an offline pre-flight checklist for frontend env, ZK artifacts, the proof bundle, and `frontend/public/demo/live-mandate.json`. `npm run live:dry-run` reaches Stellar testnet and simulates a `get_mandate` read when a seeded mandate exists. It never submits a transaction.

Development flow:

- `mock-verifier` proves escrow behavior.
- `groth16-verifier` proves Pactra's ZK mandate path after `verification_key.json` is exported into Rust constants.
- `npm run verifier:test-vector` regenerates both verifier-only and Pactra integration-test Rust fixtures from `pactra-public-inputs.json`.

For Vercel or Netlify, set only the public `VITE_...` values from `frontend/.env.example`. Do not upload `.env.local`, secret keys, mnemonics, witness JSON, policy salt, invoice secret, or Merkle paths. Demo Mode still works without live env vars; Live Testnet Mode stays disabled until public contract IDs are configured and a seeded mandate is loaded.

## MVP Circuit Statement

The circuit proves:

- The vendor hash is in the private vendor Merkle tree.
- The payment amount is less than or equal to the private max payment.
- The invoice commitment matches the invoice secret, vendor, and amount.
- The policy commitment matches the private policy.
- The nullifier is derived from the invoice and mandate, preventing replay.

## Token Interface

Pactra interacts with demo assets through Soroban's standard token client. The hackathon path can use a test Stellar Asset Contract token or any SEP-41-compatible test token.

## References

- Circom installation and snarkjs: https://docs.circom.io/getting-started/installation/
- Stellar typed contract events: https://developers.stellar.org/docs/build/smart-contracts/example-contracts/events
- Soroban security and local audit notes: `SECURITY.md`

## Limitations

This is hackathon MVP code. Do not use mainnet funds. The local TypeScript proof helper uses readable demo hashes for UI state; it is not a replacement for the Circom/Poseidon/Groth16 path. The real path now builds the circuit, exports verifier constants, and verifies the generated proof in contract tests. The current proof policy is intentionally one invoice; the product category is private authorization for agentic payments.

## Roadmap

Pactra's hackathon MVP proves the smallest useful version of the protocol: one approved vendor, one approved invoice, one payment, and one nullifier. The long-term goal is to make Pactra a reusable payment firewall for autonomous agents.

### V1 - Hackathon MVP

- One-off invoice mandate
- Browser Groth16 proof generation
- Soroban BN254 Groth16 verification
- Proof-gated escrow release
- Nullifier-based replay protection
- Stellar testnet receipt trail

### V2 - Self-Serve Testnet Mandates

- Let users create and fund fresh mandates directly from the frontend
- Remove the need for CLI seeding in normal demos
- Support any connected wallet as the agent
- Add better mandate status reads from the frontend

### V3 - Reusable Mandates

- Support one mandate paying multiple invoices
- Add invoice-set commitments using Merkle roots
- Generate a unique nullifier per invoice/payment
- Track remaining budget across many approved payments

### V4 - Agent SDK

- Provide a TypeScript SDK for autonomous agents
- Let agents request payments, generate proofs, submit transactions, and read receipts programmatically
- Add integrations for AI procurement bots, API-payment agents, DAO treasury bots, and x402-style machine payments

### V5 - Policy Templates

- Add reusable ZK policy templates:
  - vendor allowlist payments
  - invoice-bound payments
  - spend caps
  - time-windowed mandates
  - contractor payouts
  - API usage payments
- Let teams choose policies without touching circuit internals

### V6 - Organization Controls

- Team vaults
- Multi-agent mandates
- Budget refill flows
- Policy revocation
- Auditor-friendly receipt exports
- Optional view-key/selective disclosure patterns

### Long-Term Vision

Pactra should become a cryptographic control layer for agentic commerce: humans and organizations fund mandate vaults, autonomous agents request payments, and Stellar contracts release funds only after zero-knowledge proofs show the agent followed the private rules.
