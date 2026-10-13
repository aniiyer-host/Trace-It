import crypto from "crypto";
import {
  Keypair,
  PublicKey,
  type AccountInfo,
  type Connection,
} from "@solana/web3.js";
import {
  ANCHOR_RECORD_DISCRIMINATOR,
  AnchorAdapterError,
  AnchorService,
  SolanaAnchorAdapter,
  deriveAnchorPda,
  encodeRecordAnchorInstruction,
  type AnchorBatch,
  type AnchorChainAdapter,
  type AnchorRecord,
} from "../src/services/anchor/index.js";

const PROGRAM_ID = new PublicKey(
  "4qLwniS2NeDrqftgb83GbYVHWVbBBbUcjDR1Ncm5GCHX",
);
const AUTHORITY = Keypair.generate();
const RPC_URL = "http://127.0.0.1:8899";

function hash(label: string, length: number): Uint8Array {
  return Uint8Array.from(
    crypto.createHash("sha512").update(label).digest().subarray(0, length),
  );
}

function batch(overrides: Partial<AnchorBatch> = {}): AnchorBatch {
  return {
    batchKey: hash("batch-key", 32),
    auditRoot: hash("audit-root", 64),
    startSequence: 42n,
    endSequence: 44n,
    eventCount: 3,
    schemaVersion: 1,
    ...overrides,
  };
}

function encodeAccount(
  value: AnchorBatch,
  overrides: Partial<AnchorRecord> = {},
): Buffer {
  const record: AnchorRecord = {
    ...value,
    authority: AUTHORITY.publicKey,
    anchoredAt: 1_700_000_000n,
    bump: PublicKey.findProgramAddressSync(
      [Buffer.from("anchor"), Buffer.from(value.batchKey)],
      PROGRAM_ID,
    )[1],
    ...overrides,
  };
  const data = Buffer.alloc(167);
  let offset = 0;
  ANCHOR_RECORD_DISCRIMINATOR.copy(data, offset);
  offset += 8;
  Buffer.from(record.batchKey).copy(data, offset);
  offset += 32;
  Buffer.from(record.auditRoot).copy(data, offset);
  offset += 64;
  data.writeBigUInt64LE(record.startSequence, offset);
  offset += 8;
  data.writeBigUInt64LE(record.endSequence, offset);
  offset += 8;
  data.writeUInt32LE(record.eventCount, offset);
  offset += 4;
  data.writeUInt16LE(record.schemaVersion, offset);
  offset += 2;
  record.authority.toBuffer().copy(data, offset);
  offset += 32;
  data.writeBigInt64LE(record.anchoredAt, offset);
  offset += 8;
  data.writeUInt8(record.bump, offset);
  return data;
}

function accountInfo(
  data: Buffer,
  owner: PublicKey = PROGRAM_ID,
): AccountInfo<Buffer> {
  return {
    data,
    owner,
    executable: false,
    lamports: 2_100_000,
    rentEpoch: 0,
  };
}

function adapterMock(): jest.Mocked<AnchorChainAdapter> {
  return {
    getAccountInfo: jest.fn(),
    submitRecordAnchor: jest.fn(),
  };
}

function service(adapter: AnchorChainAdapter, cluster: "localnet" | "devnet" = "localnet") {
  return new AnchorService(adapter, {
    programId: PROGRAM_ID,
    authority: AUTHORITY.publicKey,
    cluster,
    rpcUrl: RPC_URL,
  });
}

describe("AnchorService", () => {
  it("derives the deterministic anchor PDA", () => {
    const value = batch();
    const expected = deriveAnchorPda(PROGRAM_ID, value.batchKey);
    expect(service(adapterMock()).deriveAnchorPda(value.batchKey).equals(expected)).toBe(true);
  });

  it("rejects invalid lengths, roots, ranges, counts, and schema versions before RPC", async () => {
    const adapter = adapterMock();
    const client = service(adapter);
    const invalid: AnchorBatch[] = [
      batch({ batchKey: new Uint8Array(31) }),
      batch({ auditRoot: new Uint8Array(63) }),
      batch({ auditRoot: new Uint8Array(64) }),
      batch({ startSequence: 45n }),
      batch({ eventCount: 2 }),
      batch({ schemaVersion: 2 }),
    ];
    for (const value of invalid) {
      await expect(client.submitAnchorBatch(value)).resolves.toMatchObject({
        status: "INVALID_INPUT",
      });
    }
    expect(adapter.getAccountInfo).not.toHaveBeenCalled();
    expect(adapter.submitRecordAnchor).not.toHaveBeenCalled();
  });

  it("encodes the exact Anchor instruction discriminator and fixed-width arguments", () => {
    const value = batch();
    const data = encodeRecordAnchorInstruction(value);
    expect(data).toHaveLength(126);
    expect(data.subarray(0, 8).toString("hex")).toBe("97c4820410795bc3");
    expect(data.subarray(8, 40)).toEqual(Buffer.from(value.batchKey));
    expect(data.subarray(40, 104)).toEqual(Buffer.from(value.auditRoot));
    expect(data.readBigUInt64LE(104)).toBe(42n);
    expect(data.readBigUInt64LE(112)).toBe(44n);
    expect(data.readUInt32LE(120)).toBe(3);
    expect(data.readUInt16LE(124)).toBe(1);
  });

  it("submits a missing anchor and returns a confirmed domain result", async () => {
    const adapter = adapterMock();
    adapter.getAccountInfo.mockResolvedValue(null);
    adapter.submitRecordAnchor.mockResolvedValue("test-signature");
    const result = await service(adapter, "devnet").submitAnchorBatch(batch());
    expect(result).toMatchObject({
      status: "CONFIRMED",
      signature: "test-signature",
      explorerUrl:
        "https://explorer.solana.com/tx/test-signature?cluster=devnet",
    });
    expect(adapter.submitRecordAnchor).toHaveBeenCalledTimes(1);
  });

  it("returns idempotent success only when every immutable field matches", async () => {
    const value = batch();
    const adapter = adapterMock();
    adapter.getAccountInfo.mockResolvedValue(accountInfo(encodeAccount(value)));
    const client = service(adapter);
    await expect(client.submitAnchorBatch(value)).resolves.toMatchObject({
      status: "ALREADY_CONFIRMED_MATCH",
    });
    await expect(
      client.submitAnchorBatch(batch({ auditRoot: hash("different-root", 64) })),
    ).resolves.toMatchObject({ status: "INTEGRITY_CONFLICT" });
    expect(adapter.submitRecordAnchor).not.toHaveBeenCalled();
  });

  it("fetches and verifies a valid, owned, trusted record", async () => {
    const value = batch();
    const adapter = adapterMock();
    adapter.getAccountInfo.mockResolvedValue(accountInfo(encodeAccount(value)));
    const result = await service(adapter).verifyAnchorRecord(value);
    expect(result.status).toBe("CONFIRMED");
    expect(result.record?.startSequence).toBe(42n);
    expect(result.record?.authority.equals(AUTHORITY.publicKey)).toBe(true);
  });

  it.each([
    ["wrong owner", () => accountInfo(encodeAccount(batch()), Keypair.generate().publicKey)],
    ["wrong discriminator", () => {
      const data = encodeAccount(batch());
      data[0] ^= 1;
      return accountInfo(data);
    }],
    ["truncated data", () => accountInfo(encodeAccount(batch()).subarray(0, 100))],
    ["executable data", () => ({ ...accountInfo(encodeAccount(batch())), executable: true })],
    ["wrong PDA contents", () =>
      accountInfo(encodeAccount(batch({ batchKey: hash("other-key", 32) })))],
    ["untrusted authority", () =>
      accountInfo(
        encodeAccount(batch(), { authority: Keypair.generate().publicKey }),
      )],
    ["invalid stored bump", () => accountInfo(encodeAccount(batch(), { bump: 0 }))],
    ["zero stored root", () =>
      accountInfo(encodeAccount(batch(), { auditRoot: new Uint8Array(64) }))],
  ])("rejects malformed account data: %s", async (_label, makeAccount) => {
    const adapter = adapterMock();
    adapter.getAccountInfo.mockResolvedValue(makeAccount());
    await expect(service(adapter).fetchAnchorRecord(batch().batchKey)).resolves.toMatchObject({
      status: "ACCOUNT_INVALID",
    });
  });

  it("distinguishes an unsupported decoded schema", async () => {
    const value = batch();
    const adapter = adapterMock();
    adapter.getAccountInfo.mockResolvedValue(
      accountInfo(encodeAccount(value, { schemaVersion: 2 })),
    );
    await expect(service(adapter).fetchAnchorRecord(value.batchKey)).resolves.toMatchObject({
      status: "UNSUPPORTED_SCHEMA_VERSION",
    });
  });

  it("keeps a missing ambiguous submission in reconciliation", async () => {
    const adapter = adapterMock();
    adapter.getAccountInfo.mockResolvedValue(null);
    await expect(service(adapter).reconcileAnchorSubmission(batch())).resolves.toMatchObject({
      status: "PENDING_CONFIRMATION",
    });
    expect(adapter.submitRecordAnchor).not.toHaveBeenCalled();
  });

  it.each([
    ["RPC", "RETRYABLE_RPC_FAILURE"],
    ["BLOCKHASH", "RETRYABLE_BLOCKHASH_FAILURE"],
    ["SIMULATION", "PROGRAM_REJECTED"],
    ["PROGRAM", "PROGRAM_REJECTED"],
    ["UNAUTHORIZED", "UNAUTHORIZED"],
    ["CONFIRMATION", "PENDING_CONFIRMATION"],
  ] as const)("classifies %s adapter failures", async (kind, status) => {
    const adapter = adapterMock();
    adapter.getAccountInfo.mockResolvedValue(null);
    adapter.submitRecordAnchor.mockRejectedValue(
      new AnchorAdapterError(kind, `${kind} failure`),
    );
    await expect(service(adapter).submitAnchorBatch(batch())).resolves.toMatchObject({
      status,
    });
  });

  it("generates cluster-aware explorer URLs", () => {
    const adapter = adapterMock();
    expect(service(adapter, "devnet").getAnchorExplorerUrl("sig")).toBe(
      "https://explorer.solana.com/tx/sig?cluster=devnet",
    );
    expect(service(adapter).getAnchorExplorerUrl("sig")).toBe(
      "https://explorer.solana.com/tx/sig?cluster=custom&customUrl=http%3A%2F%2F127.0.0.1%3A8899",
    );
  });
});

describe("SolanaAnchorAdapter", () => {
  it("simulates before submitting and confirms with the same blockhash", async () => {
    const signer = Keypair.generate();
    const calls: string[] = [];
    const connection = {
      getLatestBlockhash: jest.fn(async () => {
        calls.push("blockhash");
        return { blockhash: PublicKey.default.toBase58(), lastValidBlockHeight: 10 };
      }),
      simulateTransaction: jest.fn(async () => {
        calls.push("simulate");
        return { context: { slot: 1 }, value: { err: null, logs: [] } };
      }),
      sendRawTransaction: jest.fn(async () => {
        calls.push("send");
        return "signature";
      }),
      confirmTransaction: jest.fn(async () => {
        calls.push("confirm");
        return { context: { slot: 2 }, value: { err: null } };
      }),
    } as unknown as Connection;
    const adapter = new SolanaAnchorAdapter(connection, signer);
    const value = batch();
    const signature = await adapter.submitRecordAnchor({
      batch: value,
      programId: PROGRAM_ID,
      configPda: PublicKey.findProgramAddressSync(
        [Buffer.from("anchor_config")],
        PROGRAM_ID,
      )[0],
      anchorPda: deriveAnchorPda(PROGRAM_ID, value.batchKey),
      authority: signer.publicKey,
    });
    expect(signature).toBe("signature");
    expect(calls).toEqual(["blockhash", "simulate", "send", "confirm"]);
  });

  it("classifies an unauthorized preflight simulation without submitting", async () => {
    const signer = Keypair.generate();
    const sendRawTransaction = jest.fn();
    const connection = {
      getLatestBlockhash: jest.fn(async () => ({
        blockhash: PublicKey.default.toBase58(),
        lastValidBlockHeight: 10,
      })),
      simulateTransaction: jest.fn(async () => ({
        context: { slot: 1 },
        value: {
          err: { InstructionError: [0, { Custom: 6000 }] },
          logs: ["Program log: AnchorError caused by account: authority. Error Code: Unauthorized"],
        },
      })),
      sendRawTransaction,
    } as unknown as Connection;
    const adapter = new SolanaAnchorAdapter(connection, signer);
    const value = batch();
    await expect(
      adapter.submitRecordAnchor({
        batch: value,
        programId: PROGRAM_ID,
        configPda: PublicKey.findProgramAddressSync(
          [Buffer.from("anchor_config")],
          PROGRAM_ID,
        )[0],
        anchorPda: deriveAnchorPda(PROGRAM_ID, value.batchKey),
        authority: signer.publicKey,
      }),
    ).rejects.toMatchObject({ kind: "UNAUTHORIZED" });
    expect(sendRawTransaction).not.toHaveBeenCalled();
  });

  it("marks a timeout after submission as requiring reconciliation", async () => {
    const signer = Keypair.generate();
    const connection = {
      getLatestBlockhash: jest.fn(async () => ({
        blockhash: PublicKey.default.toBase58(),
        lastValidBlockHeight: 10,
      })),
      simulateTransaction: jest.fn(async () => ({
        context: { slot: 1 },
        value: { err: null, logs: [] },
      })),
      sendRawTransaction: jest.fn(async () => "ambiguous-signature"),
      confirmTransaction: jest.fn(async () => {
        throw new Error("confirmation timed out");
      }),
    } as unknown as Connection;
    const adapter = new SolanaAnchorAdapter(connection, signer);
    const value = batch();
    await expect(
      adapter.submitRecordAnchor({
        batch: value,
        programId: PROGRAM_ID,
        configPda: PublicKey.findProgramAddressSync(
          [Buffer.from("anchor_config")],
          PROGRAM_ID,
        )[0],
        anchorPda: deriveAnchorPda(PROGRAM_ID, value.batchKey),
        authority: signer.publicKey,
      }),
    ).rejects.toMatchObject({ kind: "CONFIRMATION" });
  });
});
