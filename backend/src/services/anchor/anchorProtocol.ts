import crypto from "node:crypto";

import {
  U32_MAX,
  U64_MAX,
  type AnchorBatch,
} from "./anchorTypes.js";

const AUDIT_ROOT_DOMAIN = Buffer.from("TRACEIT_AUDIT_ROOT_V1", "ascii");
const ANCHOR_DOMAIN = Buffer.from("TRACEIT_ANCHOR_V1", "ascii");

function encodeU16(value: number): Buffer {
  if (!Number.isInteger(value) || value < 0 || value > 0xffff) {
    throw new Error("schemaVersion must fit unsigned u16");
  }
  const result = Buffer.alloc(2);
  result.writeUInt16BE(value);
  return result;
}

function encodeU32(value: number): Buffer {
  if (!Number.isInteger(value) || value <= 0 || BigInt(value) > U32_MAX) {
    throw new Error("eventCount must fit positive unsigned u32");
  }
  const result = Buffer.alloc(4);
  result.writeUInt32BE(value);
  return result;
}

function encodeU64(value: bigint): Buffer {
  if (value < 0n || value > U64_MAX) {
    throw new Error("sequence must fit unsigned u64");
  }
  const result = Buffer.alloc(8);
  result.writeBigUInt64BE(value);
  return result;
}

function decodeEventHash(value: string): Buffer {
  if (!/^[0-9a-f]{128}$/.test(value)) {
    throw new Error("event hash must be 128 lowercase hexadecimal characters");
  }
  return Buffer.from(value, "hex");
}

export function deriveAnchorBatch(
  startSequence: bigint,
  eventHashes: readonly string[],
  schemaVersion = 1,
): AnchorBatch {
  if (eventHashes.length === 0) throw new Error("anchor batch cannot be empty");
  const eventCount = eventHashes.length;
  const endSequence = startSequence + BigInt(eventCount) - 1n;
  if (endSequence > U64_MAX) throw new Error("anchor sequence range overflows u64");

  const schemaBytes = encodeU16(schemaVersion);
  const startBytes = encodeU64(startSequence);
  const endBytes = encodeU64(endSequence);
  const countBytes = encodeU32(eventCount);
  const hashes = eventHashes.map(decodeEventHash);
  const auditRoot = crypto
    .createHash("sha512")
    .update(
      Buffer.concat([
        AUDIT_ROOT_DOMAIN,
        schemaBytes,
        startBytes,
        endBytes,
        countBytes,
        ...hashes,
      ]),
    )
    .digest();
  const batchKey = crypto
    .createHash("sha512")
    .update(
      Buffer.concat([
        ANCHOR_DOMAIN,
        schemaBytes,
        startBytes,
        endBytes,
        countBytes,
        auditRoot,
      ]),
    )
    .digest()
    .subarray(0, 32);

  return {
    batchKey: Uint8Array.from(batchKey),
    auditRoot: Uint8Array.from(auditRoot),
    startSequence,
    endSequence,
    eventCount,
    schemaVersion,
  };
}
