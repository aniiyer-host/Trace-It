import { expect } from "chai";
import { readFileSync } from "fs";
import path from "path";

describe("phase 6 legacy cutover", () => {
  const root = path.resolve(process.cwd());

  it("keeps the frozen legacy IDL identical to the reproducibly generated IDL", () => {
    const frozen = JSON.parse(
      readFileSync(path.join(root, "idl/traceit_legacy.json"), "utf8"),
    );
    const generated = JSON.parse(
      readFileSync(path.join(root, "target/idl/traceit.json"), "utf8"),
    );

    expect(frozen).to.deep.equal(generated);
  });

  it("keeps legacy business instructions out of the new anchor program", () => {
    const legacy = JSON.parse(
      readFileSync(path.join(root, "idl/traceit_legacy.json"), "utf8"),
    );
    const anchorProgram = JSON.parse(
      readFileSync(path.join(root, "idl/traceit_anchor.json"), "utf8"),
    );
    const legacyNames = legacy.instructions.map(
      (instruction: { name: string }) => instruction.name,
    );
    const anchorNames = anchorProgram.instructions.map(
      (instruction: { name: string }) => instruction.name,
    );

    expect(legacyNames).to.include.members([
      "recordDonation",
      "updateDonationStatus",
      "recordDisbursement",
      "registerNgo",
      "registerCohort",
      "storeNgoAttestation",
      "storeDeliveryAttestation",
    ]);
    expect(anchorNames).to.include.members([
      "initializeConfig",
      "recordAnchor",
      "setPaused",
      "proposeAuthority",
      "acceptAuthority",
    ]);
    expect(anchorNames).not.to.include.members(legacyNames);
  });
});
