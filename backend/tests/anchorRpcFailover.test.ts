import { Keypair, PublicKey, type AccountInfo } from "@solana/web3.js";
import {
  ReadFailoverAnchorChainAdapter,
  ReadFailoverAnchorTransactionVerifier,
  type AnchorChainAdapter,
  type AnchorTransactionVerifier,
} from "../src/services/anchor/index.js";

const ADDRESS = Keypair.generate().publicKey;

function chainAdapter(): jest.Mocked<AnchorChainAdapter> {
  return {
    getAccountInfo: jest.fn(),
    submitRecordAnchor: jest.fn(),
  };
}

describe("Phase 5 read-only RPC failover", () => {
  it("uses the fallback when the primary account RPC is unavailable", async () => {
    const primary = chainAdapter();
    const fallback = chainAdapter();
    const account = {
      data: Buffer.alloc(1),
      executable: false,
      lamports: 1,
      owner: PublicKey.default,
      rentEpoch: 0,
    } satisfies AccountInfo<Buffer>;
    primary.getAccountInfo.mockRejectedValue(new Error("primary unavailable"));
    fallback.getAccountInfo.mockResolvedValue(account);

    await expect(
      new ReadFailoverAnchorChainAdapter(primary, [fallback]).getAccountInfo(
        ADDRESS,
      ),
    ).resolves.toBe(account);
  });

  it("does not query a fallback after an authoritative primary read", async () => {
    const primary = chainAdapter();
    const fallback = chainAdapter();
    primary.getAccountInfo.mockResolvedValue(null);

    await expect(
      new ReadFailoverAnchorChainAdapter(primary, [fallback]).getAccountInfo(
        ADDRESS,
      ),
    ).resolves.toBeNull();
    expect(fallback.getAccountInfo).not.toHaveBeenCalled();
  });

  it("never sends a write through a fallback", async () => {
    const primary = chainAdapter();
    const fallback = chainAdapter();
    primary.submitRecordAnchor.mockRejectedValue(new Error("ambiguous send"));
    const adapter = new ReadFailoverAnchorChainAdapter(primary, [fallback]);

    await expect(
      adapter.submitRecordAnchor({} as Parameters<
        AnchorChainAdapter["submitRecordAnchor"]
      >[0]),
    ).rejects.toThrow("ambiguous send");
    expect(fallback.submitRecordAnchor).not.toHaveBeenCalled();
  });

  it("fails over transaction metadata only on transport errors", async () => {
    const primary: AnchorTransactionVerifier = {
      verifyTransaction: jest.fn().mockRejectedValue(new Error("RPC timeout")),
    };
    const fallback: AnchorTransactionVerifier = {
      verifyTransaction: jest.fn().mockResolvedValue({
        status: "CONFIRMED",
        slot: 99,
      }),
    };
    await expect(
      new ReadFailoverAnchorTransactionVerifier([
        primary,
        fallback,
      ]).verifyTransaction("signature", ADDRESS, ADDRESS),
    ).resolves.toEqual({ status: "CONFIRMED", slot: 99 });
  });

  it("does not override a primary integrity result with another RPC", async () => {
    const primary: AnchorTransactionVerifier = {
      verifyTransaction: jest.fn().mockResolvedValue({
        status: "INVALID",
        error: "wrong program",
      }),
    };
    const fallback: AnchorTransactionVerifier = {
      verifyTransaction: jest.fn(),
    };
    await expect(
      new ReadFailoverAnchorTransactionVerifier([
        primary,
        fallback,
      ]).verifyTransaction("signature", ADDRESS, ADDRESS),
    ).resolves.toMatchObject({ status: "INVALID" });
    expect(fallback.verifyTransaction).not.toHaveBeenCalled();
  });
});
