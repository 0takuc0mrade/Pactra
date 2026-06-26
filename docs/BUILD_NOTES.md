# Pactra Build Notes

## First Demo Policy

Keep the first demo policy scoped to a one-off invoice payment.

Position Pactra as a ZK payment firewall for autonomous agents, not as a narrow invoice escrow app. The one-off invoice is the MVP proof case for private policy-gated agent spending.

The winning MVP path is:

1. Owner creates a mandate for a specific invoice.
2. Owner funds the escrow for that mandate.
3. Agent submits one payment request for that invoice.
4. The ZK proof shows the payment satisfies the private mandate.
5. The contract verifies the proof, releases the payment, records the nullifier, and emits a receipt.

Do not model the first demo as a monthly budget spread across many payments. Cumulative private spend is a valid future direction, but it adds state and privacy complexity that is not needed for the MVP.

### Product Implications

- Position the demo around a single invoice, not recurring spend management.
- Treat the invoice commitment and nullifier as the primary replay-safety mechanism.
- The frontend should guide the user toward creating a mandate for one invoice.
- The agent console should execute one invoice payment and then show the receipt.
- The contract may still track remaining escrow balance, but the demo should not depend on private cumulative spend proofs.
- Prefer funding the first demo mandate with the invoice amount. Escrow balance tracking can remain for cancellation and test safety, but should not be presented as a monthly private budget.
- Label `contracts/mock-verifier` as development-only everywhere. The final hackathon proof path must run through the Groth16 verifier boundary.
- Keep `docs/GROTH16_VERIFIER.md` aligned with Pactra's `execute_payment` public input order whenever the circuit changes.
- Do not claim real Groth16 acceptance until `contracts/groth16-verifier/src/verifying_key.rs` has been regenerated from `verification_key.json` and the verifier tests run against generated artifacts.

### Later

Future versions can add recurring budgets, rolling windows, or private cumulative spend proofs once the one-off proof-gated payment loop is working reliably.
