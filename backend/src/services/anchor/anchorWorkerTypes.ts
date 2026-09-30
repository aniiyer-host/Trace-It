import type { AnchorBatch, AnchorResult, AnchorResultStatus } from "./anchorTypes.js";

export type AnchorBatchStatus =
  | "PENDING"
  | "RETRYABLE"
  | "SUBMITTING"
  | "RECONCILIATION_REQUIRED"
  | "CONFIRMED"
  | "TERMINAL_FAILURE"
  | "DEAD_LETTER";

export interface PersistedAnchorBatch extends AnchorBatch {
  id: string;
  sourceCreatedAt: Date;
  status: AnchorBatchStatus;
  attemptCount: number;
  reconciliationCount: number;
  nextAttemptAt: Date;
  transactionSignature?: string;
  anchorPda?: string;
  lastError?: string;
}

export interface ClaimedAnchorBatch extends PersistedAnchorBatch {
  claimToken: string;
  claimedFromStatus: Exclude<AnchorBatchStatus, "CONFIRMED" | "TERMINAL_FAILURE" | "DEAD_LETTER">;
  claimExpiresAt: Date;
}

export interface AnchorTransition {
  claimToken: string;
  attemptCount: number;
  reconciliationCount?: number;
  transactionSignature?: string;
  anchorPda?: string;
  error?: string;
  nextAttemptAt?: Date;
  completedAt?: Date;
}

/**
 * Backend/Data implementations must make claim and every transition atomic,
 * reject expired/stale claim tokens, and never mutate the batch payload.
 */
export interface AnchorBatchRepository {
  recoverExpiredClaims(now: Date): Promise<number>;
  claimNext(workerId: string, now: Date, leaseMs: number): Promise<ClaimedAnchorBatch | null>;
  renewClaim(id: string, claimToken: string, now: Date, leaseMs: number): Promise<void>;
  markSubmitting(id: string, transition: AnchorTransition): Promise<void>;
  markReconciliationRequired(id: string, transition: AnchorTransition): Promise<void>;
  markRetryable(id: string, transition: AnchorTransition): Promise<void>;
  markConfirmed(id: string, transition: AnchorTransition): Promise<void>;
  markTerminalFailure(id: string, transition: AnchorTransition): Promise<void>;
  markDeadLetter(id: string, transition: AnchorTransition): Promise<void>;
  getBacklogSnapshot(now: Date): Promise<AnchorBacklogSnapshot>;
}

export interface AnchorBacklogSnapshot {
  counts: Partial<Record<AnchorBatchStatus, number>>;
  oldestPendingAgeMs: number;
}

export interface AnchorPublisher {
  verifyAnchorRecord(batch: AnchorBatch): Promise<AnchorResult>;
  submitAnchorBatch(batch: AnchorBatch): Promise<AnchorResult>;
  reconcileAnchorSubmission(batch: AnchorBatch): Promise<AnchorResult>;
}

export interface AnchorWorkerLogger {
  info(event: string, fields: Record<string, unknown>): void;
  warn(event: string, fields: Record<string, unknown>): void;
  error(event: string, fields: Record<string, unknown>): void;
}

export interface AnchorWorkerMetrics {
  observeBacklog(snapshot: AnchorBacklogSnapshot): void;
  observeResult(status: AnchorResultStatus, latencyMs: number): void;
  observeConfirmationLatency?(latencyMs: number): void;
  observeAuthorityBalance?(lamports: number): void;
  incrementConflict?(): void;
  incrementRecoveredClaims?(count: number): void;
}

export interface AnchorAuthorityMonitor {
  getBalanceLamports(): Promise<number>;
}

export interface AnchorWorkerPolicy {
  leaseMs: number;
  pollIntervalMs: number;
  baseRetryDelayMs: number;
  maxRetryDelayMs: number;
  jitterRatio: number;
  maxAttempts: number;
  reconciliationChecksBeforeResubmit: number;
}

export const DEFAULT_ANCHOR_WORKER_POLICY: AnchorWorkerPolicy = {
  leaseMs: 30_000,
  pollIntervalMs: 1_000,
  baseRetryDelayMs: 1_000,
  maxRetryDelayMs: 60_000,
  jitterRatio: 0.2,
  maxAttempts: 8,
  reconciliationChecksBeforeResubmit: 3,
};
