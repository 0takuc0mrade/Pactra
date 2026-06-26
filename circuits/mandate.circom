pragma circom 2.1.6;

include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/comparators.circom";

template MandateCompliance(MERKLE_DEPTH) {
    signal input policy_commitment;
    signal input vendor_hash;
    signal input amount;
    signal input invoice_commitment;
    signal input nullifier;
    signal input mandate_id_hash;

    signal input max_payment;
    signal input vendor_root;
    signal input path_elements[MERKLE_DEPTH];
    signal input path_indices[MERKLE_DEPTH];
    signal input policy_salt;
    signal input invoice_secret;
    signal input policy_nonce;

    component amount_lte = LessEqThan(64);
    amount_lte.in[0] <== amount;
    amount_lte.in[1] <== max_payment;
    amount_lte.out === 1;

    component invoice_hash = Poseidon(3);
    invoice_hash.inputs[0] <== invoice_secret;
    invoice_hash.inputs[1] <== vendor_hash;
    invoice_hash.inputs[2] <== amount;
    invoice_hash.out === invoice_commitment;

    signal level_hashes[MERKLE_DEPTH + 1];
    level_hashes[0] <== vendor_hash;

    component merkle_hashes[MERKLE_DEPTH];
    signal left[MERKLE_DEPTH];
    signal right[MERKLE_DEPTH];

    for (var i = 0; i < MERKLE_DEPTH; i++) {
        path_indices[i] * (path_indices[i] - 1) === 0;

        left[i] <== level_hashes[i] + path_indices[i] * (path_elements[i] - level_hashes[i]);
        right[i] <== path_elements[i] + path_indices[i] * (level_hashes[i] - path_elements[i]);

        merkle_hashes[i] = Poseidon(2);
        merkle_hashes[i].inputs[0] <== left[i];
        merkle_hashes[i].inputs[1] <== right[i];
        level_hashes[i + 1] <== merkle_hashes[i].out;
    }

    level_hashes[MERKLE_DEPTH] === vendor_root;

    component policy_hash = Poseidon(5);
    policy_hash.inputs[0] <== max_payment;
    policy_hash.inputs[1] <== vendor_root;
    policy_hash.inputs[2] <== invoice_commitment;
    policy_hash.inputs[3] <== policy_salt;
    policy_hash.inputs[4] <== mandate_id_hash;
    policy_hash.out === policy_commitment;

    component nullifier_hash = Poseidon(3);
    nullifier_hash.inputs[0] <== policy_nonce;
    nullifier_hash.inputs[1] <== invoice_commitment;
    nullifier_hash.inputs[2] <== mandate_id_hash;
    nullifier_hash.out === nullifier;
}

component main { public [
    policy_commitment,
    vendor_hash,
    amount,
    invoice_commitment,
    nullifier,
    mandate_id_hash
] } = MandateCompliance(8);
