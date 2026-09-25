import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Traceit } from "../target/types/traceit";
import { expect } from "chai";
import crypto from "crypto";

describe("attestation instructions", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.Traceit as Program<Traceit>;

  const donationId = `d-attest-${Date.now().toString().slice(-6)}`;
  const cleanDonationId = donationId.replace(/-/g, "");
  const ngoId = "ngo-attest-1234-5678-90ab-cdef12345678";
  const cleanNgoId = ngoId.replace(/-/g, "");
  const ngoPublicKey = provider.wallet.publicKey.toBase58();
  const signedAt = new anchor.BN(Math.floor(Date.now() / 1000));

  const receiptMsg = `I, ${ngoId}, confirm receipt of INR 500 for donation ${donationId} on Trace-It`;
  const receiptMsgHash = crypto.createHash("sha512").update(receiptMsg).digest("hex");

  const deliveryMsg = `I, ${ngoId}, confirm delivery of goods for donation ${donationId} on Trace-It`;
  const deliveryMsgHash = crypto.createHash("sha512").update(deliveryMsg).digest("hex");
  const beneficiaryIdHash = crypto.createHash("sha512").update("beneficiary_123_secret").digest("hex");

  it("Stores NGO receipt attestation on-chain", async () => {
    const [receiptPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("attestation"),
        Buffer.from(cleanDonationId, "utf8"),
        Buffer.from(cleanNgoId, "utf8"),
        Buffer.from("receipt", "utf8"),
      ],
      program.programId
    );

    const tx = await program.methods
      .storeNgoAttestation(
        donationId,
        ngoId,
        receiptMsg,
        receiptMsgHash,
        ngoPublicKey,
        signedAt
      )
      .accounts({
        attestationAccount: receiptPda,
        authority: provider.wallet.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc({ commitment: "confirmed" });

    console.log("Receipt attestation tx:", tx);

    const account = await program.account.attestationAccount.fetch(receiptPda);
    expect(account.donationId).to.equal(donationId);
    expect(account.ngoId).to.equal(ngoId);
    expect(account.attestationType).to.equal(0); // Receipt
    expect(account.attestationMessage).to.equal(receiptMsg);
    expect(account.attestationMessageHash).to.equal(receiptMsgHash);
    expect(account.ngoPublicKey).to.equal(ngoPublicKey);
  });

  it("Stores delivery attestation on-chain (coexists with receipt attestation)", async () => {
    const [deliveryPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("attestation"),
        Buffer.from(cleanDonationId, "utf8"),
        Buffer.from(cleanNgoId, "utf8"),
        Buffer.from("delivery", "utf8"),
      ],
      program.programId
    );

    const tx = await program.methods
      .storeDeliveryAttestation(
        donationId,
        ngoId,
        beneficiaryIdHash,
        deliveryMsg,
        deliveryMsgHash,
        ngoPublicKey,
        signedAt
      )
      .accounts({
        attestationAccount: deliveryPda,
        authority: provider.wallet.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc({ commitment: "confirmed" });

    console.log("Delivery attestation tx:", tx);

    const account = await program.account.attestationAccount.fetch(deliveryPda);
    expect(account.donationId).to.equal(donationId);
    expect(account.ngoId).to.equal(ngoId);
    expect(account.attestationType).to.equal(1); // Delivery
    expect(account.beneficiaryIdHash).to.equal(beneficiaryIdHash);
    expect(account.attestationMessage).to.equal(deliveryMsg);
    expect(account.attestationMessageHash).to.equal(deliveryMsgHash);
  });
});
