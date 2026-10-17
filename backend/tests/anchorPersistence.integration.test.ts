import "dotenv/config";
import crypto from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";
import { ProvenanceEventType } from "../generated/prisma/enums.js";
import { appendProvenanceEvent } from "../src/services/provenanceChainService.js";
import { AnchorBatchService } from "../src/services/anchor/anchorBatchService.js";
import { deriveAnchorBatch } from "../src/services/anchor/anchorProtocol.js";
import {
  AnchorClaimLostError,
  assertAnchorSchemaReady,
  PrismaAnchorBatchRepository,
} from "../src/services/anchor/prismaAnchorBatchRepository.js";
import type { ProvenanceEventInput } from "../src/utils/provenance.js";

const databaseUrl = process.env.ANCHOR_TEST_DATABASE_URL;
const disposableConfirmation =
  process.env.ANCHOR_TEST_DATABASE_DISPOSABLE;

const anchorPersistenceSuite = databaseUrl ? describe : describe.skip;

const fixtureEventIds: bigint[] = [];
const fixtureBatchIds: string[] = [];

let database: PrismaClient | undefined;

anchorPersistenceSuite("durable anchor persistence (PostgreSQL)", () => {
  beforeAll(async () => {
    if (disposableConfirmation !== "YES_I_CONFIRM") {
      throw new Error(
        "Set ANCHOR_TEST_DATABASE_DISPOSABLE=YES_I_CONFIRM in the test environment only after confirming the anchor test database is disposable",
      );
    }

    if (!databaseUrl) {
      throw new Error(
        "ANCHOR_TEST_DATABASE_URL is required for anchor integration tests",
      );
    }

    const target = new URL(databaseUrl);
    const databaseName = decodeURIComponent(target.pathname.slice(1));


    database = new PrismaClient({
      adapter: new PrismaPg({ connectionString: databaseUrl }),
    });

    await assertAnchorSchemaReady(database);

    const [eventCount, batchCount] = await Promise.all([
      database.provenanceEvent.count(),
      database.anchorBatch.count(),
    ]);

    
  });

  afterEach(async () => {
    if (!database) return;

    if (fixtureBatchIds.length > 0) {
      await database.anchorBatch.deleteMany({
        where: { id: { in: fixtureBatchIds.splice(0) } },
      });
    }

    if (fixtureEventIds.length > 0) {
      await database.provenanceEvent.deleteMany({
        where: { id: { in: fixtureEventIds.splice(0) } },
      });
    }
  });

  afterAll(async () => {
    await database?.$disconnect();
    database = undefined;
  });

  it("creates deterministic batches, links membership once, and excludes already-batched events", async () => {
    const db = requireDatabase();
    const events = await createEvents(3);
    const service = new AnchorBatchService(db, 2);

    const first = await service.createNextBatch();
    const second = await service.createNextBatch();
    const third = await service.createNextBatch();

    if (first) fixtureBatchIds.push(first.id);
    if (second) fixtureBatchIds.push(second.id);

    const expectedFirstBatch = deriveAnchorBatch(
      events[0].id,
      events.slice(0, 2).map((event) => event.payloadHash),
    );

    const linkedEvents = await db.provenanceEvent.findMany({
      where: { id: { in: events.map((event) => event.id) } },
      orderBy: { id: "asc" },
      select: { id: true, anchorBatchId: true, anchorStatus: true },
    });

    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(third).toBeNull();
    expect(first?.eventCount).toBe(2);
    expect(second?.eventCount).toBe(1);

    expect(first?.batchKey).toBe(
      Buffer.from(expectedFirstBatch.batchKey).toString("hex"),
    );

    expect(first?.auditRoot).toBe(
      Buffer.from(expectedFirstBatch.auditRoot).toString("hex"),
    );

    expect(new Set(linkedEvents.map((event) => event.anchorBatchId)).size).toBe(
      2,
    );
    expect(
      linkedEvents.every((event) => event.anchorStatus === "BATCHED"),
    ).toBe(true);
    expect(linkedEvents.map((event) => event.id)).toEqual(
      events.map((event) => event.id),
    );
  });

  it("serializes concurrent schedulers and lets workers claim distinct batches", async () => {
    const db = requireDatabase();
    const events = await createEvents(3);
    const builder = new AnchorBatchService(db, 2);

    const [first, second] = await Promise.all([
      builder.createNextBatch(),
      builder.createNextBatch(),
    ]);

    if (!first || !second) {
      throw new Error(
        "Expected concurrent scheduler runs to create two batches",
      );
    }

    fixtureBatchIds.push(first.id, second.id);

    const repository = new PrismaAnchorBatchRepository(db);
    const now = new Date();

    const claims = await Promise.all([
      repository.claimNext("integration-worker-a", now, 30_000),
      repository.claimNext("integration-worker-b", now, 30_000),
    ]);

    const claimed = claims.filter((claim) => claim !== null);

    const memberships = await db.provenanceEvent.findMany({
      where: { id: { in: events.map((event) => event.id) } },
      select: { id: true, anchorBatchId: true },
    });

    expect(claimed).toHaveLength(2);
    expect(new Set(claimed.map((claim) => claim.id)).size).toBe(2);
    expect(memberships).toHaveLength(3);
    expect(
      new Set(memberships.map((event) => event.anchorBatchId)).size,
    ).toBe(2);
  });

  it("recovers an interrupted submission, rejects stale ownership, and confirms atomically", async () => {
    const db = requireDatabase();

    await createEvents(1);

    const batch = await new AnchorBatchService(db, 1).createNextBatch();

    if (!batch) throw new Error("Expected an anchor batch");

    fixtureBatchIds.push(batch.id);

    const repository = new PrismaAnchorBatchRepository(db);

    const firstClaim = await repository.claimNext(
      "interrupted-worker",
      new Date(),
      30_000,
    );

    if (!firstClaim) throw new Error("Expected first worker claim");

    await repository.markSubmitting(batch.id, {
      claimToken: firstClaim.claimToken,
      attemptCount: 1,
      transactionSignature: "mock-ambiguous-signature",
      anchorPda: "mock-anchor-pda",
    });

    await db.$executeRaw`
      UPDATE "anchor_batches"
      SET "claimExpiresAt" = ${new Date(Date.now() - 1)}
      WHERE "id" = ${batch.id}
    `;

    await expect(repository.recoverExpiredClaims(new Date())).resolves.toBe(1);

    await expect(
      repository.markConfirmed(batch.id, {
        claimToken: firstClaim.claimToken,
        attemptCount: 1,
        completedAt: new Date(),
      }),
    ).rejects.toBeInstanceOf(AnchorClaimLostError);

    const recovered = await repository.claimNext(
      "recovery-worker",
      new Date(),
      30_000,
    );

    expect(recovered).toMatchObject({
      id: batch.id,
      claimedFromStatus: "SUBMITTING",
      transactionSignature: "mock-ambiguous-signature",
    });

    if (!recovered) throw new Error("Expected recovered submission claim");

    const retryAt = new Date(Date.now() - 1);

    await repository.markReconciliationRequired(batch.id, {
      claimToken: recovered.claimToken,
      attemptCount: 1,
      reconciliationCount: 1,
      transactionSignature: recovered.transactionSignature,
      anchorPda: recovered.anchorPda,
      error: "confirmation pending",
      nextAttemptAt: retryAt,
    });

    const confirmClaim = await repository.claimNext(
      "confirmation-worker",
      new Date(),
      30_000,
    );

    expect(confirmClaim?.claimedFromStatus).toBe("RECONCILIATION_REQUIRED");

    if (!confirmClaim) throw new Error("Expected reconciliation claim");

    await repository.markConfirmed(batch.id, {
      claimToken: confirmClaim.claimToken,
      attemptCount: 1,
      transactionSignature: confirmClaim.transactionSignature,
      anchorPda: confirmClaim.anchorPda,
      completedAt: new Date(),
    });

    const [storedBatch, storedEvents] = await Promise.all([
      db.anchorBatch.findUnique({ where: { id: batch.id } }),
      db.provenanceEvent.findMany({
        where: { anchorBatchId: batch.id },
        select: { anchorStatus: true, processedAt: true },
      }),
    ]);

    expect(storedBatch).toMatchObject({
      status: "CONFIRMED",
      solanaTxSignature: "mock-ambiguous-signature",
      anchorPda: "mock-anchor-pda",
      attemptCount: 1,
    });

    expect(storedBatch?.anchoredAt).toBeInstanceOf(Date);
    expect(storedEvents).toHaveLength(1);
    expect(storedEvents[0]).toMatchObject({ anchorStatus: "ANCHORED" });
    expect(storedEvents[0].processedAt).toBeInstanceOf(Date);
  });

  it("rolls back batch insertion when provenance event linking fails", async () => {
    const db = requireDatabase();
    const [event] = await createEvents(1);
    const builder = new AnchorBatchService(db, 1);

    await db.$executeRaw`
      ALTER TABLE "provenance_events"
      ADD CONSTRAINT "anchor_test_force_link_failure_check"
      CHECK ("anchorStatus" <> 'BATCHED') NOT VALID
    `;

    try {
      await expect(builder.createNextBatch()).rejects.toThrow();
    } finally {
      await db.$executeRaw`
        ALTER TABLE "provenance_events"
        DROP CONSTRAINT "anchor_test_force_link_failure_check"
      `;
    }

    const [storedEvent, createdBatches] = await Promise.all([
      db.provenanceEvent.findUnique({
        where: { id: event.id },
        select: { anchorBatchId: true, anchorStatus: true },
      }),
      db.anchorBatch.count({
        where: {
          startSequence: event.id,
          endSequence: event.id,
        },
      }),
    ]);

    expect(storedEvent).toMatchObject({
      anchorBatchId: null,
      anchorStatus: "PENDING",
    });
    expect(createdBatches).toBe(0);
  });
});

function requireDatabase(): PrismaClient {
  if (!database) {
    throw new Error("Anchor integration database was not initialized");
  }

  return database;
}

async function createEvents(count: number) {
  const db = requireDatabase();

  const records = await db.$transaction(async (tx) => {
    const created = [];

    for (let index = 0; index < count; index += 1) {
      const input: Omit<ProvenanceEventInput, "eventType"> & {
        eventType: ProvenanceEventType;
      } = {
        eventType: ProvenanceEventType.DONATION_SUCCESS,
        entityType: "AnchorIntegrationTest",
        entityId: crypto.randomUUID(),
        amountInr: "1.00",
        ngoId: null,
        campaignId: null,
        occurredAt: new Date(Date.now() + index),
      };

      const event = await appendProvenanceEvent(
        tx,
        input,
        `anchor-integration-${crypto.randomUUID()}`,
      );

      created.push(event);
    }

    return created;
  });

  fixtureEventIds.push(...records.map((event) => event.id));

  return records;
}