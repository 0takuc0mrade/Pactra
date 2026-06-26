extern crate std;

use crate::{
    fixtures::valid_groth16_proof as groth16_fixture, MandateCancelled, MandateCreated,
    PactraContract, PactraContractClient, PaymentExecuted,
};
use groth16_verifier::{Groth16VerifierContract, Groth16VerifierContractClient};
use mock_verifier::MockVerifierContract;
use soroban_sdk::{
    testutils::{Address as _, Events as _, Ledger},
    token, vec, Address, Bytes, BytesN, Env, Event,
};

struct Fixture {
    env: Env,
    client: PactraContractClient<'static>,
    contract_id: Address,
    verifier_id: Address,
    token_client: token::StellarAssetClient<'static>,
    owner: Address,
    agent: Address,
    vendor: Address,
    token: Address,
    mandate_id: BytesN<32>,
    policy_commitment: BytesN<32>,
    vendor_hash: BytesN<32>,
    amount_input: BytesN<32>,
    invoice_commitment: BytesN<32>,
    nullifier: BytesN<32>,
    mandate_id_hash: BytesN<32>,
}

fn bytes(env: &Env, value: u8) -> BytesN<32> {
    BytesN::from_array(env, &[value; 32])
}

fn bytes_from_array(env: &Env, value: &[u8; 32]) -> BytesN<32> {
    BytesN::from_array(env, value)
}

fn amount_input(env: &Env, amount: i128) -> BytesN<32> {
    let mut bytes = [0u8; 32];
    bytes[16..].copy_from_slice(&(amount as u128).to_be_bytes());
    BytesN::from_array(env, &bytes)
}

fn fixture() -> Fixture {
    fixture_with_mock_verifier()
}

fn fixture_with_mock_verifier() -> Fixture {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set_timestamp(1_700_000_000);

    let admin = Address::generate(&env);
    let owner = Address::generate(&env);
    let agent = Address::generate(&env);
    let vendor = Address::generate(&env);

    let token = env
        .register_stellar_asset_contract_v2(admin.clone())
        .address();
    let token_client = token::StellarAssetClient::new(&env, &token);
    token_client.mint(&owner, &1_000);

    let verifier_id = env.register(MockVerifierContract, ());
    fixture_with_verifier(
        env,
        admin,
        owner,
        agent,
        vendor,
        token,
        token_client,
        verifier_id,
    )
}

fn fixture_with_groth16_verifier() -> Fixture {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set_timestamp(1_700_000_000);

    let admin = Address::generate(&env);
    let owner = Address::generate(&env);
    let agent = Address::generate(&env);
    let vendor = Address::generate(&env);

    let token = env
        .register_stellar_asset_contract_v2(admin.clone())
        .address();
    let token_client = token::StellarAssetClient::new(&env, &token);
    token_client.mint(&owner, &1_000);

    let verifier_id = env.register(Groth16VerifierContract, ());
    fixture_with_verifier(
        env,
        admin,
        owner,
        agent,
        vendor,
        token,
        token_client,
        verifier_id,
    )
}

fn fixture_with_verifier(
    env: Env,
    admin: Address,
    owner: Address,
    agent: Address,
    vendor: Address,
    token: Address,
    token_client: token::StellarAssetClient<'static>,
    verifier_id: Address,
) -> Fixture {
    let contract_id = env.register(PactraContract, ());
    let client = PactraContractClient::new(&env, &contract_id);
    client.initialize(&admin, &verifier_id);

    let mandate_id = bytes(&env, 1);
    let policy_commitment = bytes(&env, 2);
    client.create_mandate(
        &mandate_id,
        &owner,
        &agent,
        &token,
        &policy_commitment,
        &750,
        &1_800_000_000,
    );

    let vendor_hash = bytes(&env, 3);
    let amount_input = amount_input(&env, 750);
    let invoice_commitment = bytes(&env, 5);
    let nullifier = bytes(&env, 6);
    let mandate_id_hash = bytes(&env, 7);

    Fixture {
        env,
        client,
        contract_id,
        verifier_id,
        token_client,
        owner,
        agent,
        vendor,
        token,
        mandate_id,
        policy_commitment,
        vendor_hash,
        amount_input,
        invoice_commitment,
        nullifier,
        mandate_id_hash,
    }
}

fn fixture_with_real_groth16_proof() -> Fixture {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set_timestamp(1_700_000_000);

    let admin = Address::generate(&env);
    let owner = Address::generate(&env);
    let agent = Address::generate(&env);
    let vendor = Address::generate(&env);

    let token = env
        .register_stellar_asset_contract_v2(admin.clone())
        .address();
    let token_client = token::StellarAssetClient::new(&env, &token);
    token_client.mint(&owner, &(groth16_fixture::AMOUNT * 2));

    let verifier_id = env.register(Groth16VerifierContract, ());
    let contract_id = env.register(PactraContract, ());
    let client = PactraContractClient::new(&env, &contract_id);
    client.initialize(&admin, &verifier_id);

    let mandate_id = bytes_from_array(&env, &groth16_fixture::MANDATE_ID);
    let policy_commitment = bytes_from_array(&env, &groth16_fixture::POLICY_COMMITMENT);
    client.create_mandate(
        &mandate_id,
        &owner,
        &agent,
        &token,
        &policy_commitment,
        &(groth16_fixture::AMOUNT * 2),
        &1_800_000_000,
    );

    let vendor_hash = bytes_from_array(&env, &groth16_fixture::VENDOR_HASH);
    let amount_input = bytes_from_array(&env, &groth16_fixture::AMOUNT_INPUT);
    let invoice_commitment = bytes_from_array(&env, &groth16_fixture::INVOICE_COMMITMENT);
    let nullifier = bytes_from_array(&env, &groth16_fixture::NULLIFIER);
    let mandate_id_hash = bytes_from_array(&env, &groth16_fixture::MANDATE_ID_HASH);

    Fixture {
        env,
        client,
        contract_id,
        verifier_id,
        token_client,
        owner,
        agent,
        vendor,
        token,
        mandate_id,
        policy_commitment,
        vendor_hash,
        amount_input,
        invoice_commitment,
        nullifier,
        mandate_id_hash,
    }
}

fn public_inputs(f: &Fixture) -> soroban_sdk::Vec<BytesN<32>> {
    vec![
        &f.env,
        f.policy_commitment.clone(),
        f.vendor_hash.clone(),
        f.amount_input.clone(),
        f.invoice_commitment.clone(),
        f.nullifier.clone(),
        f.mandate_id_hash.clone(),
    ]
}

fn real_groth16_proof(env: &Env) -> Bytes {
    Bytes::from_slice(env, &groth16_fixture::PROOF)
}

fn mock_proof(env: &Env) -> Bytes {
    Bytes::from_slice(env, &[1; 256])
}

fn invalid_well_formed_groth16_proof(env: &Env) -> Bytes {
    let mut proof = groth16_fixture::PROOF;
    proof[192..256].copy_from_slice(&groth16_fixture::PROOF[0..64]);
    Bytes::from_slice(env, &proof)
}

fn contract_emitted(f: &Fixture, event: soroban_sdk::xdr::ContractEvent) -> bool {
    let events = f.env.events().all().filter_by_contract(&f.contract_id);
    events.events().contains(&event)
}

#[test]
fn valid_proof_releases_payment_and_records_nullifier() {
    let f = fixture();
    let public_inputs = public_inputs(&f);

    let receipt_id = f.client.execute_payment(
        &f.agent,
        &f.mandate_id,
        &f.vendor,
        &f.vendor_hash,
        &750,
        &f.amount_input,
        &f.invoice_commitment,
        &f.nullifier,
        &f.mandate_id_hash,
        &mock_proof(&f.env),
        &public_inputs,
    );

    let event = PaymentExecuted {
        receipt_id: receipt_id.clone(),
        mandate_id: f.mandate_id.clone(),
        agent: f.agent.clone(),
        vendor: f.vendor.clone(),
        token: f.token.clone(),
        amount: 750,
        invoice_commitment: f.invoice_commitment.clone(),
        nullifier: f.nullifier.clone(),
    };
    assert!(contract_emitted(&f, event.to_xdr(&f.env, &f.contract_id)));

    assert!(f.client.is_nullifier_used(&f.nullifier));
    assert_eq!(f.token_client.balance(&f.vendor), 750);
    assert_eq!(f.client.get_receipt(&receipt_id).amount, 750);
}

#[test]
fn real_groth16_proof_releases_payment_and_records_receipt() {
    let f = fixture_with_real_groth16_proof();
    let public_inputs = public_inputs(&f);
    let proof = real_groth16_proof(&f.env);
    let verifier_client = Groth16VerifierContractClient::new(&f.env, &f.verifier_id);

    assert!(verifier_client.verify(&proof, &public_inputs));
    assert_eq!(
        f.token_client.balance(&f.contract_id),
        groth16_fixture::AMOUNT * 2
    );

    let receipt_id = f.client.execute_payment(
        &f.agent,
        &f.mandate_id,
        &f.vendor,
        &f.vendor_hash,
        &groth16_fixture::AMOUNT,
        &f.amount_input,
        &f.invoice_commitment,
        &f.nullifier,
        &f.mandate_id_hash,
        &proof,
        &public_inputs,
    );

    let event = PaymentExecuted {
        receipt_id: receipt_id.clone(),
        mandate_id: f.mandate_id.clone(),
        agent: f.agent.clone(),
        vendor: f.vendor.clone(),
        token: f.token.clone(),
        amount: groth16_fixture::AMOUNT,
        invoice_commitment: f.invoice_commitment.clone(),
        nullifier: f.nullifier.clone(),
    };

    assert!(contract_emitted(&f, event.to_xdr(&f.env, &f.contract_id)));

    let mandate = f.client.get_mandate(&f.mandate_id);
    let receipt = f.client.get_receipt(&receipt_id);
    assert_eq!(f.token_client.balance(&f.vendor), groth16_fixture::AMOUNT);
    assert_eq!(f.token_client.balance(&f.contract_id), groth16_fixture::AMOUNT);
    assert_eq!(mandate.remaining_amount, groth16_fixture::AMOUNT);
    assert!(f.client.is_nullifier_used(&f.nullifier));
    assert_eq!(receipt.amount, groth16_fixture::AMOUNT);
    assert_eq!(receipt.invoice_commitment, f.invoice_commitment);
    assert_eq!(receipt.nullifier, f.nullifier);
}

#[test]
fn invalid_proof_does_not_release_payment() {
    let f = fixture();
    let public_inputs = public_inputs(&f);

    let result = f.client.try_execute_payment(
        &f.agent,
        &f.mandate_id,
        &f.vendor,
        &f.vendor_hash,
        &750,
        &f.amount_input,
        &f.invoice_commitment,
        &f.nullifier,
        &f.mandate_id_hash,
        &Bytes::new(&f.env),
        &public_inputs,
    );

    assert!(result.is_err());
    assert_eq!(f.token_client.balance(&f.vendor), 0);
}

#[test]
fn real_groth16_valid_proof_with_altered_amount_does_not_release_payment() {
    let f = fixture_with_real_groth16_proof();
    let public_inputs = public_inputs(&f);
    let result = f.client.try_execute_payment(
        &f.agent,
        &f.mandate_id,
        &f.vendor,
        &f.vendor_hash,
        &(groth16_fixture::AMOUNT + 1),
        &f.amount_input,
        &f.invoice_commitment,
        &f.nullifier,
        &f.mandate_id_hash,
        &real_groth16_proof(&f.env),
        &public_inputs,
    );

    assert!(result.is_err());
    assert_eq!(f.token_client.balance(&f.vendor), 0);
    assert!(!f.client.is_nullifier_used(&f.nullifier));
}

#[test]
fn real_groth16_valid_proof_with_altered_invoice_commitment_does_not_release_payment() {
    let f = fixture_with_real_groth16_proof();
    let public_inputs = public_inputs(&f);
    let mut altered_invoice = groth16_fixture::INVOICE_COMMITMENT;
    altered_invoice[31] ^= 1;
    let result = f.client.try_execute_payment(
        &f.agent,
        &f.mandate_id,
        &f.vendor,
        &f.vendor_hash,
        &groth16_fixture::AMOUNT,
        &f.amount_input,
        &BytesN::from_array(&f.env, &altered_invoice),
        &f.nullifier,
        &f.mandate_id_hash,
        &real_groth16_proof(&f.env),
        &public_inputs,
    );

    assert!(result.is_err());
    assert_eq!(f.token_client.balance(&f.vendor), 0);
    assert!(!f.client.is_nullifier_used(&f.nullifier));
}

#[test]
fn real_groth16_valid_proof_with_altered_mandate_id_hash_does_not_release_payment() {
    let f = fixture_with_real_groth16_proof();
    let public_inputs = public_inputs(&f);
    let mut altered_mandate_id_hash = groth16_fixture::MANDATE_ID_HASH;
    altered_mandate_id_hash[31] ^= 1;
    let result = f.client.try_execute_payment(
        &f.agent,
        &f.mandate_id,
        &f.vendor,
        &f.vendor_hash,
        &groth16_fixture::AMOUNT,
        &f.amount_input,
        &f.invoice_commitment,
        &f.nullifier,
        &BytesN::from_array(&f.env, &altered_mandate_id_hash),
        &real_groth16_proof(&f.env),
        &public_inputs,
    );

    assert!(result.is_err());
    assert_eq!(f.token_client.balance(&f.vendor), 0);
    assert!(!f.client.is_nullifier_used(&f.nullifier));
}

#[test]
fn real_groth16_replay_with_same_nullifier_does_not_release_payment() {
    let f = fixture_with_real_groth16_proof();
    let public_inputs = public_inputs(&f);
    let proof = real_groth16_proof(&f.env);

    f.client.execute_payment(
        &f.agent,
        &f.mandate_id,
        &f.vendor,
        &f.vendor_hash,
        &groth16_fixture::AMOUNT,
        &f.amount_input,
        &f.invoice_commitment,
        &f.nullifier,
        &f.mandate_id_hash,
        &proof,
        &public_inputs,
    );

    let result = f.client.try_execute_payment(
        &f.agent,
        &f.mandate_id,
        &f.vendor,
        &f.vendor_hash,
        &groth16_fixture::AMOUNT,
        &f.amount_input,
        &f.invoice_commitment,
        &f.nullifier,
        &f.mandate_id_hash,
        &proof,
        &public_inputs,
    );

    assert!(result.is_err());
    assert_eq!(f.token_client.balance(&f.vendor), groth16_fixture::AMOUNT);
}

#[test]
fn real_groth16_malformed_proof_shape_does_not_release_payment() {
    let f = fixture_with_real_groth16_proof();
    let public_inputs = public_inputs(&f);
    let result = f.client.try_execute_payment(
        &f.agent,
        &f.mandate_id,
        &f.vendor,
        &f.vendor_hash,
        &groth16_fixture::AMOUNT,
        &f.amount_input,
        &f.invoice_commitment,
        &f.nullifier,
        &f.mandate_id_hash,
        &Bytes::from_slice(&f.env, &[1, 2, 3]),
        &public_inputs,
    );

    assert!(result.is_err());
    assert_eq!(f.token_client.balance(&f.vendor), 0);
    assert!(!f.client.is_nullifier_used(&f.nullifier));
}

#[test]
fn real_groth16_invalid_well_formed_proof_does_not_release_payment() {
    let f = fixture_with_real_groth16_proof();
    let public_inputs = public_inputs(&f);
    let result = f.client.try_execute_payment(
        &f.agent,
        &f.mandate_id,
        &f.vendor,
        &f.vendor_hash,
        &groth16_fixture::AMOUNT,
        &f.amount_input,
        &f.invoice_commitment,
        &f.nullifier,
        &f.mandate_id_hash,
        &invalid_well_formed_groth16_proof(&f.env),
        &public_inputs,
    );

    assert!(result.is_err());
    assert_eq!(f.token_client.balance(&f.vendor), 0);
    assert!(!f.client.is_nullifier_used(&f.nullifier));
}

#[test]
fn reused_nullifier_is_rejected() {
    let f = fixture();
    let public_inputs = public_inputs(&f);

    f.client.execute_payment(
        &f.agent,
        &f.mandate_id,
        &f.vendor,
        &f.vendor_hash,
        &750,
        &f.amount_input,
        &f.invoice_commitment,
        &f.nullifier,
        &f.mandate_id_hash,
        &mock_proof(&f.env),
        &public_inputs,
    );

    let result = f.client.try_execute_payment(
        &f.agent,
        &f.mandate_id,
        &f.vendor,
        &f.vendor_hash,
        &1,
        &f.amount_input,
        &f.invoice_commitment,
        &f.nullifier,
        &f.mandate_id_hash,
        &mock_proof(&f.env),
        &public_inputs,
    );

    assert!(result.is_err());
}

#[test]
fn mandate_created_event_is_emitted() {
    let f = fixture();
    let event = MandateCreated {
        mandate_id: f.mandate_id.clone(),
        owner: f.owner.clone(),
        agent: f.agent.clone(),
        token: f.token.clone(),
        funding_amount: 750,
        expires_at: 1_800_000_000,
        policy_commitment: f.policy_commitment.clone(),
    };

    assert!(contract_emitted(&f, event.to_xdr(&f.env, &f.contract_id)));
}

#[test]
fn mandate_cancelled_event_is_emitted() {
    let f = fixture();
    f.client.cancel_mandate(&f.owner, &f.mandate_id);

    let event = MandateCancelled {
        mandate_id: f.mandate_id.clone(),
        owner: f.owner.clone(),
        refunded_amount: 750,
    };

    assert!(contract_emitted(&f, event.to_xdr(&f.env, &f.contract_id)));
}

#[test]
fn groth16_verifier_blocks_release_for_invalid_proof() {
    let f = fixture_with_groth16_verifier();
    let public_inputs = public_inputs(&f);

    let result = f.client.try_execute_payment(
        &f.agent,
        &f.mandate_id,
        &f.vendor,
        &f.vendor_hash,
        &750,
        &f.amount_input,
        &f.invoice_commitment,
        &f.nullifier,
        &f.mandate_id_hash,
        &Bytes::from_slice(&f.env, &[1]),
        &public_inputs,
    );

    assert!(result.is_err());
    assert_eq!(f.token_client.balance(&f.vendor), 0);
    assert!(!f.client.is_nullifier_used(&f.nullifier));
}
