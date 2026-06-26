# Testnet Deployment

Pactra is deployed on Stellar testnet with the real Groth16 verifier.

## Current Public IDs

```text
Pactra:           CB2FRNMIQ6JZ4SYWHRO5JIKXRVXMXSJMTLNN6JQON7H73YFXLSMGVPC3
Groth16 verifier: CCVHPHJKA4RIXRQLQEZ6OGIYGA6LIYLLJBSEOSIM4LJICGGMIW6VUKDI
Token:            CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC
Network:          testnet
RPC:              https://soroban-testnet.stellar.org
Passphrase:       Test SDF Network ; September 2015
```

Deployment metadata lives in `contracts/deployments/testnet.json`.

## Build Contracts

```bash
stellar contract build
```

This repo builds to:

```text
target/wasm32v1-none/release/groth16_verifier.wasm
target/wasm32v1-none/release/pactra_contract.wasm
```

## Deploy Contracts

Create and fund a local testnet identity:

```bash
stellar keys generate pactra-deployer --network testnet
stellar keys fund pactra-deployer --network testnet
stellar keys address pactra-deployer
```

Deploy the verifier:

```bash
stellar contract deploy \
  --wasm target/wasm32v1-none/release/groth16_verifier.wasm \
  --source-account pactra-deployer \
  --network testnet
```

Deploy Pactra:

```bash
stellar contract deploy \
  --wasm target/wasm32v1-none/release/pactra_contract.wasm \
  --source-account pactra-deployer \
  --network testnet
```

Initialize Pactra:

```bash
stellar contract invoke \
  --id $PACTRA_ID \
  --source-account pactra-deployer \
  --network testnet \
  -- initialize \
  --admin $DEPLOYER_ADDRESS \
  --verifier $VERIFIER_ID
```

Get the native asset contract ID:

```bash
stellar contract id asset --asset native --network testnet
```

## Frontend Env

Copy `frontend/.env.example` to `frontend/.env.local` and fill public IDs:

```bash
VITE_STELLAR_NETWORK=testnet
VITE_STELLAR_RPC_URL=https://soroban-testnet.stellar.org
VITE_STELLAR_PASSPHRASE=Test SDF Network ; September 2015
VITE_PACTRA_CONTRACT_ID=CB2FRNMIQ6JZ4SYWHRO5JIKXRVXMXSJMTLNN6JQON7H73YFXLSMGVPC3
VITE_GROTH16_VERIFIER_CONTRACT_ID=CCVHPHJKA4RIXRQLQEZ6OGIYGA6LIYLLJBSEOSIM4LJICGGMIW6VUKDI
VITE_TOKEN_CONTRACT_ID=CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC
```

Never commit:

- private keys
- secret keys
- mnemonics
- `.env.local`
- local identity files under `~/.config/stellar`

## Browser Proving

Export proving artifacts:

```bash
npm run zk:export
```

Generate or refresh the public-input bundle:

```bash
npm run proof:inputs
```

Run the offline live checklist before seeding:

```bash
npm run live:check
```

Before a mandate is seeded, the expected blocker is:

```text
FAIL frontend/public/demo/live-mandate.json exists
     Run npm run seed:live-mandate.
```

## Seed Live Mandate

`execute_payment` only succeeds after the deployed Pactra contract has a matching active funded mandate. Seed it from the CLI:

```bash
export PACTRA_OWNER_SECRET="S..."
export PACTRA_AGENT_PUBLIC_KEY="G..."   # Freighter account that will submit execute_payment
export PACTRA_VENDOR_PUBLIC_KEY="G..."  # recipient for the released payment
npm run seed:live-mandate
```

If `PACTRA_AGENT_PUBLIC_KEY` or `PACTRA_VENDOR_PUBLIC_KEY` are omitted, the script uses the owner public key. For a live frontend demo, set `PACTRA_AGENT_PUBLIC_KEY` to the Freighter account you will connect.

The script reads:

- `contracts/deployments/testnet.json`
- `pactra-public-inputs.json`
- `PACTRA_OWNER_SECRET` from local env only

It writes public state to:

```text
frontend/public/demo/live-mandate.json
```

That file contains only public/safe values: mandate ID, public keys, token ID, funding amount, public inputs, public proof bytes, transaction hash, generation ID, and contract IDs. It must not contain private keys, policy salt, invoice secret, Merkle path, or private witness JSON.

## Reset Live Demo

Live mandates are one-use. After a successful release, replaying the same proof should fail with a used nullifier or inactive mandate. To prepare a fresh live demo:

```bash
export PACTRA_OWNER_SECRET="S..."
export PACTRA_AGENT_PUBLIC_KEY="G..."   # Freighter account that will submit execute_payment
export PACTRA_VENDOR_PUBLIC_KEY="G..."  # recipient for the released payment
npm run live:reset
```

`live:reset` runs:

```text
circuit:input -> witness:generate -> proof:generate -> proof:verify -> proof:inputs
-> verifier:test-vector -> zk:export -> seed:live-mandate -> live:check -> live:dry-run
```

Each reset creates fresh circuit randomness for the policy salt, policy nonce, invoice secret, and mandate hash, then seeds a fresh on-chain mandate ID. The previous public live mandate JSON is archived under:

```text
contracts/deployments/archive/live-mandate-<timestamp>.json
```

The archive contains only public data and transaction hashes.

After seeding, run:

```bash
npm run live:check
npm run live:dry-run
```

`live:check` verifies local files and proof/vector consistency without network access. `live:dry-run` checks Stellar RPC reachability, public contract config, proof/vector consistency, and simulates `get_mandate` when the live mandate file is present. It does not submit a transaction.

Run the app:

```bash
npm run dev
```

Use `/review`:

1. Select Live Testnet Mode.
2. Confirm the “Live readiness” panel.
3. Connect Freighter on testnet with the seeded agent account.
4. Generate a real Groth16 proof.
5. Submit the proof to Stellar.
6. View the live transaction receipt on `/receipt`.

## Troubleshooting

- `Run npm run seed:live-mandate first`: no live mandate JSON exists in `frontend/public/demo`.
- `Connected wallet does not match the seeded mandate agent`: switch Freighter accounts or reseed with `PACTRA_AGENT_PUBLIC_KEY` set to the connected account.
- `Mandate not found`: reseed and confirm `npm run live:dry-run` can simulate `get_mandate`.
- `Mandate is not funded enough`: the seeded mandate may already be spent or underfunded; seed a fresh mandate.
- `This one-off mandate has already paid out`: run `npm run live:reset`.
- `Nullifier already used`: the proof has already released payment once; run `npm run live:reset`.
- `Public input mismatch`: rerun `npm run proof:inputs`, then `npm run seed:live-mandate`.
- `Groth16 verifier rejected the proof`: regenerate the real proof and confirm the proof bundle matches the seeded mandate.
- `Stellar RPC/network error`: rerun `npm run live:dry-run` and confirm the RPC URL/passphrase.

## Deploy Frontend

For Vercel or Netlify, set the same `VITE_...` environment variables in the project dashboard. Do not upload `.env.local`.

The frontend only receives public network and contract identifiers.

Deployment notes:

- Vite frontend root: `frontend`
- Deployment project root: repository root `.`
- Build command: `npm run build`
- Output directory: `dist`
- Public env only: `VITE_STELLAR_NETWORK`, `VITE_STELLAR_RPC_URL`, `VITE_STELLAR_PASSPHRASE`, `VITE_PACTRA_CONTRACT_ID`, `VITE_GROTH16_VERIFIER_CONTRACT_ID`, `VITE_TOKEN_CONTRACT_ID`
- Never deploy or commit `PACTRA_OWNER_SECRET`, Stellar secret keys, mnemonics, witness JSON, policy salt, invoice secret, or Merkle path data.
- The default public route should work without a wallet.
- Demo Mode and Browser Proof Mode should work without private deployment env vars.
- Live Testnet Mode requires the public IDs and a seeded `frontend/public/demo/live-mandate.json`.

Vercel example:

```text
Root Directory: .
Build Command: npm run build
Output Directory: dist
```

Netlify example:

```text
Base directory: .
Build command: npm run build
Publish directory: dist
```

## What Is Real vs Demo-Limited

Real:

- Browser Groth16 proof generation.
- Real BN254 Groth16 verifier contract.
- Proof-gated escrow release.
- Nullifier replay protection.
- Stellar testnet transaction.

Demo-limited:

- One-off invoice mandate.
- Testnet only.
- Demo trusted setup.
- Public recipient and amount.
- No self-serve faucet/backend yet; Live Testnet Mode is prepared/judge-focused.
