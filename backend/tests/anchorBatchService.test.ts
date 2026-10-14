import {
  AnchorBatchScheduler,
  AnchorBatchService,
} from "../src/services/anchor/anchorBatchService.js";
import { deriveAnchorBatch } from "../src/services/anchor/anchorProtocol.js";
import {
  computeChainHash,
  hashProvenanceEvent,
  serializeProvenanceEvent,
  type ProvenanceEventInput,
} from "../src/utils/provenance.js";
import type { prisma } from "../src/db/prisma.js";

function row(
  id: bigint,
  input: ProvenanceEventInput,
  previousHash: string | null,
) {
  const payloadHash = hashProvenanceEvent(input);
  return {
    id,
    ...input,
    canonicalPayload: serializeProvenanceEvent(input),
    payloadHash,
    previous_hash: previousHash,
    chainHash: computeChainHash(input, previousHash),
  };
}

function databaseWithRows(
  rows: ReturnType<typeof row>[],
  predecessor: { chainHash: string } | null = null,
  linkCount = rows.length,
) {
  const queryRaw = jest.fn().mockImplementation((strings: TemplateStringsArray) => {
    const sql = strings.join("");
    if (sql.includes("pg_advisory_xact_lock")) return [{ locked: 1 }];
    if (sql.includes("SELECT \"chainHash\"")) return predecessor ? [predecessor] : [];
    return rows;
  });
  const executeRaw = jest.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(linkCount);
  const tx = { $queryRaw: queryRaw, $executeRaw: executeRaw };
  const database = {
    $transaction: jest.fn((callback: (transaction: typeof tx) => unknown) =>
      callback(tx),
    ),
  } as unknown as typeof prisma;
  return { database, queryRaw, executeRaw };
}

function input(entityId: string, occurredAt: string): ProvenanceEventInput {
  return {
    eventType: "DONATION_SUCCESS",
    entityType: "Donation",
    entityId,
    amountInr: "12.50",
    ngoId: "123e4567-e89b-12d3-a456-426614174000",
    campaignId: null,
    occurredAt: new Date(occurredAt),
  };
}

describe("AnchorBatchService", () => {
  it("creates a protocol-compatible deterministic batch from the contiguous eligible prefix", async () => {
    const first = row(
      41n,
      input("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "2026-10-14T10:00:00.000Z"),
      null,
    );
    const second = row(
      42n,
      input("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", "2026-10-14T10:01:00.000Z"),
      first.chainHash,
    );
    const afterGap = row(
      44n,
      input("cccccccc-cccc-4ccc-8ccc-cccccccccccc", "2026-10-14T10:02:00.000Z"),
      second.chainHash,
    );
    const { database, executeRaw, queryRaw } = databaseWithRows([
      first,
      second,
      afterGap,
    ], null, 2);
    const service = new AnchorBatchService(
      database,
      20,
      () => new Date("2026-10-14T10:05:00.000Z"),
    );

    const result = await service.createNextBatch();
    const expected = deriveAnchorBatch(41n, [first.payloadHash, second.payloadHash]);

    expect(result).toMatchObject({
      batchKey: Buffer.from(expected.batchKey).toString("hex"),
      auditRoot: Buffer.from(expected.auditRoot).toString("hex"),
      startSequence: 41n,
      endSequence: 42n,
      eventCount: 2,
    });
    expect(queryRaw.mock.calls[0][0].join("")).toContain("pg_advisory_xact_lock");
    const selectSql = queryRaw.mock.calls[1][0].join("");
    expect(selectSql).toContain('"chainHash" IS NOT NULL');
    expect(selectSql).toContain('"anchorBatchId" IS NULL');
    expect(selectSql).toContain('"anchorStatus" = \'PENDING\'');
    expect(executeRaw.mock.calls[1]).toContainEqual([41n, 42n]);
  });

  it("rolls back the batch when event membership cannot be linked exactly", async () => {
    const first = row(
      51n,
      input("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "2026-10-14T10:00:00.000Z"),
      null,
    );
    const { database } = databaseWithRows([first], null, 0);
    const service = new AnchorBatchService(database);

    await expect(service.createNextBatch()).rejects.toThrow(
      "Provenance events changed while creating anchor batch",
    );
  });

  it("shares in-flight scheduler work and stops scheduling on shutdown", async () => {
    let resolveBatch!: (value: null) => void;
    const createNextBatch = jest.fn(
      () => new Promise<null>((resolve) => { resolveBatch = resolve; }),
    );
    const scheduler = new AnchorBatchScheduler(
      { createNextBatch },
      1,
    );
    const first = scheduler.runOnce();
    const second = scheduler.runOnce();

    expect(first).toBe(second);
    expect(createNextBatch).toHaveBeenCalledTimes(1);
    resolveBatch(null);
    await first;
    await scheduler.stop();
    await expect(scheduler.runOnce()).resolves.toBeNull();
    expect(createNextBatch).toHaveBeenCalledTimes(1);
  });
});
