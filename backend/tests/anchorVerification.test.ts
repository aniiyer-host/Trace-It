import crypto from "crypto";
import { readFileSync } from "fs";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  type AccountInfo,
  type Connection,
} from "@solana/web3.js";
import {
  ANCHOR_RECORD_DISCRIMINATOR,
  RECORD_ANCHOR_DISCRIMINATOR,
  deriveConfigPda,
  AnchorService,
  AnchorVerificationService,
  SolanaAnchorTransactionVerifier,
  type AnchorBatch,
  type AnchorChainAdapter,
  type AnchorRecord,
  type AnchorTransactionVerifier,
  type LocallyVerifiedAnchorBatch,
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
    batchKey: hash("verification-batch", 32),
    auditRoot: hash("verification-root", 64),
    startSequence: 42n,
    endSequence: 44n,
    eventCount: 3,
    schemaVersion: 1,
    ...overrides,
  };
}

function input(
  value: AnchorBatch = batch(),
  overrides: Partial<LocallyVerifiedAnchorBatch> = {},
): LocallyVerifiedAnchorBatch {
  return {
    localVerification: "VERIFIED",
    batch: value,
    anchorState: "CONFIRMED",
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

function setup(account: AccountInfo<Buffer> | null = accountInfo(encodeAccount(batch()))) {
  const adapter: jest.Mocked<AnchorChainAdapter> = {
    getAccountInfo: jest.fn().mockResolvedValue(account),
    submitRecordAnchor: jest.fn(),
  };
  const records = new AnchorService(adapter, {
    programId: PROGRAM_ID,
    authority: AUTHORITY.publicKey,
    cluster: "localnet",
    rpcUrl: RPC_URL,
  });
  return { adapter, records };
}

describe("AnchorVerificationService", () => {
  it("keeps the public integration fixture aligned with the v1 contract", () => {
    const fixture = JSON.parse(
      readFileSync(
        new URL(
          "../../blockchain/tests/fixtures/anchor-verification-v1.json",
          import.meta.url,
        ),
        "utf8",
      ),
    ) as {
      version: number;
      input: { batch: { batchKeyHex: string; auditRootHex: string } };
      expectedStates: Record<string, string>;
    };
    expect(fixture.version).toBe(1);
    expect(fixture.input.batch.batchKeyHex).toMatch(/^[0-9a-f]{64}$/);
    expect(fixture.input.batch.auditRootHex).toMatch(/^[0-9a-f]{128}$/);
    expect(new Set(Object.values(fixture.expectedStates))).toEqual(
      new Set([
        "VERIFIED",
        "LOCAL_VALID_PENDING_ANCHOR",
        "ANCHOR_NOT_FOUND",
        "ANCHOR_MISMATCH",
        "ANCHOR_ACCOUNT_INVALID",
        "RPC_UNAVAILABLE",
        "UNSUPPORTED_SCHEMA_VERSION",
      ]),
    );
  });

  it("verifies a locally validated batch only after strict account decoding", async () => {
    const { records } = setup();
    const result = await new AnchorVerificationService(records).verify(input());

    expect(result).toMatchObject({
      status: "VERIFIED",
      pda: records.deriveAnchorPda(batch().batchKey).toBase58(),
    });
    expect(result.record?.auditRootHex).toBe(
      Buffer.from(batch().auditRoot).toString("hex"),
    );
    expect(() => JSON.stringify(result)).not.toThrow();
    expect(result).not.toHaveProperty("signature");
    expect(result).not.toHaveProperty("explorerUrl");
  });

  it("exposes a signature and explorer URL only after metadata verification", async () => {
    const { records } = setup();
    const transactions: jest.Mocked<AnchorTransactionVerifier> = {
      verifyTransaction: jest.fn().mockResolvedValue({
        status: "CONFIRMED",
        slot: 1234,
      }),
    };
    const result = await new AnchorVerificationService(
      records,
      transactions,
      { requireTransactionMetadata: true },
    ).verify(input(batch(), { transactionSignature: "confirmed-signature" }));

    expect(result).toMatchObject({
      status: "VERIFIED",
      signature: "confirmed-signature",
      transactionSlot: 1234,
      explorerUrl: expect.stringContaining("confirmed-signature"),
    });
  });

  it("does not expose an unverified supplied signature", async () => {
    const { records } = setup();
    const result = await new AnchorVerificationService(records).verify(
      input(batch(), { transactionSignature: "unverified-signature" }),
    );
    expect(result.status).toBe("VERIFIED");
    expect(result).not.toHaveProperty("signature");
    expect(result).not.toHaveProperty("explorerUrl");
  });

  it.each([
    ["root", batch({ auditRoot: hash("wrong-root", 64) })],
    ["range", batch({ startSequence: 41n, eventCount: 4 })],
    ["count", batch({ endSequence: 45n, eventCount: 4 })],
  ])("maps a mismatching %s to ANCHOR_MISMATCH", async (_field, expected) => {
    const { records } = setup();
    await expect(
      new AnchorVerificationService(records).verify(input(expected)),
    ).resolves.toMatchObject({ status: "ANCHOR_MISMATCH" });
  });

  it.each([
    ["wrong authority", () => accountInfo(encodeAccount(batch(), { authority: Keypair.generate().publicKey }))],
    ["wrong owner/program", () => accountInfo(encodeAccount(batch()), Keypair.generate().publicKey)],
    ["wrong discriminator", () => {
      const data = encodeAccount(batch());
      data[0] ^= 1;
      return accountInfo(data);
    }],
    ["wrong PDA contents", () =>
      accountInfo(encodeAccount(batch({ batchKey: hash("different-batch", 32) })))],
    ["malformed RPC data", () => accountInfo(Buffer.alloc(12))],
  ])("rejects %s as ANCHOR_ACCOUNT_INVALID", async (_label, makeAccount) => {
    const { records } = setup(makeAccount());
    await expect(
      new AnchorVerificationService(records).verify(input()),
    ).resolves.toMatchObject({ status: "ANCHOR_ACCOUNT_INVALID" });
  });

  it("distinguishes pending local work from a missing confirmed anchor", async () => {
    const { records } = setup(null);
    const verifier = new AnchorVerificationService(records);
    await expect(
      verifier.verify(input(batch(), { anchorState: "PENDING" })),
    ).resolves.toMatchObject({ status: "LOCAL_VALID_PENDING_ANCHOR" });
    await expect(verifier.verify(input())).resolves.toMatchObject({
      status: "ANCHOR_NOT_FOUND",
    });
  });

  it("reports unsupported on-chain schema versions explicitly", async () => {
    const { records } = setup(
      accountInfo(encodeAccount(batch(), { schemaVersion: 2 })),
    );
    await expect(
      new AnchorVerificationService(records).verify(input()),
    ).resolves.toMatchObject({ status: "UNSUPPORTED_SCHEMA_VERSION" });
  });

  it("recovers from an RPC outage without changing the verification input", async () => {
    const { adapter, records } = setup();
    adapter.getAccountInfo
      .mockRejectedValueOnce(new Error("RPC unavailable"))
      .mockResolvedValueOnce(accountInfo(encodeAccount(batch())));
    const verifier = new AnchorVerificationService(records);

    await expect(verifier.verify(input())).resolves.toMatchObject({
      status: "RPC_UNAVAILABLE",
    });
    await expect(verifier.verify(input())).resolves.toMatchObject({
      status: "VERIFIED",
    });
  });

  it.each([
    ["PENDING", "LOCAL_VALID_PENDING_ANCHOR"],
    ["NOT_FOUND", "ANCHOR_MISMATCH"],
    ["INVALID", "ANCHOR_MISMATCH"],
  ] as const)("maps %s transaction metadata safely", async (status, expected) => {
    const { records } = setup();
    const transactions: AnchorTransactionVerifier = {
      verifyTransaction: jest.fn().mockResolvedValue(
        status === "INVALID"
          ? { status, error: "wrong transaction" }
          : { status },
      ),
    };
    await expect(
      new AnchorVerificationService(records, transactions).verify(
        input(batch(), { transactionSignature: "signature" }),
      ),
    ).resolves.toMatchObject({ status: expected });
  });

  it("maps transaction RPC failure without leaking a signature", async () => {
    const { records } = setup();
    const transactions: AnchorTransactionVerifier = {
      verifyTransaction: jest.fn().mockRejectedValue(new Error("RPC timeout")),
    };
    const result = await new AnchorVerificationService(records, transactions).verify(
      input(batch(), { transactionSignature: "signature" }),
    );
    expect(result.status).toBe("RPC_UNAVAILABLE");
    expect(result).not.toHaveProperty("signature");
  });

  it("rejects missing metadata when the API contract requires it", async () => {
    const { records } = setup();
    const transactions: AnchorTransactionVerifier = {
      verifyTransaction: jest.fn(),
    };
    await expect(
      new AnchorVerificationService(records, transactions, {
        requireTransactionMetadata: true,
      }).verify(input()),
    ).resolves.toMatchObject({ status: "ANCHOR_MISMATCH" });
  });
});

describe("SolanaAnchorTransactionVerifier", () => {
  function connection(overrides: {
    confirmationStatus?: "processed" | "confirmed" | "finalized";
    statusError?: unknown;
    transaction?: unknown;
  } = {}): Connection {
    const anchorPda = PublicKey.findProgramAddressSync(
      [Buffer.from("anchor"), Buffer.from(batch().batchKey)],
      PROGRAM_ID,
    )[0];
    const defaultTransaction = {
      slot: 998,
      meta: { err: null },
      transaction: {
        message: {
          accountKeys: [
            { pubkey: AUTHORITY.publicKey, signer: true, writable: true },
            { pubkey: anchorPda, signer: false, writable: true },
          ],
          instructions: [
            {
              programId: PROGRAM_ID,
              accounts: [
                deriveConfigPda(PROGRAM_ID),
                anchorPda,
                AUTHORITY.publicKey,
                SystemProgram.programId,
              ],
              data: encodeBase58(RECORD_ANCHOR_DISCRIMINATOR),
            },
          ],
        },
      },
    };
    const transaction = "transaction" in overrides
      ? overrides.transaction
      : defaultTransaction;
    return {
      getSignatureStatuses: jest.fn().mockResolvedValue({
        context: { slot: 999 },
        value: [{
          slot: 998,
          confirmations: 1,
          err: overrides.statusError ?? null,
          confirmationStatus: overrides.confirmationStatus ?? "confirmed",
        }],
      }),
      getParsedTransaction: jest.fn().mockResolvedValue(transaction),
    } as unknown as Connection;
  }

  const anchorPda = PublicKey.findProgramAddressSync(
    [Buffer.from("anchor"), Buffer.from(batch().batchKey)],
    PROGRAM_ID,
  )[0];
  const testSignature = encodeBase58(Buffer.alloc(64, 7));

  it("confirms metadata only when program, PDA, authority, and status match", async () => {
    const verifier = new SolanaAnchorTransactionVerifier(connection(), PROGRAM_ID);
    await expect(
      verifier.verifyTransaction(testSignature, anchorPda, AUTHORITY.publicKey),
    ).resolves.toEqual({ status: "CONFIRMED", slot: 998 });
  });

  it("rejects malformed signatures before making an RPC call", async () => {
    const rpc = connection();
    const verifier = new SolanaAnchorTransactionVerifier(rpc, PROGRAM_ID);
    await expect(
      verifier.verifyTransaction("not-a-signature!", anchorPda, AUTHORITY.publicKey),
    ).resolves.toMatchObject({ status: "INVALID" });
    expect(rpc.getSignatureStatuses).not.toHaveBeenCalled();
  });

  it.each([
    ["wrong program", Keypair.generate().publicKey, anchorPda, AUTHORITY.publicKey],
    ["wrong PDA", PROGRAM_ID, Keypair.generate().publicKey, AUTHORITY.publicKey],
    ["wrong authority", PROGRAM_ID, anchorPda, Keypair.generate().publicKey],
  ])("rejects a transaction with %s", async (_label, program, pda, authority) => {
    const verifier = new SolanaAnchorTransactionVerifier(connection(), program);
    await expect(
      verifier.verifyTransaction(testSignature, pda, authority),
    ).resolves.toMatchObject({ status: "INVALID" });
  });

  it("rejects a different instruction from the configured program", async () => {
    const wrongInstruction = {
      slot: 998,
      meta: { err: null },
      transaction: {
        message: {
          accountKeys: [
            { pubkey: AUTHORITY.publicKey, signer: true, writable: true },
            { pubkey: anchorPda, signer: false, writable: true },
          ],
          instructions: [
            {
              programId: PROGRAM_ID,
              accounts: [
                deriveConfigPda(PROGRAM_ID),
                anchorPda,
                AUTHORITY.publicKey,
                SystemProgram.programId,
              ],
              data: encodeBase58(Buffer.alloc(8, 9)),
            },
          ],
        },
      },
    };
    await expect(
      new SolanaAnchorTransactionVerifier(
        connection({ transaction: wrongInstruction }),
        PROGRAM_ID,
      ).verifyTransaction(testSignature, anchorPda, AUTHORITY.publicKey),
    ).resolves.toMatchObject({ status: "INVALID" });
  });

  it("distinguishes processed, failed, and missing transaction metadata", async () => {
    await expect(
      new SolanaAnchorTransactionVerifier(
        connection({ confirmationStatus: "processed" }),
        PROGRAM_ID,
      ).verifyTransaction(testSignature, anchorPda, AUTHORITY.publicKey),
    ).resolves.toEqual({ status: "PENDING" });
    await expect(
      new SolanaAnchorTransactionVerifier(
        connection({ statusError: { InstructionError: [0, "InvalidArgument"] } }),
        PROGRAM_ID,
      ).verifyTransaction(testSignature, anchorPda, AUTHORITY.publicKey),
    ).resolves.toMatchObject({ status: "INVALID" });
    await expect(
      new SolanaAnchorTransactionVerifier(
        connection({ transaction: null }),
        PROGRAM_ID,
      ).verifyTransaction(testSignature, anchorPda, AUTHORITY.publicKey),
    ).resolves.toEqual({ status: "NOT_FOUND" });
  });
});

function encodeBase58(value: Uint8Array): string {
  if (value.length === 0) return "";
  const digits = [0];
  for (const byte of value) {
    let carry = byte;
    for (let index = 0; index < digits.length; index += 1) {
      carry += digits[index] << 8;
      digits[index] = carry % 58;
      carry = Math.floor(carry / 58);
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = Math.floor(carry / 58);
    }
  }
  let output = "";
  for (let index = 0; index < value.length - 1 && value[index] === 0; index += 1) {
    output += "1";
  }
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    output += "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"[
      digits[index]
    ];
  }
  return output;
}
