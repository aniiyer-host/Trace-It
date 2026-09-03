import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Traceit } from "../target/types/traceit";
import { expect } from "chai";
import crypto from "crypto";

describe("record_disbursement", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.Traceit as Program<Traceit>;

  const ngoId = `ngo-d-${Date.now().toString().slice(-8)}`;
  const disbursementId = `disb-d-${Date.now().toString().slice(-8)}`;
  const cohortId = `coh-d-${Date.now().toString().slice(-8)}`;
  const amountPaisa = new anchor.BN(100000); // ₹1000
  const currency = "INR";
  const timestamp = new anchor.BN(Math.floor(Date.now() / 1000));
  const transactionHash = "5EkYvDzLNNQ5pCvV3sGKWjPqEe1aaBFfF2s7UftZ9XrY"; // example sig

  const ngoMetadataHash = crypto
    .createHash("sha512")
    .update("ngo_verification_documents")
    .digest("hex");
  const cohortMetadataHash = crypto
    .createHash("sha512")
    .update("cohort_proof_documents")
    .digest("hex");

  before(async () => {
    // First register an NGO as active (required for disbursement)
    const cleanNgoId = ngoId.replace(/-/g, '');
    const [ngoPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("ngo"), Buffer.from(cleanNgoId)],
      program.programId
    );

    await program.methods
      .registerNgo(ngoId, ngoMetadataHash)
      .accountsPartial({
        ngoRecord: ngoPda,
        authority: provider.wallet.publicKey,
      })
      .rpc({ commitment: "confirmed" });

    // Then register a cohort (required for disbursement)
    const cleanCohortId = cohortId.replace(/-/g, '');
    const [cohortPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("cohort"), Buffer.from(cleanCohortId)],
      program.programId
    );

    await program.methods
      .registerCohort(cohortId, ngoId, cohortMetadataHash)
      .accountsPartial({
        cohortRecord: cohortPda,
        ngoRecord: ngoPda,
        authority: provider.wallet.publicKey,
      })
      .rpc({ commitment: "confirmed" });
  });

  it("Records a disbursement on-chain", async () => {
    const cleanDisbursementId = disbursementId.replace(/-/g, '');
    const [disbursementPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("disbursement"), Buffer.from(cleanDisbursementId)],
      program.programId
    );

    const cleanNgoId = ngoId.replace(/-/g, '');
    const [ngoPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("ngo"), Buffer.from(cleanNgoId)],
      program.programId
    );

    const tx = await program.methods
      .recordDisbursement(
        disbursementId,
        ngoId,
        cohortId,
        amountPaisa,
        currency,
        timestamp,
        transactionHash
      )
      .accountsPartial({
        disbursementRecord: disbursementPda,
        ngoRecord: ngoPda,
        authority: provider.wallet.publicKey,
      })
      .rpc({ commitment: "confirmed" });

    console.log("Transaction signature:", tx);

    const account = await program.account.disbursementRecord.fetch(disbursementPda);
    expect(account.disbursementId).to.equal(disbursementId);
    expect(account.ngoId).to.equal(ngoId);
    expect(account.cohortId).to.equal(cohortId);
    expect(account.amountPaisa.toNumber()).to.equal(100000);
    expect(account.status).to.equal(2); // Sent
    expect(account.transactionHash).to.equal(transactionHash);
    expect(account.timestamp.toNumber()).to.be.a("number");
  });

  it("Prevents duplicate disbursement registration (idempotency)", async () => {
    const cleanDisbursementId = disbursementId.replace(/-/g, '');
    const [disbursementPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("disbursement"), Buffer.from(cleanDisbursementId)],
      program.programId
    );

    const cleanNgoId = ngoId.replace(/-/g, '');
    const [ngoPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("ngo"), Buffer.from(cleanNgoId)],
      program.programId
    );

    try {
      await program.methods
        .recordDisbursement(
          disbursementId,
          ngoId,
          cohortId,
          amountPaisa,
          currency,
          timestamp,
          transactionHash
        )
        .accountsPartial({
          disbursementRecord: disbursementPda,
          ngoRecord: ngoPda,
          authority: provider.wallet.publicKey,
        })
        .rpc();
      expect.fail("Should have thrown — duplicate PDA");
    } catch (err: any) {
      expect(err.toString()).to.include("already in use");
    }
  });

  it("Rejects disbursement to inactive NGO", async () => {
    const inactiveNgoId = "inactive-ngo-id-for-testing-12";
    const cleanInactiveNgoId = inactiveNgoId.replace(/-/g, '');
    const [inactiveNgoPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("ngo"), Buffer.from(cleanInactiveNgoId)],
      program.programId
    );

    const disbursementId2 = "disb5678-89ab-cdef-0123-456789abcdef";
    const cleanDisb2Id = disbursementId2.replace(/-/g, '');
    const [disbursementPda2] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("disbursement"), Buffer.from(cleanDisb2Id)],
      program.programId
    );

    try {
      await program.methods
        .recordDisbursement(
          disbursementId2,
          inactiveNgoId,
          cohortId,
          amountPaisa,
          currency,
          timestamp,
          transactionHash
        )
        .accountsPartial({
          disbursementRecord: disbursementPda2,
          ngoRecord: inactiveNgoPda,
          authority: provider.wallet.publicKey,
        })
        .rpc();
      expect.fail("Should have thrown — NGO not active");
    } catch (err: any) {
      expect(err.toString()).to.match(/NgoNotActive|AccountNotInitialized|Constraint/);
    }
  });

  it("Rejects zero amount disbursement", async () => {
    const badDisbursementId = "bad-disb-id-for-zero-test-12";
    const cleanBadDisbId = badDisbursementId.replace(/-/g, '');
    const [badDisbursementPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("disbursement"), Buffer.from(cleanBadDisbId)],
      program.programId
    );

    const cleanNgoId = ngoId.replace(/-/g, '');
    const [ngoPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("ngo"), Buffer.from(cleanNgoId)],
      program.programId
    );

    try {
      await program.methods
        .recordDisbursement(
          badDisbursementId,
          ngoId,
          cohortId,
          new anchor.BN(0), // Zero amount
          currency,
          timestamp,
          transactionHash
        )
        .accountsPartial({
          disbursementRecord: badDisbursementPda,
          ngoRecord: ngoPda,
          authority: provider.wallet.publicKey,
        })
        .rpc();
      expect.fail("Should have thrown — zero amount");
    } catch (err: any) {
      expect(err.toString()).to.include("InvalidAmount");
    }
  });
});