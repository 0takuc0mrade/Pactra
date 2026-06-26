# Pactra Demo Video Script

Target length: 2-3 minutes.

## 0:00 - Problem

AI agents are starting to act like economic actors. They can order services, pay APIs, and manage business workflows. But no company wants to hand an autonomous agent unrestricted access to funds.

The hard part is control. Humans need enforceable spending guardrails, and businesses may not want those internal rules exposed publicly.

## 0:25 - Solution

Pactra is a ZK payment firewall for autonomous agents on Stellar.

A human funds a controlled payment vault and defines a private mandate. The agent can request a payment, but Pactra only releases funds after a zero-knowledge proof shows the request obeys the hidden rule.

## 0:55 - Demo Setup

In this MVP, the mandate is intentionally simple: one approved vendor, one approved invoice, one payment, one nullifier.

The agent wants to pay a CloudAPI invoice. The policy details stay private, but the browser can generate a Groth16 proof that the request matches the mandate.

## 1:25 - Browser Proof

On the review page, we generate the Groth16 proof in the browser from the compiled Circom artifacts. The proof is formatted into the exact 256-byte payload Pactra sends to the verifier, with six public inputs.

## 1:55 - On-Chain Verification

Now the agent submits the proof to Stellar testnet through Freighter. Pactra calls the real BN254 Groth16 verifier contract on Soroban. If the proof fails, funds stay locked. If the proof passes, Pactra releases the escrowed payment.

## 2:20 - Receipt and Replay Protection

After release, Pactra records a receipt and nullifier. That nullifier prevents replay: the same proof cannot be used to pay again.

## 2:40 - Close

Pactra is private authorization for agentic payments: a ZK payment firewall for autonomous agents on Stellar.
