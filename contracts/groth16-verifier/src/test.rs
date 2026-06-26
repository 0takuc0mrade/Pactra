extern crate std;

use crate::{Groth16VerifierContract, Groth16VerifierContractClient};
use crate::test_vector;
use soroban_sdk::{vec, Bytes, BytesN, Env, Vec};

fn bytes(env: &Env, value: u8) -> BytesN<32> {
    BytesN::from_array(env, &[value; 32])
}

fn valid_public_inputs(env: &Env) -> Vec<BytesN<32>> {
    let mut inputs = Vec::new(env);
    for input in test_vector::VALID_PUBLIC_INPUTS {
        inputs.push_back(BytesN::from_array(env, &input));
    }
    inputs
}

#[test]
fn valid_generated_proof_is_accepted() {
    let env = Env::default();
    let contract_id = env.register(Groth16VerifierContract, ());
    let client = Groth16VerifierContractClient::new(&env, &contract_id);
    let proof = Bytes::from_slice(&env, &test_vector::VALID_PROOF);

    assert!(client.verify(&proof, &valid_public_inputs(&env)));
}

#[test]
fn short_proof_is_rejected() {
    let env = Env::default();
    let contract_id = env.register(Groth16VerifierContract, ());
    let client = Groth16VerifierContractClient::new(&env, &contract_id);
    let public_inputs = vec![
        &env,
        bytes(&env, 1),
        bytes(&env, 2),
        bytes(&env, 3),
        bytes(&env, 4),
        bytes(&env, 5),
        bytes(&env, 6),
    ];

    assert!(!client.verify(&Bytes::from_slice(&env, &[1, 2, 3]), &public_inputs));
}

#[test]
fn invalid_well_formed_proof_is_rejected() {
    let env = Env::default();
    let contract_id = env.register(Groth16VerifierContract, ());
    let client = Groth16VerifierContractClient::new(&env, &contract_id);
    let mut invalid_proof = test_vector::VALID_PROOF;

    invalid_proof[192..256].copy_from_slice(&test_vector::VALID_PROOF[0..64]);

    assert!(!client.verify(
        &Bytes::from_slice(&env, &invalid_proof),
        &valid_public_inputs(&env)
    ));
}

#[test]
fn altered_public_input_is_rejected() {
    let env = Env::default();
    let contract_id = env.register(Groth16VerifierContract, ());
    let client = Groth16VerifierContractClient::new(&env, &contract_id);
    let mut public_inputs = valid_public_inputs(&env);
    let mut altered = test_vector::VALID_PUBLIC_INPUTS[0];

    altered[31] ^= 1;
    public_inputs.set(0, BytesN::from_array(&env, &altered));

    assert!(!client.verify(
        &Bytes::from_slice(&env, &test_vector::VALID_PROOF),
        &public_inputs
    ));
}

#[test]
fn altered_public_input_count_is_rejected() {
    let env = Env::default();
    let contract_id = env.register(Groth16VerifierContract, ());
    let client = Groth16VerifierContractClient::new(&env, &contract_id);
    let public_inputs = vec![&env, bytes(&env, 1)];

    assert!(!client.verify(&Bytes::from_slice(&env, &[0; 256]), &public_inputs));
}
