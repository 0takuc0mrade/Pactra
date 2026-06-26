# Security Notes

Pactra is hackathon MVP software. Do not use mainnet funds.

## Replay Protection

The one-off invoice demo is intentionally not replayable. Pactra records each nullifier after a successful payment release, and a reused nullifier must fail. The contract may also mark the one-off mandate exhausted after payout, so a second submit can fail before it reaches the nullifier check.

This is expected security behavior. For another live testnet run, generate a fresh proof/nullifier and seed a fresh mandate with:

```bash
npm run live:reset
```

`live:reset` must only read Stellar secret keys from local environment variables. It must not write secret keys, policy salt, invoice secret, Merkle paths, or private witness data into `frontend/public`.

## npm audit

Current `npm audit` result:

- 1 low severity finding: `esbuild`, transitive under Vite development server tooling.
- 3 high severity findings: `underscore`, `jsonpath`, and `bfj`, all transitive development dependencies used by local proof/demo tooling.

These findings are not part of a production deployment path today. They affect local development/build/proof tooling, not the Soroban contracts. We did not run `npm audit fix` automatically because it can rewrite the lockfile and break reproducibility during the hackathon demo window.

Before production, replace demo tooling with pinned audited dependencies, rerun `npm audit`, and review every fix manually.
