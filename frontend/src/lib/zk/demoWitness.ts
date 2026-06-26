import type { ExpectedContractInputs, PrivateWitnessInput } from "./types";

export const DEMO_MANDATE_ID =
  "0x0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20";
export const DEMO_VENDOR_ADDRESS =
  "GAEHXMLQHOIIUDXC7ID2Z4SS2VZGPUGWGKPFJWTH7HUWE7OVT4D3UZFN";

export function createDemoWitnessInput(): PrivateWitnessInput {
  return {
    policy_commitment: "14752927588759693598377469391496122253158145592479712283008362362719378677241",
    vendor_hash: "456",
    amount: "750000000",
    invoice_commitment: "12857071682421828220191118955282250662181099234082405257763375572020940528709",
    nullifier: "16225982488012681209965895516066057846582552413276824485619602009054418768368",
    mandate_id_hash: "654",
    max_payment: "750000000",
    vendor_root: "3770500313085970198614307799983943444603828903559732335115796519673684130017",
    path_elements: ["101", "202", "303", "404", "505", "606", "707", "808"],
    path_indices: ["0", "1", "0", "1", "0", "1", "0", "1"],
    policy_salt: "111",
    invoice_secret: "222",
    policy_nonce: "333"
  };
}

export function expectedDemoContractInputs(): ExpectedContractInputs {
  const witness = createDemoWitnessInput();
  return {
    amount: witness.amount,
    invoiceCommitment: witness.invoice_commitment,
    mandateIdHash: witness.mandate_id_hash
  };
}
