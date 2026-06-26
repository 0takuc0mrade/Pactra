#![no_std]

mod verifying_key;

use soroban_sdk::{
    contract, contractimpl,
    crypto::bn254::{Bn254Fr, Bn254G1Affine, Bn254G2Affine},
    Bytes, BytesN, Env, TryFromVal, Vec,
};

/// Real verifier for Pactra's one-off invoice circuit.
///
/// Expected Pactra public input order:
///
/// 1. policy_commitment
/// 2. vendor_hash
/// 3. amount
/// 4. invoice_commitment
/// 5. nullifier
/// 6. mandate_id_hash
///
/// Expected proof byte shape for the implementation pass:
///
/// ```text
/// a: G1 affine, 64 bytes
/// b: G2 affine, 128 bytes
/// c: G1 affine, 64 bytes
/// total: 256 bytes
/// ```
///
/// The implementation embeds exported Groth16 verifying-key constants for
/// `circuits/mandate.circom`, parses the proof bytes into curve points,
/// computes the public-input linear combination, and runs the pairing check.
#[contract]
pub struct Groth16VerifierContract;

#[contractimpl]
impl Groth16VerifierContract {
    pub fn verify(env: Env, proof: Bytes, public_inputs: Vec<BytesN<32>>) -> bool {
        verify_groth16(&env, proof, public_inputs)
    }
}

fn verify_groth16(env: &Env, proof: Bytes, public_inputs: Vec<BytesN<32>>) -> bool {
    if !verifying_key::GENERATED {
        return false;
    }

    if proof.len() != 256 || public_inputs.len() as usize != verifying_key::N_PUBLIC {
        return false;
    }

    if verifying_key::IC_LEN != verifying_key::N_PUBLIC + 1 {
        return false;
    }

    let a = g1_from_proof(env, &proof, 0);
    let b = g2_from_proof(env, &proof, 64);
    let c = g1_from_proof(env, &proof, 192);

    let mut points = Vec::new(env);
    let mut scalars = Vec::new(env);
    for index in 0..public_inputs.len() {
        points.push_back(g1_from_array(env, &verifying_key::IC[(index + 1) as usize]));
        scalars.push_back(Bn254Fr::from_bytes(public_inputs.get(index).unwrap()));
    }

    let input_acc = env.crypto().bn254().g1_msm(points, scalars);
    let vk_x = env
        .crypto()
        .bn254()
        .g1_add(&g1_from_array(env, &verifying_key::IC[0]), &input_acc);

    let mut g1_points = Vec::new(env);
    g1_points.push_back(-a);
    g1_points.push_back(g1_from_array(env, &verifying_key::ALPHA_1));
    g1_points.push_back(vk_x);
    g1_points.push_back(c);

    let mut g2_points = Vec::new(env);
    g2_points.push_back(b);
    g2_points.push_back(g2_from_array(env, &verifying_key::BETA_2));
    g2_points.push_back(g2_from_array(env, &verifying_key::GAMMA_2));
    g2_points.push_back(g2_from_array(env, &verifying_key::DELTA_2));

    env.crypto().bn254().pairing_check(g1_points, g2_points)
}

fn g1_from_array(env: &Env, bytes: &[u8; 64]) -> Bn254G1Affine {
    Bn254G1Affine::from_array(env, bytes)
}

fn g2_from_array(env: &Env, bytes: &[u8; 128]) -> Bn254G2Affine {
    Bn254G2Affine::from_array(env, bytes)
}

fn g1_from_proof(env: &Env, proof: &Bytes, start: u32) -> Bn254G1Affine {
    let bytes = proof.slice(start..start + 64);
    Bn254G1Affine::from_bytes(BytesN::<64>::try_from_val(env, bytes.as_val()).unwrap())
}

fn g2_from_proof(env: &Env, proof: &Bytes, start: u32) -> Bn254G2Affine {
    let bytes = proof.slice(start..start + 128);
    Bn254G2Affine::from_bytes(BytesN::<128>::try_from_val(env, bytes.as_val()).unwrap())
}

#[cfg(test)]
mod test;
#[cfg(test)]
mod test_vector;
