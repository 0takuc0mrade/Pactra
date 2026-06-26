import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { expectedDemoContractInputs } from "./demoWitness";
import { formatForContract, ProofFormatError } from "./formatForContract";
import type { SnarkProof } from "./types";

const proof: SnarkProof = {
  pi_a: [
    "10695736412085993575294624301542525426234510713933580205987081023862613403757",
    "11637049629659997490404106955470238316810641204818480770922777287351372287075",
    "1"
  ],
  pi_b: [
    [
      "13529446839751295544195519730523279076661480935721881939118979225129504554971",
      "18853289000218054314378431467695691444505238336610783917117606494638022477348"
    ],
    [
      "7406291574495555015893712354587595759612354875090040365742592276173838906503",
      "7493188414426226509767305032112316683396146969523721901783857056606542679806"
    ],
    ["1", "0"]
  ],
  pi_c: [
    "10382862695680864227668060040564444284466361290636925077161459119296894171467",
    "7744266737794393986648285462467024645046076615508651362152126806616423894091",
    "1"
  ],
  protocol: "groth16",
  curve: "bn128"
};

const publicSignals = [
  "14752927588759693598377469391496122253158145592479712283008362362719378677241",
  "456",
  "750000000",
  "12857071682421828220191118955282250662181099234082405257763375572020940528709",
  "16225982488012681209965895516066057846582552413276824485619602009054418768368",
  "654"
];
const expected = expectedDemoContractInputs();

describe("formatForContract", () => {
  it("formats a valid Groth16 proof fixture to 256 bytes", () => {
    const formatted = formatForContract(proof, publicSignals, expected, 1234);

    assert.equal(formatted.proofBytes.length, 256);
    assert.equal(formatted.proofHex.length, 514);
    assert.equal(formatted.publicInputsForContract.length, 6);
    assert.equal(formatted.summary.proofByteLength, 256);
    assert.equal(formatted.summary.publicInputCount, 6);
  });

  it("fails cleanly when the proof is missing", () => {
    assert.throws(
      () => formatForContract(undefined, publicSignals, expected),
      (error) => error instanceof ProofFormatError && error.message.includes("Missing Groth16 proof")
    );
  });

  it("fails cleanly when public signal count is wrong", () => {
    assert.throws(
      () => formatForContract(proof, publicSignals.slice(0, 5), expected),
      (error) => error instanceof ProofFormatError && error.message.includes("Expected 6 public inputs")
    );
  });

  it("fails cleanly when amount is altered", () => {
    const altered = [...publicSignals];
    altered[2] = "1";

    assert.throws(
      () => formatForContract(proof, altered, expected),
      (error) => error instanceof ProofFormatError && error.message.includes("Amount public input")
    );
  });

  it("fails cleanly when invoice commitment is altered", () => {
    const altered = [...publicSignals];
    altered[3] = "1";

    assert.throws(
      () => formatForContract(proof, altered, expected),
      (error) => error instanceof ProofFormatError && error.message.includes("Invoice commitment")
    );
  });

  it("fails cleanly when mandate ID hash is altered", () => {
    const altered = [...publicSignals];
    altered[5] = "1";

    assert.throws(
      () => formatForContract(proof, altered, expected),
      (error) => error instanceof ProofFormatError && error.message.includes("Mandate ID hash")
    );
  });
});
