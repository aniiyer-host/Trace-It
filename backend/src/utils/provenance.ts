import crypto from "node:crypto";

export const PROVENANCE_SCHEMA_VERSION = 1 as const;

/**
 * Computes the advisory lock key for the provenance chain.
 * Uses the first 64 bits of the MD5 hash of the namespace string,
 * converted to a signed 64-bit integer.
 */
export function computeProvenanceLockKey(namespace: string): bigint {
  const hashBuffer = crypto.createHash('md5').update(namespace).digest();
  const unsignedValue = hashBuffer.readBigUInt64BE(0);
  return BigInt.asIntN(64, unsignedValue);
}

/**
 * Validates a SHA-512 digest represented as 128 lowercase hexadecimal characters.
 */
function decodeSha512Hex(name: string, value: string): Buffer {
  if (typeof value !== "string" || !/^[0-9a-f]{128}$/.test(value)) {
    throw new Error(
    name === "previousChainHash"
    ? "Invalid previousChainHash: must be 128 lowercase hex characters"
    : `${name} must be exactly 128 lowercase hex characters`,
    );
  }

  const decoded = Buffer.from(value, "hex");

  // Defensive check: the encoding must represent exactly 64 bytes.
  if (decoded.length !== 64) {
    throw new Error(`${name} must decode to exactly 64 bytes`);
  }

  return decoded;
}

/**
 * Computes a chain hash from an already-computed payload hash.
 *
 * Formula:
 * SHA-512(
 *   UTF8("TRACEIT_CHAIN_V1") ||
 *   u16BE(schemaVersion) ||
 *   payloadHashBytes ||
 *   previousChainHashBytes
 * )
 *
 * A null predecessor represents genesis and is encoded as 64 zero bytes.
 */
export function computeChainHashFromPayloadHash(
  payloadHashHex: string,
  previousChainHashHex: string | null,
): string {
  const payloadHashBytes = decodeSha512Hex("payloadHash", payloadHashHex);

  const previousChainHashBytes =
    previousChainHashHex === null
      ? Buffer.alloc(64, 0)
      : decodeSha512Hex("previousChainHash", previousChainHashHex);

  const schemaVersionBytes = Buffer.alloc(2);
  schemaVersionBytes.writeUInt16BE(PROVENANCE_SCHEMA_VERSION, 0);

  const hashInput = Buffer.concat([
    Buffer.from("TRACEIT_CHAIN_V1", "utf8"),
    schemaVersionBytes,
    payloadHashBytes,
    previousChainHashBytes,
  ]);

  return crypto.createHash("sha512").update(hashInput).digest("hex");
}

/**
 * Computes the chain hash for a provenance event.
 */
export function computeChainHash(
  provenanceEventInput: ProvenanceEventInput,
  previousChainHashHex: string | null,
): string {
  const payloadHashHex = hashProvenanceEvent(provenanceEventInput);

  return computeChainHashFromPayloadHash(
    payloadHashHex,
    previousChainHashHex,
  );
}


export type ProvenanceEventInput = {
  eventType: string;
  entityType: string;
  entityId: string;
  amountInr: string;
  ngoId: string | null;
  campaignId: string | null;
  occurredAt: Date;
};

export type CanonicalProvenanceEvent = {
  schemaVersion: typeof PROVENANCE_SCHEMA_VERSION;
  eventType: string;
  entityType: string;
  entityId: string;
  amountInr: string;
  ngoId: string | null;
  campaignId: string | null;
  occurredAt: string;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const AMOUNT_PATTERN = /^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,2})?$/;

function requireNonEmptyString(name: string, value: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${name} must be a non-empty string`);
  }
  return value;
}

function normalizeUuid(name: string, value: string | null): string | null {
  if (value === null) return null;
  requireNonEmptyString(name, value);
  if (!UUID_PATTERN.test(value)) throw new Error(`${name} must be a UUID or null`);
  return value;
}

function normalizeRequiredUuid(name: string, value: string): string {
  const normalized = normalizeUuid(name, value);
  if (normalized === null) throw new Error(`${name} must be a UUID`);
  return normalized;
}

export function normalizeAmountInr(value: string): string {
  if (typeof value !== "string" || !AMOUNT_PATTERN.test(value)) {
    throw new Error("amountInr must be a non-negative decimal string with at most 2 decimal places");
  }

  const [whole, fraction = ""] = value.split(".");
  return `${whole}.${fraction.padEnd(2, "0")}`;
}

function normalizeOccurredAt(value: Date): string {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new Error("occurredAt must be a valid Date");
  }
  return value.toISOString();
}

export function canonicalizeProvenanceEvent(
  input: ProvenanceEventInput,
): CanonicalProvenanceEvent {
  return {
    schemaVersion: PROVENANCE_SCHEMA_VERSION,
    eventType: requireNonEmptyString("eventType", input.eventType),
    entityType: requireNonEmptyString("entityType", input.entityType),
    entityId: normalizeRequiredUuid("entityId", input.entityId),
    amountInr: normalizeAmountInr(input.amountInr),
    ngoId: normalizeUuid("ngoId", input.ngoId),
    campaignId: normalizeUuid("campaignId", input.campaignId),
    occurredAt: normalizeOccurredAt(input.occurredAt),
  };
}

export function serializeProvenanceEvent(input: ProvenanceEventInput): string {
  return JSON.stringify(canonicalizeProvenanceEvent(input));
}

export function hashProvenanceEvent(input: ProvenanceEventInput): string {
  return crypto
    .createHash("sha512")
    .update(serializeProvenanceEvent(input), "utf8")
    .digest("hex");
}
