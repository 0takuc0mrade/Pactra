#![no_std]

use soroban_sdk::{contract, contractimpl, Bytes, BytesN, Env, Vec};

/// Development-only verifier for escrow-flow tests.
///
/// This contract is intentionally not a ZK verifier. The hackathon proof path
/// must use `contracts/groth16-verifier` after Circom/Groth16 constants are
/// exported.
#[contract]
pub struct MockVerifierContract;

#[contractimpl]
impl MockVerifierContract {
    pub fn verify(_env: Env, proof: Bytes, public_inputs: Vec<BytesN<32>>) -> bool {
        !proof.is_empty() && public_inputs.len() == 6
    }
}
