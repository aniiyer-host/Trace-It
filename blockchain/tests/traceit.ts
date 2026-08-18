import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Traceit } from "../target/types/traceit";
import { expect } from "chai";
import crypto from "crypto";

describe("traceit", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.Traceit as Program<Traceit>;

  const donationId = "d1234567-89ab-cdef-0123-456789abcdef";
  const donorIdHash = crypto
    .createHash("sha512")
    .update("user123" + "test_secret")
    .digest("hex");
  const ngoId = "ngo12345-89ab-cdef-0123-456789abcdef";
  const campaignId = "camp1234-89ab-cdef-0123-456789abcdef";
  const amountPaisa = new anchor.BN(50000); // ₹500
  const currency = "INR";
  const timestamp = new anchor.BN(Math.floor(Date.now() / 1000));
  const recordHash = crypto
    .createHash("sha512")
    .update(`${donationId}${amountPaisa}${timestamp}${ngoId}`)
    .digest("hex");

  it("Records a donation on-chain", async () => {
    const cleanDonationId = donationId.replace(/-/g, '');
    const [donationPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("donation"), Buffer.from(cleanDonationId)],
      program.programId
    );

    const tx = await program.methods
      .recordDonation(
        donationId,
        donorIdHash,
        ngoId,
        campaignId,
        amountPaisa,
        currency,
        timestamp,
        recordHash
      )
      .accounts({
        authority: provider.wallet.publicKey,
      })
      .rpc({ commitment: "confirmed" });

    console.log("Transaction signature:", tx);

    const account = await program.account.donationRecord.fetch(donationPda);
    expect(account.donationId).to.equal(donationId);
    expect(account.donorIdHash).to.equal(donorIdHash);
    expect(account.ngoId).to.equal(ngoId);
    expect(account.amountPaisa.toNumber()).to.equal(50000);
    expect(account.status).to.equal(1); // SUCCESS
    expect(account.recordHash).to.equal(recordHash);
  });

  it("Prevents duplicate donation recording (idempotency)", async () => {
    const cleanDonationId = donationId.replace(/-/g, '');
    const [donationPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("donation"), Buffer.from(cleanDonationId)],
      program.programId
    );

    try {
      await program.methods
        .recordDonation(
          donationId,
          donorIdHash,
          ngoId,
          campaignId,
          amountPaisa,
          currency,
          timestamp,
          recordHash
        )
        .accounts({
          authority: provider.wallet.publicKey,
        })
        .rpc();
      expect.fail("Should have thrown — duplicate PDA");
    } catch (err: any) {
      expect(err.toString()).to.include("already in use");
    }
  });

  it("Updates donation status: SUCCESS -> ALLOCATED", async () => {
    const cleanDonationId = donationId.replace(/-/g, '');
    const [donationPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("donation"), Buffer.from(cleanDonationId)],
      program.programId
    );

    await program.methods
      .updateDonationStatus(donationId, 2) // ALLOCATED
      .accounts({
        authority: provider.wallet.publicKey,
      })
      .rpc({ commitment: "confirmed" });

    const account = await program.account.donationRecord.fetch(donationPda);
    expect(account.status).to.equal(2); // ALLOCATED
  });

  it("Rejects invalid status transition", async () => {
    const cleanDonationId = donationId.replace(/-/g, '');
    const [donationPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("donation"), Buffer.from(cleanDonationId)],
      program.programId
    );

    try {
      await program.methods
        .updateDonationStatus(donationId, 4) // Trying to jump ALLOCATED -> DELIVERED
        .accounts({
          authority: provider.wallet.publicKey,
        })
        .rpc();
      expect.fail("Should have thrown — invalid transition");
    } catch (err: any) {
      expect(err.toString()).to.include("InvalidStatusTransition");
    }
  });

  it("Rejects zero amount", async () => {
    const badDonationId = "bad-donation-id-for-zero-test-12345";
    const [donationPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("donation"), Buffer.from(badDonationId)],
      program.programId
    );

    try {
      await program.methods
        .recordDonation(
          badDonationId,
          donorIdHash,
          ngoId,
          campaignId,
          new anchor.BN(0), // Zero amount
          currency,
          timestamp,
          recordHash
        )
        .accounts({
          authority: provider.wallet.publicKey,
        })
        .rpc();
      expect.fail("Should have thrown — zero amount");
    } catch (err: any) {
      expect(err.toString()).to.include("InvalidAmount");
    }
  });
});
