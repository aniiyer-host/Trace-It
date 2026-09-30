import type { AnchorResult, AnchorResultStatus } from "./anchorTypes.js";
import {
  DEFAULT_ANCHOR_WORKER_POLICY,
  type AnchorAuthorityMonitor,
  type AnchorBatchRepository,
  type AnchorPublisher,
  type AnchorTransition,
  type AnchorWorkerLogger,
  type AnchorWorkerMetrics,
  type AnchorWorkerPolicy,
  type ClaimedAnchorBatch,
} from "./anchorWorkerTypes.js";

const NOOP_LOGGER: AnchorWorkerLogger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

const NOOP_METRICS: AnchorWorkerMetrics = {
  observeBacklog: () => undefined,
  observeResult: () => undefined,
};

const TERMINAL_STATUSES = new Set<AnchorResultStatus>([
  "PROGRAM_REJECTED",
  "UNAUTHORIZED",
  "INTEGRITY_CONFLICT",
  "ACCOUNT_INVALID",
  "UNSUPPORTED_SCHEMA_VERSION",
  "INVALID_INPUT",
]);

export class AnchorWorker {
  private readonly policy: AnchorWorkerPolicy;
  private readonly abortController = new AbortController();
  private runPromise?: Promise<void>;

  constructor(
    private readonly workerId: string,
    private readonly repository: AnchorBatchRepository,
    private readonly publisher: AnchorPublisher,
    options: {
      policy?: Partial<AnchorWorkerPolicy>;
      logger?: AnchorWorkerLogger;
      metrics?: AnchorWorkerMetrics;
      authorityMonitor?: AnchorAuthorityMonitor;
      now?: () => Date;
      random?: () => number;
    } = {},
  ) {
    this.policy = { ...DEFAULT_ANCHOR_WORKER_POLICY, ...options.policy };
    this.logger = options.logger ?? NOOP_LOGGER;
    this.metrics = options.metrics ?? NOOP_METRICS;
    this.authorityMonitor = options.authorityMonitor;
    this.now = options.now ?? (() => new Date());
    this.random = options.random ?? Math.random;
    validatePolicy(this.policy);
  }

  private readonly logger: AnchorWorkerLogger;
  private readonly metrics: AnchorWorkerMetrics;
  private readonly authorityMonitor?: AnchorAuthorityMonitor;
  private readonly now: () => Date;
  private readonly random: () => number;

  start(): void {
    if (this.runPromise) return;
    this.runPromise = this.runLoop();
  }

  async stop(): Promise<void> {
    this.abortController.abort();
    await this.runPromise;
  }

  async runOnce(): Promise<"IDLE" | "PROCESSED"> {
    const now = this.now();
    const recovered = await this.repository.recoverExpiredClaims(now);
    if (recovered > 0) {
      this.metrics.incrementRecoveredClaims?.(recovered);
      this.logger.warn("anchor_worker_claims_recovered", { count: recovered });
    }
    await this.observeHealth(now);

    const batch = await this.repository.claimNext(
      this.workerId,
      now,
      this.policy.leaseMs,
    );
    if (!batch) return "IDLE";

    const stopHeartbeat = this.startClaimHeartbeat(batch);
    try {
      await this.processClaim(batch);
    } catch (error) {
      // A persistence failure deliberately leaves the lease/state intact. A
      // later worker recovers it and reconciles on-chain state before sending.
      this.logger.error("anchor_worker_persistence_failure", {
        batchId: batch.id,
        claimedFromStatus: batch.claimedFromStatus,
        error: errorMessage(error),
      });
    } finally {
      stopHeartbeat();
    }
    return "PROCESSED";
  }

  private async runLoop(): Promise<void> {
    while (!this.abortController.signal.aborted) {
      try {
        const outcome = await this.runOnce();
        if (outcome === "IDLE") await delay(this.policy.pollIntervalMs, this.abortController.signal);
      } catch (error) {
        this.logger.error("anchor_worker_loop_failure", { error: errorMessage(error) });
        await delay(this.policy.pollIntervalMs, this.abortController.signal);
      }
    }
  }

  private async processClaim(batch: ClaimedAnchorBatch): Promise<void> {
    const ambiguous =
      batch.claimedFromStatus === "SUBMITTING" ||
      batch.claimedFromStatus === "RECONCILIATION_REQUIRED";

    if (ambiguous) {
      await this.reconcileClaim(batch);
      return;
    }

    const existing = await this.callPublisher("verify", () =>
      this.publisher.verifyAnchorRecord(batch),
    );
    if (isConfirmed(existing)) {
      await this.confirm(batch, existing, batch.attemptCount);
      return;
    }
    if (existing.status !== "NOT_FOUND") {
      await this.handleResult(batch, existing, batch.attemptCount + 1, false);
      return;
    }

    const attemptCount = batch.attemptCount + 1;
    const baseTransition = this.transition(batch, attemptCount, existing);
    await this.repository.markSubmitting(batch.id, baseTransition);

    const submitted = await this.callPublisher("submit", () =>
      this.publisher.submitAnchorBatch(batch),
    );
    await this.handleResult(batch, submitted, attemptCount, true);
  }

  private async reconcileClaim(batch: ClaimedAnchorBatch): Promise<void> {
    const result = await this.callPublisher("reconcile", () =>
      this.publisher.reconcileAnchorSubmission(batch),
    );
    if (isConfirmed(result)) {
      await this.confirm(batch, result, batch.attemptCount);
      return;
    }

    if (result.status === "PENDING_CONFIRMATION" || result.status === "NOT_FOUND") {
      const reconciliationCount = batch.reconciliationCount + 1;
      const transition = this.transition(batch, batch.attemptCount, result, {
        reconciliationCount,
      });
      if (reconciliationCount >= this.policy.reconciliationChecksBeforeResubmit) {
        await this.scheduleRetry(batch, transition, "anchor absent after bounded reconciliation");
      } else {
        await this.repository.markReconciliationRequired(batch.id, {
          ...transition,
          nextAttemptAt: this.nextAttemptAt(reconciliationCount),
        });
      }
      return;
    }
    await this.handleResult(batch, result, batch.attemptCount + 1, false);
  }

  private async handleResult(
    batch: ClaimedAnchorBatch,
    result: AnchorResult,
    attemptCount: number,
    submissionStarted: boolean,
  ): Promise<void> {
    if (isConfirmed(result)) {
      await this.confirm(batch, result, attemptCount);
      return;
    }

    const transition = this.transition(batch, attemptCount, result);
    if (result.status === "PENDING_CONFIRMATION") {
      await this.repository.markReconciliationRequired(batch.id, {
        ...transition,
        nextAttemptAt: this.nextAttemptAt(Math.max(1, attemptCount)),
      });
      return;
    }
    if (TERMINAL_STATUSES.has(result.status)) {
      if (result.status === "INTEGRITY_CONFLICT") this.metrics.incrementConflict?.();
      await this.repository.markTerminalFailure(batch.id, transition);
      this.logger.error("anchor_worker_terminal_failure", {
        batchId: batch.id,
        status: result.status,
        error: result.error,
      });
      return;
    }
    if (result.status === "RETRYABLE_RPC_FAILURE" || result.status === "RETRYABLE_BLOCKHASH_FAILURE") {
      // Once a transaction may have been sent, an RPC result is ambiguous.
      if (submissionStarted && result.signature) {
        await this.repository.markReconciliationRequired(batch.id, {
          ...transition,
          nextAttemptAt: this.nextAttemptAt(Math.max(1, attemptCount)),
        });
      } else {
        await this.scheduleRetry(batch, transition, result.error);
      }
      return;
    }
    await this.scheduleRetry(batch, transition, result.error);
  }

  private async scheduleRetry(
    batch: ClaimedAnchorBatch,
    transition: AnchorTransition,
    error?: string,
  ): Promise<void> {
    if (transition.attemptCount >= this.policy.maxAttempts) {
      await this.repository.markDeadLetter(batch.id, {
        ...transition,
        error: error ?? transition.error ?? "anchor retry budget exhausted",
        completedAt: this.now(),
      });
      this.logger.error("anchor_worker_batch_dead_lettered", {
        batchId: batch.id,
        attemptCount: transition.attemptCount,
        error: error ?? transition.error,
      });
      return;
    }
    await this.repository.markRetryable(batch.id, {
      ...transition,
      error: error ?? transition.error,
      nextAttemptAt: this.nextAttemptAt(Math.max(1, transition.attemptCount)),
    });
    this.logger.warn("anchor_worker_batch_retry_scheduled", {
      batchId: batch.id,
      attemptCount: transition.attemptCount,
      error: error ?? transition.error,
    });
  }

  private async confirm(
    batch: ClaimedAnchorBatch,
    result: AnchorResult,
    attemptCount: number,
  ): Promise<void> {
    await this.repository.markConfirmed(
      batch.id,
      this.transition(batch, attemptCount, result, { completedAt: this.now() }),
    );
    this.metrics.observeConfirmationLatency?.(
      Math.max(0, this.now().getTime() - batch.sourceCreatedAt.getTime()),
    );
    this.logger.info("anchor_worker_batch_confirmed", {
      batchId: batch.id,
      status: result.status,
      signature: result.signature,
      pda: result.pda,
    });
  }

  private transition(
    batch: ClaimedAnchorBatch,
    attemptCount: number,
    result: AnchorResult,
    overrides: Partial<AnchorTransition> = {},
  ): AnchorTransition {
    return {
      claimToken: batch.claimToken,
      attemptCount,
      reconciliationCount: batch.reconciliationCount,
      transactionSignature: result.signature ?? batch.transactionSignature,
      anchorPda: result.pda ?? batch.anchorPda,
      error: result.error,
      ...overrides,
    };
  }

  private nextAttemptAt(exponent: number): Date {
    const base = Math.min(
      this.policy.maxRetryDelayMs,
      this.policy.baseRetryDelayMs * 2 ** Math.max(0, exponent - 1),
    );
    const jitter = base * this.policy.jitterRatio * (this.random() * 2 - 1);
    return new Date(this.now().getTime() + Math.max(0, Math.round(base + jitter)));
  }

  private async callPublisher(
    operation: string,
    call: () => Promise<AnchorResult>,
  ): Promise<AnchorResult> {
    const startedAt = this.now().getTime();
    try {
      const result = await call();
      this.metrics.observeResult(result.status, Math.max(0, this.now().getTime() - startedAt));
      return result;
    } catch (error) {
      const result: AnchorResult = {
        status: "RETRYABLE_RPC_FAILURE",
        error: errorMessage(error),
      };
      this.metrics.observeResult(result.status, Math.max(0, this.now().getTime() - startedAt));
      this.logger.warn("anchor_worker_publisher_failure", { operation, error: result.error });
      return result;
    }
  }

  private async observeHealth(now: Date): Promise<void> {
    try {
      this.metrics.observeBacklog(await this.repository.getBacklogSnapshot(now));
    } catch (error) {
      this.logger.warn("anchor_worker_backlog_metrics_failed", {
        error: errorMessage(error),
      });
    }
    if (!this.authorityMonitor) return;
    try {
      this.metrics.observeAuthorityBalance?.(await this.authorityMonitor.getBalanceLamports());
    } catch (error) {
      this.logger.warn("anchor_worker_balance_check_failed", { error: errorMessage(error) });
    }
  }

  private startClaimHeartbeat(batch: ClaimedAnchorBatch): () => void {
    const interval = setInterval(() => {
      void this.repository
        .renewClaim(batch.id, batch.claimToken, this.now(), this.policy.leaseMs)
        .catch((error) => {
          this.logger.error("anchor_worker_claim_renewal_failed", {
            batchId: batch.id,
            error: errorMessage(error),
          });
        });
    }, Math.max(1, Math.floor(this.policy.leaseMs / 3)));
    interval.unref();
    return () => clearInterval(interval);
  }
}

function isConfirmed(result: AnchorResult): boolean {
  return result.status === "CONFIRMED" || result.status === "ALREADY_CONFIRMED_MATCH";
}

function validatePolicy(policy: AnchorWorkerPolicy): void {
  if (
    policy.leaseMs <= 0 ||
    policy.pollIntervalMs <= 0 ||
    policy.baseRetryDelayMs <= 0 ||
    policy.maxRetryDelayMs < policy.baseRetryDelayMs ||
    policy.maxAttempts <= 0 ||
    policy.reconciliationChecksBeforeResubmit <= 0 ||
    policy.jitterRatio < 0 ||
    policy.jitterRatio > 1
  ) {
    throw new Error("invalid anchor worker policy");
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function delay(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const timeout = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timeout);
        resolve();
      },
      { once: true },
    );
  });
}
