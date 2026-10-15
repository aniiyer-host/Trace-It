import {
  AnchorClaimLostError,
  PrismaAnchorBatchRepository,
} from "../src/services/anchor/prismaAnchorBatchRepository.js";
import type { prisma } from "../src/db/prisma.js";

const NOW = new Date("2026-10-14T12:00:00.000Z");

function batchRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "batch-1",
    batchKey: "ab".repeat(32),
    auditRoot: "cd".repeat(64),
    startSequence: 41n,
    endSequence: 42n,
    eventCount: 2,
    status: "PENDING",
    createdAt: new Date("2026-10-14T11:00:00.000Z"),
    attemptCount: 0,
    reconciliationCount: 0,
    nextAttemptAt: NOW,
    solanaTxSignature: null,
    anchorPda: null,
    lastError: null,
    ...overrides,
  };
}

describe("PrismaAnchorBatchRepository", () => {
  it("recovers expired claims without changing in-progress state", async () => {
    let sql = "";
    const executeRaw = jest.fn().mockImplementation((strings: TemplateStringsArray) => {
      sql = strings.join("");
      return Promise.resolve(2);
    });
    const db = {
      $executeRaw: executeRaw,
    } as unknown as typeof prisma;
    const repository = new PrismaAnchorBatchRepository(db);

    await expect(repository.recoverExpiredClaims(NOW)).resolves.toBe(2);

    expect(sql).toContain('"claimToken" = NULL, "claimExpiresAt" = NULL');
    expect(sql).toContain('"claimExpiresAt" <=');
    expect(sql).not.toContain('"status" = ');
  });

  it("claims a persisted batch using a row lock and a compare-and-set lease", async () => {
    let isClaimed = false;
    let updateSql = "";
    const candidate = batchRow();
    const queryRaw = jest
      .fn()
      .mockImplementation(
        (strings: TemplateStringsArray, ...values: unknown[]) => {
          const sql = strings.join("");
          if (sql.includes("FOR UPDATE SKIP LOCKED")) return [candidate];
          updateSql = sql;
          if (isClaimed) return [];
          isClaimed = true;
          return [
            batchRow({
              status: candidate.status,
              claimToken: values[0],
              claimExpiresAt: values[1],
            }),
          ];
        },
      );
    const executeRaw = jest.fn();
    const db = {
      $transaction: jest.fn((callback: (tx: { $queryRaw: jest.Mock; $executeRaw: jest.Mock }) => unknown) =>
        callback({ $queryRaw: queryRaw, $executeRaw: executeRaw }),
      ),
    } as unknown as typeof prisma;
    const repository = new PrismaAnchorBatchRepository(db);

    const claims = await Promise.all([
      repository.claimNext("worker-a", NOW, 30_000),
      repository.claimNext("worker-b", NOW, 30_000),
    ]);

    expect(claims.filter(Boolean)).toHaveLength(1);
    expect(queryRaw.mock.calls[0][0].join("")).toContain("FOR UPDATE SKIP LOCKED");
    expect(updateSql).toContain('"claimToken" IS NULL OR "claimExpiresAt" <=');
    expect(claims.find(Boolean)).toMatchObject({
      id: "batch-1",
      claimedFromStatus: "PENDING",
      claimToken: expect.stringMatching(/^worker-[ab]:/),
      attemptCount: 0,
    });
  });

  it("persists confirmation and event status in one transaction", async () => {
    const statements: string[] = [];
    const executeRaw = jest.fn().mockImplementation((strings: TemplateStringsArray) => {
      statements.push(strings.join(""));
      return Promise.resolve(statements.length === 1 ? 1 : 2);
    });
    const db = {
      $transaction: jest.fn(
        (callback: (tx: { $queryRaw: jest.Mock; $executeRaw: jest.Mock }) => unknown) =>
          callback({ $queryRaw: jest.fn(), $executeRaw: executeRaw }),
      ),
    } as unknown as typeof prisma;
    const repository = new PrismaAnchorBatchRepository(db);

    await repository.markConfirmed("batch-1", {
      claimToken: "worker:token",
      attemptCount: 1,
      transactionSignature: "confirmed-signature",
      anchorPda: "confirmed-pda",
      completedAt: NOW,
    });

    expect(statements[0]).toContain('"status" = ');
    expect(statements[0]).toContain('"solanaTxSignature"');
    expect(statements[0]).toContain('"claimExpiresAt" > (CURRENT_TIMESTAMP AT TIME ZONE \'UTC\')');
    expect(statements[1]).toContain('"anchorStatus" = ');
    expect(statements[1]).toContain('"processedAt" = ');
    expect(executeRaw.mock.calls[0]).toContain("CONFIRMED");
    expect(executeRaw.mock.calls[0]).toContain("confirmed-signature");
    expect(executeRaw.mock.calls[0]).toContain("confirmed-pda");
    expect(executeRaw.mock.calls[1]).toContain("ANCHORED");
  });

  it("stores an ambiguous signature without marking events anchored", async () => {
    const statements: string[] = [];
    const executeRaw = jest.fn().mockImplementation((strings: TemplateStringsArray) => {
      statements.push(strings.join(""));
      return Promise.resolve(1);
    });
    const db = {
      $transaction: jest.fn(
        (callback: (tx: { $queryRaw: jest.Mock; $executeRaw: jest.Mock }) => unknown) =>
          callback({ $queryRaw: jest.fn(), $executeRaw: executeRaw }),
      ),
    } as unknown as typeof prisma;
    const repository = new PrismaAnchorBatchRepository(db);
    const retryAt = new Date(NOW.getTime() + 2_000);

    await repository.markReconciliationRequired("batch-1", {
      claimToken: "worker:token",
      attemptCount: 1,
      reconciliationCount: 1,
      transactionSignature: "pending-signature",
      anchorPda: "pending-pda",
      error: "confirmation is still pending",
      nextAttemptAt: retryAt,
    });

    expect(executeRaw.mock.calls[0]).toContain("RECONCILIATION_REQUIRED");
    expect(executeRaw.mock.calls[0]).toContain("pending-signature");
    expect(executeRaw.mock.calls[0]).toContain(retryAt);
    expect(statements[0]).toContain('"claimToken" = CASE WHEN ');
    expect(statements[1]).not.toContain('"anchorStatus" = ');
    expect(statements[1]).toContain('"lastError" = ');
  });

  it("does not report stale claim transitions as successful", async () => {
    const executeRaw = jest.fn().mockResolvedValue(0);
    const db = {
      $transaction: jest.fn(
        (callback: (tx: { $queryRaw: jest.Mock; $executeRaw: jest.Mock }) => unknown) =>
          callback({ $queryRaw: jest.fn(), $executeRaw: executeRaw }),
      ),
    } as unknown as typeof prisma;
    const repository = new PrismaAnchorBatchRepository(db);

    await expect(
      repository.markConfirmed("batch-1", {
        claimToken: "expired-token",
        attemptCount: 1,
      }),
    ).rejects.toBeInstanceOf(AnchorClaimLostError);
    expect(executeRaw).toHaveBeenCalledTimes(1);
  });
});
