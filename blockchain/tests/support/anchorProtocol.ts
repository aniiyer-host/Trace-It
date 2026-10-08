import crypto from "crypto";

const AUDIT_ROOT_DOMAIN = Buffer.from("TRACEIT_AUDIT_ROOT_V1", "ascii");
const ANCHOR_DOMAIN = Buffer.from("TRACEIT_ANCHOR_V1", "ascii");

function u16(value: number): Buffer {
  const encoded = Buffer.alloc(2);
  encoded.writeUInt16BE(value);
  return encoded;
}

function u32(value: number): Buffer {
  const encoded = Buffer.alloc(4);
  encoded.writeUInt32BE(value);
  return encoded;
}

function u64(value: bigint): Buffer {
  const encoded = Buffer.alloc(8);
  encoded.writeBigUInt64BE(value);
  return encoded;
}

function sha512(value: Buffer): Buffer {
  return crypto.createHash("sha512").update(value).digest();
}

export function deriveAuditRoot(
  schemaVersion: number,
  startSequence: bigint,
  endSequence: bigint,
  eventHashes: Buffer[],
): Buffer {
  if (eventHashes.length === 0) throw new Error("EMPTY_BATCH");
  if (endSequence < startSequence) throw new Error("INVALID_RANGE");
  const expectedCount = endSequence - startSequence + 1n;
  if (expectedCount !== BigInt(eventHashes.length)) {
    throw new Error("COUNT_MISMATCH");
  }
  if (eventHashes.some((hash) => hash.length !== 64)) {
    throw new Error("INVALID_EVENT_HASH");
  }

  return sha512(Buffer.concat([
    AUDIT_ROOT_DOMAIN,
    u16(schemaVersion),
    u64(startSequence),
    u64(endSequence),
    u32(eventHashes.length),
    ...eventHashes,
  ]));
}

export function deriveBatchKey(
  schemaVersion: number,
  startSequence: bigint,
  endSequence: bigint,
  eventCount: number,
  auditRoot: Buffer,
): Buffer {
  if (eventCount === 0) throw new Error("EMPTY_BATCH");
  if (auditRoot.length !== 64) throw new Error("INVALID_ROOT_LENGTH");
  if (auditRoot.equals(Buffer.alloc(64))) throw new Error("ZERO_ROOT");
  if (endSequence < startSequence) throw new Error("INVALID_RANGE");
  if (endSequence - startSequence + 1n !== BigInt(eventCount)) {
    throw new Error("COUNT_MISMATCH");
  }

  return sha512(Buffer.concat([
    ANCHOR_DOMAIN,
    u16(schemaVersion),
    u64(startSequence),
    u64(endSequence),
    u32(eventCount),
    auditRoot,
  ])).subarray(0, 32);
}
