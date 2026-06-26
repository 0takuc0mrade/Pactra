# Pactra Submission Checklist

## Links

- Public repo: `TODO`
- Live Demo: `TODO`
- Demo Video: `TODO`
- Stellar Expert Transaction: `TODO`

## Testnet Contracts

- Pactra contract ID: `CB2FRNMIQ6JZ4SYWHRO5JIKXRVXMXSJMTLNN6JQON7H73YFXLSMGVPC3`
- Groth16 verifier contract ID: `CCVHPHJKA4RIXRQLQEZ6OGIYGA6LIYLLJBSEOSIM4LJICGGMIW6VUKDI`
- Token contract ID: `CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC`

## Final Checks

- [ ] Public repo is visible.
- [ ] Live frontend link is added.
- [ ] Demo video link is added.
- [ ] Successful Stellar Expert transaction link is added.
- [x] Live reset command documented: `npm run live:reset`.
- [x] Known limitations documented.
- [x] No private keys, mnemonics, policy salt, invoice secret, Merkle paths, or witness data are committed intentionally.
- [x] Final verification commands pass:
  - [x] `npm run build`
  - [x] `npm run test:zk`
  - [x] `npm run demo:e2e`
  - [x] `npm run live:check`
  - [x] `npm run live:dry-run`
  - [x] `cargo test --workspace`

## Known Limitations

- The live mandate is intentionally one-use; replay should fail.
- The MVP circuit is one approved invoice, one approved vendor, one payment, one nullifier.
- Testnet only.
- Demo trusted setup is used for the hackathon circuit.
- Recipient, amount, invoice commitment, nullifier, and receipt are public.
- No self-serve live faucet/backend yet; Live Testnet Mode is prepared/judge-focused.
