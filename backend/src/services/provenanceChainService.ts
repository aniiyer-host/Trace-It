import type { Prisma } from "../../generated/prisma/client.js";
import type { ProvenanceEventType } from "../../generated/prisma/enums.js";
import { prisma } from "../db/prisma.js";
import {
  canonicalizeProvenanceEvent,
  computeChainHashFromPayloadHash,
  computeProvenanceLockKey,
  hashProvenanceEvent,
  serializeProvenanceEvent,
  type ProvenanceEventInput,
} from "../utils/provenance.js";

const PROVENANCE_CHAIN_LOCK_NAMESPACE = "TRACEIT_PROVENANCE_CHAIN_V1";
const PROVENANCE_CHAIN_LOCK_KEY = computeProvenanceLockKey(
  PROVENANCE_CHAIN_LOCK_NAMESPACE,
);

type ChainedProvenanceEventInput = Omit<ProvenanceEventInput, "eventType"> & {
  eventType: ProvenanceEventType;
};

export async function acquireProvenanceChainLock(
  tx: Prisma.TransactionClient,
): Promise<void> {
  const lockResult = await tx.$queryRaw<Array<{ locked: number }>>`
    WITH lock_result AS MATERIALIZED (
      SELECT pg_advisory_xact_lock(${PROVENANCE_CHAIN_LOCK_KEY}::bigint)
    )
    SELECT 1::int AS locked FROM lock_result
  `;

  if (lockResult.length !== 1 || lockResult[0].locked !== 1) {
    throw new Error("Failed to acquire provenance chain lock");
  }
}

export async function appendProvenanceEvent(
  tx: Prisma.TransactionClient,
  input: ChainedProvenanceEventInput,
  transitionKey: string,
) {
  await acquireProvenanceChainLock(tx);
  const latestProvenanceEvent = await tx.provenanceEvent.findFirst({
    where: { chainHash: { not: null } },
    orderBy: { id: "desc" },
    select: { chainHash: true },
  });
  const previousChainHash = latestProvenanceEvent?.chainHash ?? null;
  const canonicalEvent = canonicalizeProvenanceEvent(input);
  const canonicalPayload = serializeProvenanceEvent(input);
  const payloadHash = hashProvenanceEvent(input);
  const chainHash = computeChainHashFromPayloadHash(
    payloadHash,
    previousChainHash,
  );

  return tx.provenanceEvent.create({
    data: {
      eventType: input.eventType,
      entityType: canonicalEvent.entityType,
      entityId: canonicalEvent.entityId,
      amountInr: canonicalEvent.amountInr,
      ngoId: canonicalEvent.ngoId,
      campaignId: canonicalEvent.campaignId,
      occurredAt: input.occurredAt,
      canonicalPayload,
      payloadHash,
      previous_hash: previousChainHash,
      chainHash,
      transitionKey,
    },
  });
}

export type ProvenanceEventForVerification = {
  id: bigint;
  eventType: string;
  entityType: string;
  entityId: string;
  amountInr: string;
  ngoId: string | null;
  campaignId: string | null;
  occurredAt: Date;
  canonicalPayload: string;
  payloadHash: string;
  previous_hash: string | null;
  chainHash: string | null;
};

export type ProvenanceChainVerification = {
  valid: boolean;
  checkedEvents: number;
  legacyEvents: number;
  errors: Array<{ eventId: string; reason: string }>;
};

export function verifyProvenanceEvents(
  events: readonly ProvenanceEventForVerification[],
): ProvenanceChainVerification {
  const errors: ProvenanceChainVerification["errors"] = [];
  const legacyEvents = events.filter((event) => event.chainHash === null).length;
  const chainedEvents = events.filter((event) => event.chainHash !== null);
  let previousChainHash: string | null = null;

  for (const event of chainedEvents) {
    const eventId = event.id.toString();
    const expectedPreviousHash = previousChainHash;

    if (event.previous_hash !== expectedPreviousHash) {
      errors.push({
        eventId,
        reason:
          expectedPreviousHash === null
            ? "genesis previous_hash must be NULL"
            : "previous_hash does not match the preceding chained event",
      });
    }

    try {
      const input: ProvenanceEventInput = {
        eventType: event.eventType,
        entityType: event.entityType,
        entityId: event.entityId,
        amountInr: event.amountInr,
        ngoId: event.ngoId,
        campaignId: event.campaignId,
        occurredAt: event.occurredAt,
      };
      const expectedCanonicalPayload = serializeProvenanceEvent(input);
      if (event.canonicalPayload !== expectedCanonicalPayload) {
        errors.push({
          eventId,
          reason: "canonicalPayload does not match the event fields",
        });
      }

      const expectedPayloadHash = hashProvenanceEvent(input);
      if (event.payloadHash !== expectedPayloadHash) {
        errors.push({ eventId, reason: "payloadHash does not match the event" });
      }

      const expectedChainHash = computeChainHashFromPayloadHash(
        event.payloadHash,
        expectedPreviousHash,
      );
      if (event.chainHash !== expectedChainHash) {
        errors.push({ eventId, reason: "chainHash does not match the event" });
      }
    } catch (error) {
      errors.push({
        eventId,
        reason:
          error instanceof Error
            ? `event contains invalid hash input: ${error.message}`
            : "event contains invalid hash input: unknown validation error",
      });
    }

    previousChainHash = event.chainHash;
  }

  return {
    valid: errors.length === 0,
    checkedEvents: chainedEvents.length,
    legacyEvents,
    errors,
  };
}

export async function verifyProvenanceChain(): Promise<ProvenanceChainVerification> {
  const events = await prisma.provenanceEvent.findMany({
    orderBy: { id: "asc" },
    select: {
      id: true,
      eventType: true,
      entityType: true,
      entityId: true,
      amountInr: true,
      ngoId: true,
      campaignId: true,
      occurredAt: true,
      canonicalPayload: true,
      payloadHash: true,
      previous_hash: true,
      chainHash: true,
    },
  });

  return verifyProvenanceEvents(events);
}
