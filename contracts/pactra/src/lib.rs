#![no_std]

use soroban_sdk::{
    contract, contractclient, contracterror, contractevent, contractimpl, contracttype, token,
    Address, Bytes, BytesN, Env, MuxedAddress, Vec,
};

#[contractclient(name = "VerifierClient")]
pub trait Verifier {
    fn verify(env: Env, proof: Bytes, public_inputs: Vec<BytesN<32>>) -> bool;
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum PactraError {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    MandateExists = 3,
    MandateMissing = 4,
    InvalidAmount = 5,
    InvalidExpiry = 6,
    NotActive = 7,
    NotOwner = 8,
    NotAgent = 9,
    Expired = 10,
    NullifierUsed = 11,
    InsufficientEscrow = 12,
    BadPublicInputs = 13,
    ProofRejected = 14,
    InvalidProofShape = 15,
    InvalidPublicInputCount = 16,
    PublicInputMismatch = 17,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum MandateStatus {
    Active,
    Cancelled,
    Exhausted,
    Expired,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Mandate {
    pub id: BytesN<32>,
    pub owner: Address,
    pub agent: Address,
    pub token: Address,
    pub policy_commitment: BytesN<32>,
    pub funded_amount: i128,
    pub remaining_amount: i128,
    pub expires_at: u64,
    pub status: MandateStatus,
    pub created_at: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Receipt {
    pub id: BytesN<32>,
    pub mandate_id: BytesN<32>,
    pub agent: Address,
    pub vendor: Address,
    pub token: Address,
    pub amount: i128,
    pub invoice_commitment: BytesN<32>,
    pub nullifier: BytesN<32>,
    pub created_at: u64,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Initialized {
    #[topic]
    pub admin: Address,
    pub verifier: Address,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct VerifierUpdated {
    #[topic]
    pub admin: Address,
    pub verifier: Address,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MandateCreated {
    #[topic]
    pub mandate_id: BytesN<32>,
    #[topic]
    pub owner: Address,
    pub agent: Address,
    pub token: Address,
    pub funding_amount: i128,
    pub expires_at: u64,
    pub policy_commitment: BytesN<32>,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PaymentExecuted {
    #[topic]
    pub receipt_id: BytesN<32>,
    #[topic]
    pub mandate_id: BytesN<32>,
    pub agent: Address,
    pub vendor: Address,
    pub token: Address,
    pub amount: i128,
    pub invoice_commitment: BytesN<32>,
    pub nullifier: BytesN<32>,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MandateCancelled {
    #[topic]
    pub mandate_id: BytesN<32>,
    #[topic]
    pub owner: Address,
    pub refunded_amount: i128,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ProofRejected {
    #[topic]
    pub mandate_id: BytesN<32>,
    #[topic]
    pub nullifier: BytesN<32>,
}

#[contracttype]
#[derive(Clone)]
enum DataKey {
    Admin,
    Verifier,
    Mandate(BytesN<32>),
    Receipt(BytesN<32>),
    Nullifier(BytesN<32>),
}

#[contract]
pub struct PactraContract;

const GROTH16_PROOF_LEN: u32 = 256;

#[contractimpl]
impl PactraContract {
    pub fn initialize(env: Env, admin: Address, verifier: Address) -> Result<(), PactraError> {
        if env.storage().instance().has(&DataKey::Admin) {
            return Err(PactraError::AlreadyInitialized);
        }

        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Verifier, &verifier);

        Initialized { admin, verifier }.publish(&env);
        Ok(())
    }

    pub fn set_verifier(env: Env, admin: Address, verifier: Address) -> Result<(), PactraError> {
        let stored_admin = read_admin(&env)?;
        admin.require_auth();

        if admin != stored_admin {
            return Err(PactraError::NotOwner);
        }

        env.storage().instance().set(&DataKey::Verifier, &verifier);
        VerifierUpdated { admin, verifier }.publish(&env);
        Ok(())
    }

    pub fn create_mandate(
        env: Env,
        mandate_id: BytesN<32>,
        owner: Address,
        agent: Address,
        token: Address,
        policy_commitment: BytesN<32>,
        funding_amount: i128,
        expires_at: u64,
    ) -> Result<BytesN<32>, PactraError> {
        ensure_initialized(&env)?;
        owner.require_auth();

        if funding_amount <= 0 {
            return Err(PactraError::InvalidAmount);
        }

        if expires_at <= env.ledger().timestamp() {
            return Err(PactraError::InvalidExpiry);
        }

        let key = DataKey::Mandate(mandate_id.clone());
        if env.storage().persistent().has(&key) {
            return Err(PactraError::MandateExists);
        }

        let contract_address = env.current_contract_address();
        token::TokenClient::new(&env, &token).transfer(
            &owner,
            &MuxedAddress::from(contract_address.clone()),
            &funding_amount,
        );

        let mandate = Mandate {
            id: mandate_id.clone(),
            owner: owner.clone(),
            agent: agent.clone(),
            token: token.clone(),
            policy_commitment: policy_commitment.clone(),
            funded_amount: funding_amount,
            remaining_amount: funding_amount,
            expires_at,
            status: MandateStatus::Active,
            created_at: env.ledger().timestamp(),
        };

        env.storage().persistent().set(&key, &mandate);
        MandateCreated {
            mandate_id: mandate_id.clone(),
            owner,
            agent,
            token,
            funding_amount,
            expires_at,
            policy_commitment,
        }
        .publish(&env);

        Ok(mandate_id)
    }

    #[allow(clippy::too_many_arguments)]
    pub fn execute_payment(
        env: Env,
        agent: Address,
        mandate_id: BytesN<32>,
        vendor: Address,
        vendor_hash: BytesN<32>,
        amount: i128,
        amount_input: BytesN<32>,
        invoice_commitment: BytesN<32>,
        nullifier: BytesN<32>,
        mandate_id_hash: BytesN<32>,
        proof: Bytes,
        public_inputs: Vec<BytesN<32>>,
    ) -> Result<BytesN<32>, PactraError> {
        ensure_initialized(&env)?;
        agent.require_auth();

        if amount <= 0 {
            return Err(PactraError::InvalidAmount);
        }

        let key = DataKey::Mandate(mandate_id.clone());
        let mut mandate: Mandate = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(PactraError::MandateMissing)?;

        if mandate.status != MandateStatus::Active {
            return Err(PactraError::NotActive);
        }

        if mandate.agent != agent {
            return Err(PactraError::NotAgent);
        }

        if env.ledger().timestamp() > mandate.expires_at {
            mandate.status = MandateStatus::Expired;
            env.storage().persistent().set(&key, &mandate);
            return Err(PactraError::Expired);
        }

        if env
            .storage()
            .persistent()
            .has(&DataKey::Nullifier(nullifier.clone()))
        {
            return Err(PactraError::NullifierUsed);
        }

        if mandate.remaining_amount < amount {
            return Err(PactraError::InsufficientEscrow);
        }

        if proof.len() != GROTH16_PROOF_LEN {
            return Err(PactraError::InvalidProofShape);
        }

        if amount_input != amount_to_public_input(&env, amount) {
            return Err(PactraError::PublicInputMismatch);
        }

        require_public_inputs(
            &public_inputs,
            mandate.policy_commitment.clone(),
            vendor_hash,
            amount_input,
            invoice_commitment.clone(),
            nullifier.clone(),
            mandate_id_hash,
        )?;

        let verifier = read_verifier(&env)?;
        let verified = VerifierClient::new(&env, &verifier).verify(&proof, &public_inputs);
        if !verified {
            ProofRejected {
                mandate_id,
                nullifier,
            }
            .publish(&env);
            return Err(PactraError::ProofRejected);
        }

        token::TokenClient::new(&env, &mandate.token).transfer(
            &env.current_contract_address(),
            &MuxedAddress::from(vendor.clone()),
            &amount,
        );

        mandate.remaining_amount -= amount;
        if mandate.remaining_amount == 0 {
            mandate.status = MandateStatus::Exhausted;
        }
        env.storage().persistent().set(&key, &mandate);
        env.storage()
            .persistent()
            .set(&DataKey::Nullifier(nullifier.clone()), &true);

        let receipt_id = receipt_id(&env, &mandate_id, &nullifier);
        let receipt = Receipt {
            id: receipt_id.clone(),
            mandate_id: mandate_id.clone(),
            agent: agent.clone(),
            vendor: vendor.clone(),
            token: mandate.token.clone(),
            amount,
            invoice_commitment: invoice_commitment.clone(),
            nullifier: nullifier.clone(),
            created_at: env.ledger().timestamp(),
        };

        env.storage()
            .persistent()
            .set(&DataKey::Receipt(receipt_id.clone()), &receipt);
        PaymentExecuted {
            receipt_id: receipt_id.clone(),
            mandate_id,
            agent,
            vendor,
            token: mandate.token,
            amount,
            invoice_commitment,
            nullifier,
        }
        .publish(&env);

        Ok(receipt_id)
    }

    pub fn cancel_mandate(
        env: Env,
        owner: Address,
        mandate_id: BytesN<32>,
    ) -> Result<(), PactraError> {
        ensure_initialized(&env)?;
        owner.require_auth();

        let key = DataKey::Mandate(mandate_id.clone());
        let mut mandate: Mandate = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(PactraError::MandateMissing)?;

        if mandate.owner != owner {
            return Err(PactraError::NotOwner);
        }

        if mandate.status != MandateStatus::Active {
            return Err(PactraError::NotActive);
        }

        let refund = mandate.remaining_amount;
        if refund > 0 {
            token::TokenClient::new(&env, &mandate.token).transfer(
                &env.current_contract_address(),
                &MuxedAddress::from(owner.clone()),
                &refund,
            );
        }

        mandate.remaining_amount = 0;
        mandate.status = MandateStatus::Cancelled;
        env.storage().persistent().set(&key, &mandate);
        MandateCancelled {
            mandate_id,
            owner,
            refunded_amount: refund,
        }
        .publish(&env);
        Ok(())
    }

    pub fn get_mandate(env: Env, mandate_id: BytesN<32>) -> Result<Mandate, PactraError> {
        env.storage()
            .persistent()
            .get(&DataKey::Mandate(mandate_id))
            .ok_or(PactraError::MandateMissing)
    }

    pub fn get_receipt(env: Env, receipt_id: BytesN<32>) -> Result<Receipt, PactraError> {
        env.storage()
            .persistent()
            .get(&DataKey::Receipt(receipt_id))
            .ok_or(PactraError::MandateMissing)
    }

    pub fn is_nullifier_used(env: Env, nullifier: BytesN<32>) -> bool {
        env.storage()
            .persistent()
            .has(&DataKey::Nullifier(nullifier))
    }
}

fn ensure_initialized(env: &Env) -> Result<(), PactraError> {
    if !env.storage().instance().has(&DataKey::Admin) {
        return Err(PactraError::NotInitialized);
    }

    Ok(())
}

fn read_admin(env: &Env) -> Result<Address, PactraError> {
    env.storage()
        .instance()
        .get(&DataKey::Admin)
        .ok_or(PactraError::NotInitialized)
}

fn read_verifier(env: &Env) -> Result<Address, PactraError> {
    env.storage()
        .instance()
        .get(&DataKey::Verifier)
        .ok_or(PactraError::NotInitialized)
}

fn require_public_inputs(
    public_inputs: &Vec<BytesN<32>>,
    policy_commitment: BytesN<32>,
    vendor_hash: BytesN<32>,
    amount_input: BytesN<32>,
    invoice_commitment: BytesN<32>,
    nullifier: BytesN<32>,
    mandate_id_hash: BytesN<32>,
) -> Result<(), PactraError> {
    if public_inputs.len() != 6 {
        return Err(PactraError::InvalidPublicInputCount);
    }

    let expected = [
        policy_commitment,
        vendor_hash,
        amount_input,
        invoice_commitment,
        nullifier,
        mandate_id_hash,
    ];

    for (index, value) in expected.into_iter().enumerate() {
        if public_inputs.get(index as u32) != Some(value) {
            return Err(PactraError::PublicInputMismatch);
        }
    }

    Ok(())
}

fn amount_to_public_input(env: &Env, amount: i128) -> BytesN<32> {
    let mut bytes = [0u8; 32];
    bytes[16..].copy_from_slice(&(amount as u128).to_be_bytes());
    BytesN::from_array(env, &bytes)
}

fn receipt_id(env: &Env, mandate_id: &BytesN<32>, nullifier: &BytesN<32>) -> BytesN<32> {
    let mut bytes = Bytes::new(env);
    bytes.append(&Bytes::from(mandate_id.clone()));
    bytes.append(&Bytes::from(nullifier.clone()));
    env.crypto().sha256(&bytes).to_bytes()
}

#[cfg(test)]
mod fixtures;
#[cfg(test)]
mod test;
