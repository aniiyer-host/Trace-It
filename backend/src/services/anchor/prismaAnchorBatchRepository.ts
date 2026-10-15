import crypto from "node:crypto";
import type { Prisma } from "../../../generated/prisma/client.js";
import { prisma } from "../../db/prisma.js";
import type {
  AnchorBacklogSnapshot,
  AnchorBatchRepository,
  AnchorBatchStatus,
  AnchorTransition,
  ClaimedAnchorBatch,
} from "./anchorWorkerTypes.js";

type AnchorBatchRow = {
  id: string;
  batchKey: string;
  auditRoot: string;
  startSequence: bigint;
  endSequence: bigint;
  eventCount: number;
  status: string;
  createdAt: Date;
  attemptCount: number;
  reconciliationCount: number;
  nextAttemptAt: Date;
  solanaTxSignature: string | null;
  anchorPda: string | null;
  lastError: string | null;
  claimToken?: string;
  claimExpiresAt?: Date;
  claimedFromStatus?: string;
};

const ELIGIBLE_STATUSES: readonly AnchorBatchStatus[] = [
  "PENDING",
  "RETRYABLE",
  "SUBMITTING",
  "RECONCILIATION_REQUIRED",
];
const ALL_STATUSES: readonly AnchorBatchStatus[] = [
  ...ELIGIBLE_STATUSES,
  "CONFIRMED",
  "TERMINAL_FAILURE",
  "DEAD_LETTER",
];

export class AnchorClaimLostError extends Error {
  constructor(batchId: string) {
    super(`Anchor batch ${batchId} is no longer owned by this worker`);
    this.name = "AnchorClaimLostError";
  }
}

export class PrismaAnchorBatchRepository implements AnchorBatchRepository {
  constructor(private readonly database: typeof prisma = prisma) {}

  async recoverExpiredClaims(now: Date): Promise<number> {
    return this.database.$executeRaw`
      UPDATE "anchor_batches"
      SET "claimToken" = NULL, "claimExpiresAt" = NULL
      WHERE "claimToken" IS NOT NULL AND "claimExpiresAt" <= ${now}
    `;
  }

  async claimNext(
    workerId: string,
    now: Date,
    leaseMs: number,
    batchId?: string,
  ): Promise<ClaimedAnchorBatch | null> {
    const claimToken = `${workerId}:${crypto.randomUUID()}`;
    return this.database.$transaction(async (tx) => {
      const candidates = await tx.$queryRaw<AnchorBatchRow[]>`
        SELECT
          "id", "batchKey", "auditRoot", "startSequence", "endSequence",
          "eventCount", "status", "createdAt", "attemptCount",
          "reconciliationCount", "nextAttemptAt", "solanaTxSignature",
          "anchorPda", "lastError"
        FROM "anchor_batches"
        WHERE "status" IN ('PENDING', 'RETRYABLE', 'SUBMITTING', 'RECONCILIATION_REQUIRED')
          AND "id" = COALESCE(${batchId ?? null}::text, "id")
          AND "nextAttemptAt" <= ${now}
          AND ("claimToken" IS NULL OR "claimExpiresAt" <= ${now})
        ORDER BY "nextAttemptAt" ASC, "createdAt" ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      `;
      const candidate = candidates[0];
      if (!candidate) return null;
      const claimExpiresAt = new Date(now.getTime() + leaseMs);
      const updated = await tx.$queryRaw<AnchorBatchRow[]>`
        UPDATE "anchor_batches"
        SET "claimToken" = ${claimToken}, "claimExpiresAt" = ${claimExpiresAt}
        WHERE "id" = ${candidate.id}
          AND "status" = ${candidate.status}
          AND ("claimToken" IS NULL OR "claimExpiresAt" <= ${now})
        RETURNING
          "id", "batchKey", "auditRoot", "startSequence", "endSequence",
          "eventCount", "status", "createdAt", "attemptCount",
          "reconciliationCount", "nextAttemptAt", "solanaTxSignature",
          "anchorPda", "lastError", "claimToken", "claimExpiresAt"
      `;
      if (updated.length !== 1) return null;
      return toClaimedBatch(updated[0], candidate.status);
    });
  }

  async renewClaim(
    id: string,
    claimToken: string,
    now: Date,
    leaseMs: number,
  ): Promise<void> {
    const updated = await this.database.$executeRaw`
      UPDATE "anchor_batches"
      SET "claimExpiresAt" = ${new Date(now.getTime() + leaseMs)}
      WHERE "id" = ${id}
        AND "claimToken" = ${claimToken}
        AND "claimExpiresAt" > ${now}
    `;
    if (updated !== 1) throw new AnchorClaimLostError(id);
  }

  markSubmitting(id: string, transition: AnchorTransition): Promise<void> {
    return this.transition(id, transition, "SUBMITTING");
  }

  markReconciliationRequired(
    id: string,
    transition: AnchorTransition,
  ): Promise<void> {
    return this.transition(id, transition, "RECONCILIATION_REQUIRED", true);
  }

  markRetryable(id: string, transition: AnchorTransition): Promise<void> {
    return this.transition(id, transition, "RETRYABLE", true);
  }

  markConfirmed(id: string, transition: AnchorTransition): Promise<void> {
    return this.transition(id, transition, "CONFIRMED", true, "ANCHORED");
  }

  markTerminalFailure(id: string, transition: AnchorTransition): Promise<void> {
    return this.transition(id, transition, "TERMINAL_FAILURE", true, "FAILED");
  }

  markDeadLetter(id: string, transition: AnchorTransition): Promise<void> {
    return this.transition(id, transition, "DEAD_LETTER", true, "FAILED");
  }

  async getBacklogSnapshot(now: Date): Promise<AnchorBacklogSnapshot> {
    const rows = await this.database.$queryRaw<
      Array<{ status: string; count: bigint; oldestCreatedAt: Date | null }>
    >`
      SELECT "status", COUNT(*)::bigint AS count, MIN("createdAt") AS "oldestCreatedAt"
      FROM "anchor_batches"
      GROUP BY "status"
    `;
    const counts: AnchorBacklogSnapshot["counts"] = {};
    let oldestCreatedAt: Date | null = null;
    for (const row of rows) {
      if (isAnchorBatchStatus(row.status)) counts[row.status] = Number(row.count);
      if (
        ELIGIBLE_STATUSES.includes(row.status as AnchorBatchStatus) &&
        row.oldestCreatedAt &&
        (!oldestCreatedAt || row.oldestCreatedAt < oldestCreatedAt)
      ) {
        oldestCreatedAt = row.oldestCreatedAt;
      }
    }
    return {
      counts,
      oldestPendingAgeMs: oldestCreatedAt
        ? Math.max(0, now.getTime() - oldestCreatedAt.getTime())
        : 0,
    };
  }

  private async transition(
    id: string,
    transition: AnchorTransition,
    status: AnchorBatchStatus,
    releaseClaim = false,
    eventStatus?: "ANCHORED" | "FAILED",
  ): Promise<void> {
    if (
      (status === "RETRYABLE" || status === "RECONCILIATION_REQUIRED") &&
      !transition.nextAttemptAt
    ) {
      throw new Error(`${status} transition requires nextAttemptAt`);
    }
    await this.database.$transaction(async (tx) => {
      const updated = await tx.$executeRaw`
        UPDATE "anchor_batches"
        SET "status" = ${status},
            "attemptCount" = ${transition.attemptCount},
            "reconciliationCount" = ${transition.reconciliationCount ?? 0},
            "solanaTxSignature" = CASE
              WHEN ${transition.clearTransactionSignature ?? false} THEN NULL
              ELSE COALESCE(${transition.transactionSignature ?? null}, "solanaTxSignature")
            END,
            "anchorPda" = COALESCE(${transition.anchorPda ?? null}, "anchorPda"),
            "lastError" = ${transition.error ?? null},
            "nextAttemptAt" = COALESCE(${transition.nextAttemptAt ?? null}, "nextAttemptAt"),
            "anchoredAt" = CASE WHEN ${status} = 'CONFIRMED' THEN ${transition.completedAt ?? new Date()} ELSE "anchoredAt" END,
            "claimToken" = CASE WHEN ${releaseClaim} THEN NULL ELSE "claimToken" END,
            "claimExpiresAt" = CASE WHEN ${releaseClaim} THEN NULL ELSE "claimExpiresAt" END
        WHERE "id" = ${id}
          AND "claimToken" = ${transition.claimToken}
          AND "claimExpiresAt" > (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
      `;
      if (updated !== 1) throw new AnchorClaimLostError(id);

      if (eventStatus) {
        await tx.$executeRaw`
          UPDATE "provenance_events"
          SET "anchorStatus" = ${eventStatus},
              "attemptCount" = ${transition.attemptCount},
              "lastError" = ${eventStatus === "FAILED" ? transition.error ?? status : null},
              "processedAt" = ${transition.completedAt ?? new Date()}
          WHERE "anchorBatchId" = ${id}
        `;
      } else {
        await tx.$executeRaw`
          UPDATE "provenance_events"
          SET "attemptCount" = ${transition.attemptCount},
              "lastError" = ${transition.error ?? null}
          WHERE "anchorBatchId" = ${id}
        `;
      }
    });
  }
}

export async function assertAnchorSchemaReady(
  database: typeof prisma = prisma,
): Promise<void> {
  const columns = await database.$queryRaw<Array<{ tableName: string; columnName: string }>>`
    SELECT table_name AS "tableName", column_name AS "columnName"
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name IN ('anchor_batches', 'provenance_events')
  `;
  const available = new Set(
    columns.map(({ tableName, columnName }) => `${tableName}.${columnName}`),
  );
  const required = [
    "anchor_batches.id",
    "anchor_batches.batchKey",
    "anchor_batches.auditRoot",
    "anchor_batches.startSequence",
    "anchor_batches.endSequence",
    "anchor_batches.eventCount",
    "anchor_batches.status",
    "anchor_batches.attemptCount",
    "anchor_batches.reconciliationCount",
    "anchor_batches.nextAttemptAt",
    "anchor_batches.claimToken",
    "anchor_batches.claimExpiresAt",
    "anchor_batches.anchorPda",
    "anchor_batches.lastError",
    "anchor_batches.solanaTxSignature",
    "anchor_batches.anchoredAt",
    "provenance_events.chainHash",
    "provenance_events.anchorBatchId",
    "provenance_events.anchorStatus",
  ];
  const missing = required.filter((column) => !available.has(column));
  if (missing.length > 0) {
    throw new Error(
      `durable anchor schema is not migrated; missing columns: ${missing.join(", ")}`,
    );
  }
}

function toClaimedBatch(
  row: AnchorBatchRow & { claimToken?: string; claimExpiresAt?: Date },
  claimedFromStatus: string,
): ClaimedAnchorBatch {
  if (
    !isAnchorBatchStatus(row.status) ||
    !ELIGIBLE_STATUSES.includes(claimedFromStatus as AnchorBatchStatus) ||
    !row.claimToken ||
    !row.claimExpiresAt
  ) {
    throw new Error(`Invalid persisted anchor batch state for ${row.id}`);
  }
  const batchKey = decodeHex(row.batchKey, 32, "batchKey");
  const auditRoot = decodeHex(row.auditRoot, 64, "auditRoot");
  return {
    id: row.id,
    batchKey,
    auditRoot,
    startSequence: row.startSequence,
    endSequence: row.endSequence,
    eventCount: row.eventCount,
    schemaVersion: 1,
    sourceCreatedAt: row.createdAt,
    status: row.status,
    claimedFromStatus: claimedFromStatus as ClaimedAnchorBatch["claimedFromStatus"],
    claimToken: row.claimToken,
    claimExpiresAt: row.claimExpiresAt,
    attemptCount: row.attemptCount,
    reconciliationCount: row.reconciliationCount,
    nextAttemptAt: row.nextAttemptAt,
    transactionSignature: row.solanaTxSignature ?? undefined,
    anchorPda: row.anchorPda ?? undefined,
    lastError: row.lastError ?? undefined,
  };
}

function decodeHex(value: string, bytes: number, field: string): Uint8Array {
  if (!new RegExp(`^[0-9a-f]{${bytes * 2}}$`).test(value)) {
    throw new Error(`Persisted anchor batch ${field} is invalid`);
  }
  return Uint8Array.from(Buffer.from(value, "hex"));
}

function isAnchorBatchStatus(value: string): value is AnchorBatchStatus {
  return ALL_STATUSES.includes(value as AnchorBatchStatus);
}
