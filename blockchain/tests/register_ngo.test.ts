import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Traceit } from "../target/types/traceit";
import { expect } from "chai";
import crypto from "crypto";

describe("register_ngo", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.Traceit as Program<Traceit>;

  const ngoId = `ngo-${Date.now().toString().slice(-8)}`;
  const metadataHash = crypto
    .createHash("sha512")
    .update("ngo_verification_documents")
    .digest("hex");

  it("Registers an NGO on-chain", async () => {
    const cleanNgoId = ngoId.replace(/-/g, '');
    const [ngoPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("ngo"), Buffer.from(cleanNgoId)],
      program.programId
    );

    const tx = await program.methods
      .registerNgo(ngoId, metadataHash)
      .accounts({
        ngoRecord: ngoPda,
        authority: provider.wallet.publicKey,
      })
      .rpc({ commitment: "confirmed" });

    console.log("Transaction signature:", tx);

    const account = await program.account.ngoRecord.fetch(ngoPda);
    expect(account.ngoId).to.equal(ngoId);
    expect(account.status).to.equal(1); // Active
    expect(account.metadataHash).to.equal(metadataHash);
    expect(account.registeredAt.toNumber()).to.be.a("number");
  });

  it("Prevents duplicate NGO registration (idempotency)", async () => {
    const cleanNgoId = ngoId.replace(/-/g, '');
    const [ngoPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("ngo"), Buffer.from(cleanNgoId)],
      program.programId
    );

    try {
      await program.methods
        .registerNgo(ngoId, metadataHash)
        .accounts({
          ngoRecord: ngoPda,
          authority: provider.wallet.publicKey,
        })
        .rpc();
      expect.fail("Should have thrown — duplicate PDA");
    } catch (err: any) {
      expect(err.toString()).to.include("already in use");
    }
  });

  it("Rejects inactive NGO for cohort registration (dependency test)", async () => {
    const fakeNgoId = `fake-ngo-${Date.now().toString().slice(-8)}`;
    const cleanFakeNgoId = fakeNgoId.replace(/-/g, '');
    const [fakeNgoPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("ngo"), Buffer.from(cleanFakeNgoId)],
      program.programId
    );

    const cohortId = `coh-fake-${Date.now().toString().slice(-8)}`;
    const cleanCohortId = cohortId.replace(/-/g, '');
    const [cohortPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("cohort"), Buffer.from(cleanCohortId)],
      program.programId
    );

    const cohortMetadataHash = crypto
      .createHash("sha512")
      .update("cohort_proof_documents")
      .digest("hex");

    try {
      await program.methods
        .registerCohort(cohortId, fakeNgoId, cohortMetadataHash)
        .accounts({
          cohortRecord: cohortPda,
          ngoRecord: fakeNgoPda,
          authority: provider.wallet.publicKey,
        })
        .rpc();
      expect.fail("Should have thrown — NGO not active");
    } catch (err: any) {
      expect(err.toString()).to.match(/NgoNotActive|AccountNotInitialized|Constraint/);
    }
  });
});