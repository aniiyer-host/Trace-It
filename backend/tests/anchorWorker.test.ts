import crypto from "crypto";
import {
  AnchorWorker,
  type AnchorBatchRepository,
  type AnchorPublisher,
  type AnchorWorkerLogger,
  type AnchorWorkerMetrics,
  type ClaimedAnchorBatch,
} from "../src/services/anchor/index.js";

const NOW = new Date("2026-09-30T12:00:00.000Z");

function hash(label: string, length: number): Uint8Array {
  return Uint8Array.from(
    crypto.createHash("sha512").update(label).digest().subarray(0, length),
  );
}

function claim(overrides: Partial<ClaimedAnchorBatch> = {}): ClaimedAnchorBatch {
  return {
    id: "batch-1",
    batchKey: hash("batch-key", 32),
    auditRoot: hash("audit-root", 64),
    startSequence: 1n,
    endSequence: 3n,
    eventCount: 3,
    schemaVersion: 1,
    sourceCreatedAt: new Date("2026-09-30T11:00:00.000Z"),
    status: "PENDING",
    claimedFromStatus: "PENDING",
    claimToken: "claim-token",
    claimExpiresAt: new Date("2026-09-30T12:00:30.000Z"),
    attemptCount: 0,
    reconciliationCount: 0,
    nextAttemptAt: NOW,
    ...overrides,
  };
}

function repository(batch: ClaimedAnchorBatch | null = claim()): jest.Mocked<AnchorBatchRepository> {
  return {
    recoverExpiredClaims: jest.fn().mockResolvedValue(0),
    claimNext: jest.fn().mockResolvedValueOnce(batch).mockResolvedValue(null),
    renewClaim: jest.fn().mockResolvedValue(undefined),
    markSubmitting: jest.fn().mockResolvedValue(undefined),
    markReconciliationRequired: jest.fn().mockResolvedValue(undefined),
    markRetryable: jest.fn().mockResolvedValue(undefined),
    markConfirmed: jest.fn().mockResolvedValue(undefined),
    markTerminalFailure: jest.fn().mockResolvedValue(undefined),
    markDeadLetter: jest.fn().mockResolvedValue(undefined),
    getBacklogSnapshot: jest.fn().mockResolvedValue({
      counts: { PENDING: batch ? 1 : 0 },
      oldestPendingAgeMs: batch ? 3_600_000 : 0,
    }),
  };
}

function publisher(): jest.Mocked<AnchorPublisher> {
  return {
    verifyAnchorRecord: jest.fn().mockResolvedValue({ status: "NOT_FOUND" }),
    submitAnchorBatch: jest.fn().mockResolvedValue({
      status: "CONFIRMED",
      signature: "signature-1",
      pda: "anchor-pda",
    }),
    reconcileAnchorSubmission: jest.fn().mockResolvedValue({
      status: "PENDING_CONFIRMATION",
      pda: "anchor-pda",
    }),
  };
}

function worker(
  repo: AnchorBatchRepository,
  chain: AnchorPublisher,
  options: ConstructorParameters<typeof AnchorWorker>[3] = {},
): AnchorWorker {
  return new AnchorWorker("worker-1", repo, chain, {
    now: () => NOW,
    random: () => 0.5,
    policy: {
      baseRetryDelayMs: 1_000,
      maxRetryDelayMs: 8_000,
      maxAttempts: 3,
      pollIntervalMs: 5,
      ...options.policy,
    },
    ...options,
  });
}

describe("AnchorWorker", () => {
  it("claims, marks submitting before send, and persists confirmation", async () => {
    const repo = repository();
    const chain = publisher();
    const order: string[] = [];
    repo.markSubmitting.mockImplementation(async () => { order.push("submitting"); });
    chain.submitAnchorBatch.mockImplementation(async () => {
      order.push("send");
      return { status: "CONFIRMED", signature: "signature-1", pda: "anchor-pda" };
    });
    repo.markConfirmed.mockImplementation(async () => { order.push("confirmed"); });

    await expect(worker(repo, chain).runOnce()).resolves.toBe("PROCESSED");

    expect(order).toEqual(["submitting", "send", "confirmed"]);
    expect(repo.markConfirmed).toHaveBeenCalledWith(
      "batch-1",
      expect.objectContaining({
        claimToken: "claim-token",
        attemptCount: 1,
        transactionSignature: "signature-1",
        anchorPda: "anchor-pda",
      }),
    );
  });

  it("backs off an unavailable RPC without submitting", async () => {
    const repo = repository();
    const chain = publisher();
    chain.verifyAnchorRecord.mockResolvedValue({
      status: "RETRYABLE_RPC_FAILURE",
      error: "RPC unavailable",
    });

    await worker(repo, chain).runOnce();

    expect(chain.submitAnchorBatch).not.toHaveBeenCalled();
    expect(repo.markRetryable).toHaveBeenCalledWith(
      "batch-1",
      expect.objectContaining({
        attemptCount: 1,
        error: "RPC unavailable",
        nextAttemptAt: new Date("2026-09-30T12:00:01.000Z"),
      }),
    );
  });

  it("submits successfully after RPC recovery on a later claim", async () => {
    const first = claim();
    const second = claim({
      status: "RETRYABLE",
      claimedFromStatus: "RETRYABLE",
      claimToken: "claim-token-2",
      attemptCount: 1,
    });
    const repo = repository(first);
    repo.claimNext
      .mockReset()
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce(second);
    const chain = publisher();
    chain.verifyAnchorRecord
      .mockResolvedValueOnce({
        status: "RETRYABLE_RPC_FAILURE",
        error: "RPC unavailable",
      })
      .mockResolvedValueOnce({ status: "NOT_FOUND" });
    const running = worker(repo, chain);

    await running.runOnce();
    await running.runOnce();

    expect(repo.markRetryable).toHaveBeenCalledTimes(1);
    expect(chain.submitAnchorBatch).toHaveBeenCalledTimes(1);
    expect(repo.markConfirmed).toHaveBeenCalledWith(
      "batch-1",
      expect.objectContaining({ claimToken: "claim-token-2", attemptCount: 2 }),
    );
  });

  it("classifies simulation rejection as terminal", async () => {
    const repo = repository();
    const chain = publisher();
    chain.submitAnchorBatch.mockResolvedValue({
      status: "PROGRAM_REJECTED",
      error: "simulation rejected",
    });

    await worker(repo, chain).runOnce();

    expect(repo.markTerminalFailure).toHaveBeenCalledWith(
      "batch-1",
      expect.objectContaining({ attemptCount: 1, error: "simulation rejected" }),
    );
    expect(repo.markRetryable).not.toHaveBeenCalled();
  });

  it("persists an ambiguous signature for reconciliation", async () => {
    const repo = repository();
    const chain = publisher();
    chain.submitAnchorBatch.mockResolvedValue({
      status: "PENDING_CONFIRMATION",
      signature: "ambiguous-signature",
      pda: "anchor-pda",
      error: "confirmation timed out",
    });

    await worker(repo, chain).runOnce();

    expect(repo.markReconciliationRequired).toHaveBeenCalledWith(
      "batch-1",
      expect.objectContaining({
        attemptCount: 1,
        transactionSignature: "ambiguous-signature",
        anchorPda: "anchor-pda",
      }),
    );
  });

  it("reconciles a crash after submission before sending again", async () => {
    const repo = repository(claim({
      status: "SUBMITTING",
      claimedFromStatus: "SUBMITTING",
      attemptCount: 1,
      transactionSignature: "maybe-landed",
    }));
    const chain = publisher();
    chain.reconcileAnchorSubmission.mockResolvedValue({
      status: "CONFIRMED",
      pda: "anchor-pda",
    });

    await worker(repo, chain).runOnce();

    expect(chain.verifyAnchorRecord).not.toHaveBeenCalled();
    expect(chain.submitAnchorBatch).not.toHaveBeenCalled();
    expect(repo.markConfirmed).toHaveBeenCalled();
  });

  it("requires bounded absence checks before making an ambiguous batch retryable", async () => {
    const repo = repository(claim({
      status: "RECONCILIATION_REQUIRED",
      claimedFromStatus: "RECONCILIATION_REQUIRED",
      attemptCount: 1,
      reconciliationCount: 2,
    }));
    const chain = publisher();

    await worker(repo, chain, {
      policy: { reconciliationChecksBeforeResubmit: 3 },
    }).runOnce();

    expect(repo.markRetryable).toHaveBeenCalledWith(
      "batch-1",
      expect.objectContaining({ reconciliationCount: 3 }),
    );
    expect(chain.submitAnchorBatch).not.toHaveBeenCalled();
  });

  it("dead-letters a retryable failure after the attempt budget", async () => {
    const repo = repository(claim({ attemptCount: 2 }));
    const chain = publisher();
    chain.verifyAnchorRecord.mockResolvedValue({
      status: "RETRYABLE_BLOCKHASH_FAILURE",
      error: "blockhash expired",
    });

    await worker(repo, chain).runOnce();

    expect(repo.markDeadLetter).toHaveBeenCalledWith(
      "batch-1",
      expect.objectContaining({ attemptCount: 3, error: "blockhash expired" }),
    );
  });

  it("treats a mismatching existing PDA as a terminal integrity conflict", async () => {
    const repo = repository();
    const chain = publisher();
    const metrics: AnchorWorkerMetrics = {
      observeBacklog: jest.fn(),
      observeResult: jest.fn(),
      incrementConflict: jest.fn(),
    };
    chain.verifyAnchorRecord.mockResolvedValue({
      status: "INTEGRITY_CONFLICT",
      error: "root differs",
    });

    await worker(repo, chain, { metrics }).runOnce();

    expect(repo.markTerminalFailure).toHaveBeenCalled();
    expect(metrics.incrementConflict).toHaveBeenCalledTimes(1);
  });

  it("recovers stale claims and exports backlog, latency, and wallet metrics", async () => {
    const repo = repository(null);
    repo.recoverExpiredClaims.mockResolvedValue(2);
    const metrics: AnchorWorkerMetrics = {
      observeBacklog: jest.fn(),
      observeResult: jest.fn(),
      observeAuthorityBalance: jest.fn(),
      incrementRecoveredClaims: jest.fn(),
    };

    await worker(repo, publisher(), {
      metrics,
      authorityMonitor: { getBalanceLamports: jest.fn().mockResolvedValue(99_000) },
    }).runOnce();

    expect(metrics.incrementRecoveredClaims).toHaveBeenCalledWith(2);
    expect(metrics.observeBacklog).toHaveBeenCalledWith({
      counts: { PENDING: 0 },
      oldestPendingAgeMs: 0,
    });
    expect(metrics.observeAuthorityBalance).toHaveBeenCalledWith(99_000);
  });

  it("leaves a submitted lease recoverable when confirmation persistence fails", async () => {
    const repo = repository();
    const chain = publisher();
    const logger: AnchorWorkerLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };
    repo.markConfirmed.mockRejectedValue(new Error("database unavailable"));

    await expect(worker(repo, chain, { logger }).runOnce()).resolves.toBe("PROCESSED");

    expect(repo.markSubmitting).toHaveBeenCalled();
    expect(repo.markRetryable).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(
      "anchor_worker_persistence_failure",
      expect.objectContaining({ batchId: "batch-1", error: "database unavailable" }),
    );
  });

  it("allows only the repository's single atomic claim across workers", async () => {
    const repo = repository();
    const chain = publisher();
    await Promise.all([
      worker(repo, chain).runOnce(),
      worker(repo, chain).runOnce(),
    ]);

    expect(repo.markSubmitting).toHaveBeenCalledTimes(1);
    expect(chain.submitAnchorBatch).toHaveBeenCalledTimes(1);
  });

  it("stops a polling loop gracefully", async () => {
    const running = worker(repository(null), publisher());
    running.start();
    await expect(running.stop()).resolves.toBeUndefined();
  });
});
