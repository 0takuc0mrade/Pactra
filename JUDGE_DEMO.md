# Pactra Judge Demo

Pactra is a ZK payment firewall for autonomous agents on Stellar.

## Public Visitor Path

1. Open the live frontend: `TODO`
2. Use Demo Mode to understand the payment firewall story.
3. Use Browser Proof Mode on `/review` to generate a Groth16 proof in the browser.

This path is public-friendly and does not require a wallet or private testnet setup.

## Judge Live Path

Live Testnet Mode is prepared/judge-focused. It uses a seeded one-use mandate and Freighter/Stellar Wallets Kit.

1. Run `npm run live:check`.
2. Open `/review`.
3. Select Live Testnet Mode.
4. Connect the seeded Freighter testnet agent wallet.
5. Submit the prepared/generated proof to Stellar.
6. Open `/receipt` and click the transaction hash.

Successful transaction: `TODO`

## Reset Path

The live mandate is intentionally one-use. A replay should fail because Pactra records the nullifier and exhausts the mandate.

To prepare another live run:

```bash
export PACTRA_OWNER_SECRET="S..."
export PACTRA_AGENT_PUBLIC_KEY="G..."
export PACTRA_VENDOR_PUBLIC_KEY="G..."
npm run live:reset
```

`live:reset` generates a fresh proof, fresh nullifier, fresh mandate ID, fresh funded mandate, archives the old public mandate JSON, and runs `live:check` plus `live:dry-run`.

## Testnet IDs

```text
Pactra:           CB2FRNMIQ6JZ4SYWHRO5JIKXRVXMXSJMTLNN6JQON7H73YFXLSMGVPC3
Groth16 verifier: CCVHPHJKA4RIXRQLQEZ6OGIYGA6LIYLLJBSEOSIM4LJICGGMIW6VUKDI
Token:            CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC
```

## One-Line Pitch

Pactra lets AI agents make Stellar payments only after proving they followed a private human mandate.
