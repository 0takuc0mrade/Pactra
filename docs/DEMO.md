# Pactra Demo

Pactra is a ZK payment firewall for autonomous agents. The demo uses the smallest clear scenario: an AI procurement agent can pay one vendor only after proving the payment follows Ada's private mandate.

Demo scenario:

- Owner: Ada Studio
- Agent: Procurement Bot
- Vendor: CloudAPI Ltd.
- Invoice: CLOUD-042
- Payment: 75 test USDC

Explain the app as three routed pages:

1. Mandate: private policy-gated payment vault for an autonomous agent.
2. Review: human-readable payment request, mandate decision, and execute controls.
3. Audit/Receipt: Groth16 public inputs, proof result, receipt, and nullifier trail.

Flow:

1. Create a private spending mandate for the agent.
2. Fund the Stellar payment vault with the demo invoice amount.
3. Generate public inputs and a proof bundle.
4. Submit the payment request through the agent console.
5. Pactra checks mandate state, nullifier freshness, and verifier approval.
6. The contract releases payment and records a receipt.

Run the local policy/proof demo:

```bash
npm run policy:demo
npm run proof:generate
npm run proof:verify
```

Run the whole local story:

```bash
npm run demo:e2e
```

Run the real circuit path after installing Circom:

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

Run contract tests:

```bash
npm run contracts:test
```

Run the frontend:

```bash
npm install
npm run dev
```
