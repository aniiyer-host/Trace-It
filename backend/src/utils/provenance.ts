import crypto from "node:crypto";

export const PROVENANCE_SCHEMA_VERSION = 1 as const;

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
