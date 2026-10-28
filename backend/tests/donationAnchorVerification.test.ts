import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import { deriveAnchorBatch } from "../src/services/anchor/anchorProtocol.js";
import { deriveAnchorPda, deriveConfigPda, encodeRecordAnchorInstruction } from "../src/services/anchor/anchorCodec.js";
import { checkBatchRoot, verifyPersistedAnchor, verifiedAnchorExplorerUrl } from "../src/services/integrity/donationAnchorVerification.js";

const payloadHashes = ["1".repeat(128), "2".repeat(128)];
const batchValues = deriveAnchorBatch(12n, payloadHashes);
const PROGRAM_ID = new PublicKey("3CLytt82BKNwqMQA7M9fqJrMAhgD5t9dpuDC4TwutVFa");
const TEST_SIGNATURE = encodeBase58(Buffer.alloc(64, 7));
const batch = {
  id: "batch-1",
  batchKey: Buffer.from(batchValues.batchKey).toString("hex"),
  auditRoot: Buffer.from(batchValues.auditRoot).toString("hex"),
  startSequence: 12n,
  endSequence: 13n,
  eventCount: 2,
  status: "CONFIRMED",
  solanaTxSignature: TEST_SIGNATURE,
  anchorPda: deriveAnchorPda(PROGRAM_ID, batchValues.batchKey).toBase58(),
};
const events = payloadHashes.map((payloadHash, index) => ({
  id: 12n + BigInt(index),
  payloadHash,
  eventType: "DONATION_SUCCESS",
  entityType: "Donation",
  entityId: "02468100-6f1a-44a1-b3b1-87ba538a00b8",
  amountInr: "250.00",
  ngoId: "12468100-6f1a-44a1-b3b1-87ba538a00b8",
  campaignId: null,
  occurredAt: new Date("2026-10-15T00:00:00.000Z"),
  canonicalPayload: "{}",
  previous_hash: null,
  chainHash: null,
  anchorBatchId: "batch-1",
}));

function encodeBase58(input: Buffer): string {
  let number = BigInt(`0x${input.toString("hex")}`);
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let encoded = "";
  while (number > 0n) { encoded = alphabet[Number(number % 58n)] + encoded; number /= 58n; }
  const zeroes = input.toString("hex").match(/^(?:00)*/)?.[0].length ?? 0;
  return "1".repeat(zeroes / 2) + encoded;
}

describe("persisted anchor batch root verification", () => {
  it("builds an Explorer URL only after every relevant integrity check passes", () => {
    const verification = {
      provenance: { status: "PASSED" },
      batchRoot: { status: "PASSED" },
      anchorStatus: "CONFIRMED",
      onChainRecord: { status: "PASSED" },
      transaction: { status: "PASSED" },
      attestationSignature: { status: "UNAVAILABLE" },
    } as const;
    expect(verifiedAnchorExplorerUrl(TEST_SIGNATURE, verification, (signature) => `https://explorer.solana.com/tx/${signature}?cluster=devnet`))
      .toBe(`https://explorer.solana.com/tx/${TEST_SIGNATURE}?cluster=devnet`);
    expect(verifiedAnchorExplorerUrl(null, verification, () => "fake")).toBeNull();
  });

  it("does not build Explorer links for pending or unavailable verification", () => {
    const verification = {
      provenance: { status: "PASSED" },
      batchRoot: { status: "PASSED" },
      anchorStatus: "PENDING",
      onChainRecord: { status: "PENDING" },
      transaction: { status: "UNAVAILABLE" },
      attestationSignature: { status: "UNAVAILABLE" },
    } as const;
    const buildUrl = jest.fn(() => "fake");
    expect(verifiedAnchorExplorerUrl(TEST_SIGNATURE, verification, buildUrl)).toBeNull();
    expect(buildUrl).not.toHaveBeenCalled();
  });

  it("recomputes the root and batch key from the linked ordered event hashes", () => {
    expect(checkBatchRoot(batch, events)).toEqual({ status: "PASSED" });
  });

  it("fails closed when the stored root does not match the linked events", () => {
    expect(checkBatchRoot({ ...batch, auditRoot: "f".repeat(128) }, events)).toMatchObject({
      status: "FAILED",
      reason: expect.stringContaining("does not match"),
    });
  });

  it("fails closed when the sequence is not contiguous", () => {
    expect(checkBatchRoot(batch, [events[0], { ...events[1], id: 14n }])).toMatchObject({
      status: "FAILED",
      reason: expect.stringContaining("sequence"),
    });
  });

  it("reports missing linked events as a verification failure", () => {
    expect(checkBatchRoot(batch, [])).toMatchObject({ status: "FAILED" });
  });

  it("does not call an absent RPC configuration verified", async () => {
    await expect(verifyPersistedAnchor(batch, events, null)).resolves.toMatchObject({
      batchRoot: { status: "PASSED" },
      onChainRecord: { status: "UNAVAILABLE" },
      transaction: { status: "UNAVAILABLE" },
    });
  });

  it("fails when Trace-It's stored PDA does not derive from the batch key", async () => {
    const chain = {
      service: { deriveAnchorPda: jest.fn().mockReturnValue(deriveAnchorPda(PROGRAM_ID, batchValues.batchKey)) },
    };
    await expect(verifyPersistedAnchor({ ...batch, anchorPda: "different-pda" }, events, chain as never)).resolves.toMatchObject({
      batchRoot: { status: "PASSED" },
      onChainRecord: { status: "FAILED" },
      transaction: { status: "NOT_APPLICABLE" },
    });
    expect(chain.service.deriveAnchorPda).toHaveBeenCalledTimes(1);
  });

  it("checks a finalized transaction contains the exact matching anchor instruction", async () => {
    const programId = PROGRAM_ID;
    const authority = Keypair.generate().publicKey;
    const anchorPda = deriveAnchorPda(programId, batchValues.batchKey);
    const instructionData = encodeRecordAnchorInstruction(batchValues);
    const connection = {
      getSignatureStatuses: jest.fn().mockResolvedValue({ value: [{ err: null, confirmationStatus: "finalized" }] }),
      getTransaction: jest.fn().mockResolvedValue({
        transaction: {
          signatures: [TEST_SIGNATURE],
          message: {
            staticAccountKeys: [authority, deriveConfigPda(programId), deriveAnchorPda(programId, batchValues.batchKey), SystemProgram.programId, programId],
            header: { numRequiredSignatures: 1 },
            compiledInstructions: [{ programIdIndex: 4, accountKeyIndexes: [1, 2, 0, 3], data: instructionData }],
          },
        },
        meta: { err: null },
      }),
    };
    const chain = {
      connection,
      authority,
      programId,
      service: {
        deriveAnchorPda: jest.fn().mockReturnValue(anchorPda),
        verifyAnchorRecord: jest.fn().mockResolvedValue({ status: "CONFIRMED", pda: anchorPda.toBase58() }),
      },
    };

    await expect(verifyPersistedAnchor(batch, events, chain as never)).resolves.toMatchObject({
      batchRoot: { status: "PASSED" },
      onChainRecord: { status: "PASSED" },
      transaction: { status: "PASSED" },
    });
    expect(connection.getSignatureStatuses).toHaveBeenCalledWith([TEST_SIGNATURE], { searchTransactionHistory: true });
  });

  it('rejects an unrelated finalized transaction even when its signature is present', async () => {
    const authority = Keypair.generate().publicKey;
    const anchorPda = deriveAnchorPda(PROGRAM_ID, batchValues.batchKey);
    const connection = {
      getSignatureStatuses: jest.fn().mockResolvedValue({ value: [{ err: null, confirmationStatus: 'finalized' }] }),
      getTransaction: jest.fn().mockResolvedValue({
        transaction: {
          signatures: [TEST_SIGNATURE],
          message: {
            staticAccountKeys: [authority, deriveConfigPda(PROGRAM_ID), anchorPda, SystemProgram.programId, PROGRAM_ID],
            header: { numRequiredSignatures: 1 },
            compiledInstructions: [{
              programIdIndex: 4,
              accountKeyIndexes: [1, 2, 0, 3],
              data: encodeRecordAnchorInstruction({ ...batchValues, auditRoot: Buffer.alloc(64, 9) }),
            }],
          },
        },
        meta: { err: null },
      }),
    };
    const chain = {
      connection,
      authority,
      programId: PROGRAM_ID,
      service: {
        deriveAnchorPda: jest.fn().mockReturnValue(anchorPda),
        verifyAnchorRecord: jest.fn().mockResolvedValue({ status: 'CONFIRMED', pda: anchorPda.toBase58() }),
      },
    };
    await expect(verifyPersistedAnchor(batch, events, chain as never)).resolves.toMatchObject({
      onChainRecord: { status: 'PASSED' },
      transaction: { status: 'FAILED', reason: expect.stringContaining('expected anchor instruction') },
    });
  });

  it('resolves versioned instruction accounts through loaded addresses', async () => {
    const authority = Keypair.generate().publicKey;
    const configPda = deriveConfigPda(PROGRAM_ID);
    const anchorPda = deriveAnchorPda(PROGRAM_ID, batchValues.batchKey);
    const connection = {
      getSignatureStatuses: jest.fn().mockResolvedValue({ value: [{ err: null, confirmationStatus: 'finalized' }] }),
      getTransaction: jest.fn().mockResolvedValue({
        transaction: {
          signatures: [TEST_SIGNATURE],
          message: {
            staticAccountKeys: [authority, SystemProgram.programId, PROGRAM_ID],
            header: { numRequiredSignatures: 1 },
            compiledInstructions: [{
              programIdIndex: 2,
              accountKeyIndexes: [4, 3, 0, 1],
              data: encodeRecordAnchorInstruction(batchValues),
            }],
          },
        },
        meta: { err: null, loadedAddresses: { writable: [anchorPda], readonly: [configPda] } },
      }),
    };
    const chain = {
      connection,
      authority,
      programId: PROGRAM_ID,
      service: {
        deriveAnchorPda: jest.fn().mockReturnValue(anchorPda),
        verifyAnchorRecord: jest.fn().mockResolvedValue({ status: 'CONFIRMED', pda: anchorPda.toBase58() }),
      },
    };
    await expect(verifyPersistedAnchor(batch, events, chain as never)).resolves.toMatchObject({
      onChainRecord: { status: 'PASSED' },
      transaction: { status: 'PASSED' },
    });
  });

  it("reports RPC failures as unavailable instead of a negative integrity result", async () => {
    const programId = PROGRAM_ID;
    const connection = {
      getSignatureStatuses: jest.fn().mockRejectedValue(new Error("provider unavailable")),
      getTransaction: jest.fn(),
    };
    const chain = {
      connection,
      authority: Keypair.generate().publicKey,
      programId,
      service: {
        deriveAnchorPda: jest.fn().mockReturnValue(deriveAnchorPda(programId, batchValues.batchKey)),
        verifyAnchorRecord: jest.fn().mockResolvedValue({ status: "CONFIRMED", pda: deriveAnchorPda(programId, batchValues.batchKey).toBase58() }),
      },
    };
    await expect(verifyPersistedAnchor(batch, events, chain as never)).resolves.toMatchObject({
      onChainRecord: { status: "PASSED" },
      transaction: { status: "UNAVAILABLE" },
    });
  });
});
