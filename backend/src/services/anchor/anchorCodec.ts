import crypto from "crypto";
import { PublicKey, type AccountInfo } from "@solana/web3.js";
import {
  ANCHOR_RECORD_SIZE,
  SUPPORTED_SCHEMA_VERSION,
  U32_MAX,
  U64_MAX,
  type AnchorBatch,
  type AnchorRecord,
} from "./anchorTypes.js";

export const CONFIG_SEED = Buffer.from("anchor_config", "ascii");
export const ANCHOR_SEED = Buffer.from("anchor", "ascii");
export const RECORD_ANCHOR_DISCRIMINATOR = crypto
  .createHash("sha256")
  .update("global:record_anchor")
  .digest()
  .subarray(0, 8);
export const ANCHOR_RECORD_DISCRIMINATOR = crypto
  .createHash("sha256")
  .update("account:AnchorRecord")
  .digest()
  .subarray(0, 8);

export class AnchorValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AnchorValidationError";
  }
}

export class AnchorAccountError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AnchorAccountError";
  }
}

export function validateAnchorBatch(batch: AnchorBatch): void {
  if (batch.batchKey.length !== 32) {
    throw new AnchorValidationError("batchKey must contain exactly 32 bytes");
  }
  if (batch.auditRoot.length !== 64) {
    throw new AnchorValidationError("auditRoot must contain exactly 64 bytes");
  }
  if (Buffer.from(batch.auditRoot).equals(Buffer.alloc(64))) {
    throw new AnchorValidationError("auditRoot cannot be all zeroes");
  }
  if (
    batch.startSequence < 0n ||
    batch.endSequence < 0n ||
    batch.startSequence > U64_MAX ||
    batch.endSequence > U64_MAX
  ) {
    throw new AnchorValidationError("sequence values must fit unsigned u64");
  }
  if (batch.endSequence < batch.startSequence) {
    throw new AnchorValidationError("endSequence cannot precede startSequence");
  }
  if (!Number.isInteger(batch.eventCount) || batch.eventCount <= 0) {
    throw new AnchorValidationError("eventCount must be a positive integer");
  }
  if (BigInt(batch.eventCount) > U32_MAX) {
    throw new AnchorValidationError("eventCount must fit unsigned u32");
  }
  if (batch.endSequence - batch.startSequence + 1n !== BigInt(batch.eventCount)) {
    throw new AnchorValidationError("eventCount must match the contiguous sequence range");
  }
  if (batch.schemaVersion !== SUPPORTED_SCHEMA_VERSION) {
    throw new AnchorValidationError(
      `unsupported schemaVersion ${batch.schemaVersion}`,
    );
  }
}

export function encodeRecordAnchorInstruction(batch: AnchorBatch): Buffer {
  validateAnchorBatch(batch);
  const data = Buffer.alloc(126);
  let offset = 0;
  RECORD_ANCHOR_DISCRIMINATOR.copy(data, offset);
  offset += 8;
  Buffer.from(batch.batchKey).copy(data, offset);
  offset += 32;
  Buffer.from(batch.auditRoot).copy(data, offset);
  offset += 64;
  data.writeBigUInt64LE(batch.startSequence, offset);
  offset += 8;
  data.writeBigUInt64LE(batch.endSequence, offset);
  offset += 8;
  data.writeUInt32LE(batch.eventCount, offset);
  offset += 4;
  data.writeUInt16LE(batch.schemaVersion, offset);
  return data;
}

export function deriveConfigPda(programId: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([CONFIG_SEED], programId)[0];
}

export function deriveAnchorPda(
  programId: PublicKey,
  batchKey: Uint8Array,
): PublicKey {
  if (batchKey.length !== 32) {
    throw new AnchorValidationError("batchKey must contain exactly 32 bytes");
  }
  return PublicKey.findProgramAddressSync(
    [ANCHOR_SEED, Buffer.from(batchKey)],
    programId,
  )[0];
}

export function decodeAnchorRecord(
  address: PublicKey,
  account: AccountInfo<Buffer>,
  programId: PublicKey,
  trustedAuthorities: readonly PublicKey[],
): AnchorRecord {
  if (!account.owner.equals(programId)) {
    throw new AnchorAccountError("anchor account has the wrong owner");
  }
  if (account.executable) {
    throw new AnchorAccountError("anchor data account cannot be executable");
  }
  if (account.data.length !== ANCHOR_RECORD_SIZE) {
    throw new AnchorAccountError(
      `anchor account length must be ${ANCHOR_RECORD_SIZE} bytes`,
    );
  }
  if (!account.data.subarray(0, 8).equals(ANCHOR_RECORD_DISCRIMINATOR)) {
    throw new AnchorAccountError("anchor account discriminator is invalid");
  }

  let offset = 8;
  const batchKey = account.data.subarray(offset, offset + 32);
  offset += 32;
  const auditRoot = account.data.subarray(offset, offset + 64);
  offset += 64;
  const startSequence = account.data.readBigUInt64LE(offset);
  offset += 8;
  const endSequence = account.data.readBigUInt64LE(offset);
  offset += 8;
  const eventCount = account.data.readUInt32LE(offset);
  offset += 4;
  const schemaVersion = account.data.readUInt16LE(offset);
  offset += 2;
  const authority = new PublicKey(account.data.subarray(offset, offset + 32));
  offset += 32;
  const anchoredAt = account.data.readBigInt64LE(offset);
  offset += 8;
  const bump = account.data.readUInt8(offset);

  const [expectedAddress, expectedBump] = PublicKey.findProgramAddressSync(
    [ANCHOR_SEED, batchKey],
    programId,
  );
  if (!address.equals(expectedAddress)) {
    throw new AnchorAccountError("anchor account PDA does not match its batchKey");
  }
  if (bump !== expectedBump) {
    throw new AnchorAccountError("anchor account stores an invalid PDA bump");
  }
  if (schemaVersion !== SUPPORTED_SCHEMA_VERSION) {
    throw new AnchorAccountError(`unsupported schemaVersion ${schemaVersion}`);
  }
  if (!trustedAuthorities.some((trusted) => trusted.equals(authority))) {
    throw new AnchorAccountError("anchor account authority is not trusted");
  }

  const record: AnchorRecord = {
    batchKey: Uint8Array.from(batchKey),
    auditRoot: Uint8Array.from(auditRoot),
    startSequence,
    endSequence,
    eventCount,
    schemaVersion,
    authority,
    anchoredAt,
    bump,
  };
  try {
    validateAnchorBatch(record);
  } catch (error) {
    throw new AnchorAccountError(
      `anchor account fields are invalid: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (anchoredAt <= 0n) {
    throw new AnchorAccountError("anchor timestamp must be positive");
  }
  return record;
}

export function anchorRecordMatches(
  record: AnchorRecord,
  batch: AnchorBatch,
): boolean {
  return (
    Buffer.from(record.batchKey).equals(Buffer.from(batch.batchKey)) &&
    Buffer.from(record.auditRoot).equals(Buffer.from(batch.auditRoot)) &&
    record.startSequence === batch.startSequence &&
    record.endSequence === batch.endSequence &&
    record.eventCount === batch.eventCount &&
    record.schemaVersion === batch.schemaVersion
  );
}
