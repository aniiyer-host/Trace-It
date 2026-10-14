import crypto from "node:crypto";
import type { Prisma } from "../../../generated/prisma/client.js";
import { prisma } from "../../db/prisma.js";
import {
  computeProvenanceLockKey,
  computeChainHashFromPayloadHash,
  hashProvenanceEvent,
  serializeProvenanceEvent,
  type ProvenanceEventInput,
} from "../../utils/provenance.js";
import { deriveAnchorBatch } from "./anchorProtocol.js";

const BATCH_SCHEDULER_LOCK_KEY = computeProvenanceLockKey(
  "TRACEIT_ANCHOR_BATCH_SCHEDULER_V1",
);
const DEFAULT_BATCH_SIZE = 20;

type ProvenanceRow = ProvenanceEventInput & {
  id: bigint;
  canonicalPayload: string;
  payloadHash: string;
  previous_hash: string | null;
  chainHash: string | null;
};

export interface AnchorBatchCreation {
  id: string;
  batchKey: string;
  auditRoot: string;
  startSequence: bigint;
  endSequence: bigint;
  eventCount: number;
}

export class AnchorBatchService {
  constructor(
    private readonly database: typeof prisma = prisma,
    private readonly batchSize = DEFAULT_BATCH_SIZE,
    private readonly now: () => Date = () => new Date(),
  ) {
    if (!Number.isInteger(batchSize) || batchSize <= 0) {
      throw new Error("anchor batch size must be a positive integer");
    }
  }

  async createNextBatch(): Promise<AnchorBatchCreation | null> {
    return this.database.$transaction(async (tx) => {
      await lockBatchScheduler(tx);
      const rows = await tx.$queryRaw<ProvenanceRow[]>`
        SELECT
          id, "eventType", "entityType", "entityId", "amountInr", "ngoId",
          "campaignId", "occurredAt", "canonicalPayload", "payloadHash",
          "previous_hash", "chainHash"
        FROM "provenance_events"
        WHERE "chainHash" IS NOT NULL
          AND "anchorBatchId" IS NULL
          AND "anchorStatus" = 'PENDING'
        ORDER BY id ASC
        LIMIT ${this.batchSize}
        FOR UPDATE SKIP LOCKED
      `;
      if (rows.length === 0) return null;

      const previous = await tx.$queryRaw<Array<{ chainHash: string }>>`
        SELECT "chainHash"
        FROM "provenance_events"
        WHERE id < ${rows[0].id}
          AND "chainHash" IS NOT NULL
        ORDER BY id DESC
        LIMIT 1
      `;
      const eligible = contiguousPrefix(rows);
      verifyEventHashes(eligible, previous[0]?.chainHash ?? null);

      const batch = deriveAnchorBatch(
        eligible[0].id,
        eligible.map((event) => event.payloadHash),
      );
      const batchId = crypto.randomUUID();
      const createdAt = this.now();
      const batchKey = Buffer.from(batch.batchKey).toString("hex");
      const auditRoot = Buffer.from(batch.auditRoot).toString("hex");

      await tx.$executeRaw`
        INSERT INTO "anchor_batches" (
          "id", "batchKey", "auditRoot", "startSequence", "endSequence",
          "eventCount", "status", "attemptCount", "reconciliationCount",
          "nextAttemptAt", "createdAt"
        ) VALUES (
          ${batchId}, ${batchKey}, ${auditRoot}, ${batch.startSequence},
          ${batch.endSequence}, ${batch.eventCount}, 'PENDING', 0, 0,
          ${createdAt}, ${createdAt}
        )
      `;
      const eventIds = eligible.map(({ id }) => id);
      const linked = await tx.$executeRaw`
        UPDATE "provenance_events"
        SET "anchorBatchId" = ${batchId}, "anchorStatus" = 'BATCHED'
        WHERE id = ANY(${eventIds}::bigint[])
          AND "anchorBatchId" IS NULL
          AND "anchorStatus" = 'PENDING'
      `;
      if (linked !== eligible.length) {
        throw new Error("Provenance events changed while creating anchor batch");
      }

      return {
        id: batchId,
        batchKey,
        auditRoot,
        startSequence: batch.startSequence,
        endSequence: batch.endSequence,
        eventCount: batch.eventCount,
      };
    });
  }
}

export class AnchorBatchScheduler {
  private stopped = false;
  private loopPromise?: Promise<void>;
  private inFlight?: Promise<AnchorBatchCreation | null>;

  constructor(
    private readonly batches: Pick<AnchorBatchService, "createNextBatch">,
    private readonly pollIntervalMs = 1_000,
    private readonly onError: (error: unknown) => void = (error) => {
      console.error("[AnchorBatchScheduler] Batch creation failed:", error);
    },
  ) {
    if (!Number.isInteger(pollIntervalMs) || pollIntervalMs <= 0) {
      throw new Error("anchor batch scheduler interval must be positive");
    }
  }

  start(): void {
    if (this.loopPromise) return;
    this.stopped = false;
    this.loopPromise = this.runLoop();
  }

  async stop(): Promise<void> {
    this.stopped = true;
    await this.loopPromise;
    await this.inFlight;
  }

  runOnce(): Promise<AnchorBatchCreation | null> {
    if (this.stopped) return Promise.resolve(null);
    if (this.inFlight) return this.inFlight;
    this.inFlight = this.batches.createNextBatch().finally(() => {
      this.inFlight = undefined;
    });
    return this.inFlight;
  }

  private async runLoop(): Promise<void> {
    while (!this.stopped) {
      try {
        await this.runOnce();
        await delay(this.pollIntervalMs);
      } catch (error) {
        this.onError(error);
        await delay(this.pollIntervalMs);
      }
    }
    await this.inFlight;
  }
}

async function lockBatchScheduler(tx: Prisma.TransactionClient): Promise<void> {
  await tx.$queryRaw<Array<{ locked: number }>>`
    WITH lock_result AS MATERIALIZED (
      SELECT pg_advisory_xact_lock(${BATCH_SCHEDULER_LOCK_KEY}::bigint)
    )
    SELECT 1::int AS locked FROM lock_result
  `;
}

function contiguousPrefix(rows: readonly ProvenanceRow[]): ProvenanceRow[] {
  const result = [rows[0]];
  for (let index = 1; index < rows.length; index += 1) {
    if (rows[index].id !== result[result.length - 1].id + 1n) break;
    result.push(rows[index]);
  }
  return result;
}

function verifyEventHashes(
  events: readonly ProvenanceRow[],
  previousChainHash: string | null,
): void {
  let expectedPrevious = previousChainHash;
  for (const event of events) {
    if (
      serializeProvenanceEvent(event) !== event.canonicalPayload ||
      hashProvenanceEvent(event) !== event.payloadHash
    ) {
      throw new Error(`Provenance event ${event.id} does not match its canonical hash`);
    }
    if (event.previous_hash !== expectedPrevious) {
      throw new Error(`Provenance event ${event.id} breaks the recorded chain link`);
    }
    const expectedChainHash = computeChainHashFromPayloadHash(
      event.payloadHash,
      expectedPrevious,
    );
    if (event.chainHash !== expectedChainHash) {
      throw new Error(`Provenance event ${event.id} has an invalid chain hash`);
    }
    expectedPrevious = event.chainHash;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
