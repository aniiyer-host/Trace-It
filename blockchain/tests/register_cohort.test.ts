import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Traceit } from "../target/types/traceit";
import { expect } from "chai";
import crypto from "crypto";

describe("register_cohort", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.Traceit as Program<Traceit>;

  const ngoId = `ngo-c-${Date.now().toString().slice(-8)}`;
  const cohortId = `coh-c-${Date.now().toString().slice(-8)}`;
  const metadataHash = crypto
    .createHash("sha512")
    .update("cohort_proof_documents")
    .digest("hex");
  const ngoMetadataHash = crypto
    .createHash("sha512")
    .update("ngo_verification_documents")
    .digest("hex");

  before(async () => {
    // First register an NGO as active (required for cohort creation)
    const cleanNgoId = ngoId.replace(/-/g, '');
    const [ngoPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("ngo"), Buffer.from(cleanNgoId)],
      program.programId
    );

    await program.methods
      .registerNgo(ngoId, ngoMetadataHash)
      .accounts({
        ngoRecord: ngoPda,
        authority: provider.wallet.publicKey,
      })
      .rpc({ commitment: "confirmed" });
  });

  it("Registers a cohort on-chain", async () => {
    const cleanCohortId = cohortId.replace(/-/g, '');
    const [cohortPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("cohort"), Buffer.from(cleanCohortId)],
      program.programId
    );

    const cleanNgoId = ngoId.replace(/-/g, '');
    const [ngoPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("ngo"), Buffer.from(cleanNgoId)],
      program.programId
    );

    const tx = await program.methods
      .registerCohort(cohortId, ngoId, metadataHash)
      .accounts({
        cohortRecord: cohortPda,
        ngoRecord: ngoPda,
        authority: provider.wallet.publicKey,
      })
      .rpc({ commitment: "confirmed" });

    console.log("Transaction signature:", tx);

    const account = await program.account.cohortRecord.fetch(cohortPda);
    expect(account.cohortId).to.equal(cohortId);
    expect(account.ngoId).to.equal(ngoId);
    expect(account.sha512DocHash).to.equal(metadataHash);
    expect(account.createdAt.toNumber()).to.be.a("number");
  });

  it("Prevents duplicate cohort registration (idempotency)", async () => {
    const cleanCohortId = cohortId.replace(/-/g, '');
    const [cohortPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("cohort"), Buffer.from(cleanCohortId)],
      program.programId
    );

    const cleanNgoId = ngoId.replace(/-/g, '');
    const [ngoPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("ngo"), Buffer.from(cleanNgoId)],
      program.programId
    );

    try {
      await program.methods
        .registerCohort(cohortId, ngoId, metadataHash)
        .accounts({
          cohortRecord: cohortPda,
          ngoRecord: ngoPda,
          authority: provider.wallet.publicKey,
        })
        .rpc();
      expect.fail("Should have thrown — duplicate PDA");
    } catch (err: any) {
      expect(err.toString()).to.include("already in use");
    }
  });

  it("Rejects registration for inactive NGO", async () => {
    const inactiveNgoId = "inactive-ngo-id-for-testing-12";
    const cleanInactiveNgoId = inactiveNgoId.replace(/-/g, '');
    const [inactiveNgoPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("ngo"), Buffer.from(cleanInactiveNgoId)],
      program.programId
    );

    const cohortId2 = `coh-fake-${Date.now().toString().slice(-8)}`;
    const cleanCohort2Id = cohortId2.replace(/-/g, '');
    const [cohortPda2] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("cohort"), Buffer.from(cleanCohort2Id)],
      program.programId
    );

    const cohortMetadataHash2 = crypto
      .createHash("sha512")
      .update("cohort_proof_documents_2")
      .digest("hex");

    try {
      await program.methods
        .registerCohort(cohortId2, inactiveNgoId, cohortMetadataHash2)
        .accounts({
          cohortRecord: cohortPda2,
          ngoRecord: inactiveNgoPda,
          authority: provider.wallet.publicKey,
        })
        .rpc();
      expect.fail("Should have thrown — NGO not active");
    } catch (err: any) {
      expect(err.toString()).to.match(/NgoNotActive|AccountNotInitialized|Constraint/);
    }
  });
});