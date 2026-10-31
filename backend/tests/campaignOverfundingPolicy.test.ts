import request from "supertest";
import app from "../src/index.js";
import { prisma } from "../src/db/prisma.js";
import jwt from "jsonwebtoken";
import crypto from "node:crypto";
import {
  UserRole,
  NgoStatus,
  CampaignStatus,
  ProvenanceEventType,
  AuditActorType,
} from "../generated/prisma/enums.js";
import * as provenanceChainService from "../src/services/provenanceChainService.js";
import { verifyProvenanceEvents } from "../src/services/provenanceChainService.js";
import logger from "../src/utils/logger.js";
import { StorageService } from "../src/services/storageService.js";

jest.spyOn(StorageService.prototype, "uploadFile").mockResolvedValue(undefined);

const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || "access_secret";

describe("F-06: Campaign Overfunding Policy Administration and Provenance Audit Trail", () => {
  let adminUserId: string;
  let adminToken: string;
  let donorUserId: string;
  let donorToken: string;
  let ngoUserId: string;
  let ngoToken: string;
  let testCampaignId: string;

  beforeAll(async () => {
    // 1. Create mock Admin user
    const admin = await prisma.profile.create({
      data: {
        email: `admin-f06-${crypto.randomUUID()}@example.com`,
        role: UserRole.ADMIN,
      },
    });
    adminUserId = admin.id;
    adminToken = jwt.sign({ userId: admin.id }, JWT_ACCESS_SECRET, { expiresIn: "1h" });

    // 2. Create mock Donor user
    const donor = await prisma.profile.create({
      data: {
        email: `donor-f06-${crypto.randomUUID()}@example.com`,
        role: UserRole.DONOR,
      },
    });
    donorUserId = donor.id;
    donorToken = jwt.sign({ userId: donor.id }, JWT_ACCESS_SECRET, { expiresIn: "1h" });

    // 3. Create mock NGO user
    const ngo = await prisma.profile.create({
      data: {
        email: `ngo-f06-${crypto.randomUUID()}@example.com`,
        role: UserRole.CHARITY,
        ngoStatus: NgoStatus.ACTIVE,
      },
    });
    ngoUserId = ngo.id;
    ngoToken = jwt.sign({ userId: ngo.id }, JWT_ACCESS_SECRET, { expiresIn: "1h" });

    // 4. Create mock Campaign
    const campaign = await prisma.campaign.create({
      data: {
        ngoId: ngoUserId,
        title: "Overfunding Policy Audit Test Campaign",
        description: "Testing transactional policy transitions and provenance integrity",
        targetAmount: 50000,
        raisedAmount: 0,
        allowOverfunding: false,
        status: CampaignStatus.ACTIVE,
      },
    });
    testCampaignId = campaign.id;
  });

  afterAll(async () => {
    // Clean up created records
    await prisma.provenanceEvent.deleteMany({ where: { campaignId: testCampaignId } });
    await prisma.auditLog.deleteMany({
      where: { entityType: "campaign", entityId: testCampaignId },
    });
    await prisma.campaign.deleteMany({ where: { id: testCampaignId } });
    await prisma.profile.deleteMany({
      where: { id: { in: [adminUserId, donorUserId, ngoUserId] } },
    });
  });

  it("1. enables overfunding: false -> true, recording transactional audit and provenance records", async () => {
    // Reset to false first
    await prisma.campaign.update({
      where: { id: testCampaignId },
      data: { allowOverfunding: false },
    });

    const res = await request(app)
      .patch(`/api/admin/campaigns/${testCampaignId}/overfunding`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ allowOverfunding: true });

    expect(res.status).toBe(200);
    expect(res.body.allowOverfunding).toBe(true);

    // Verify Campaign state in DB
    const campaignInDb = await prisma.campaign.findUniqueOrThrow({
      where: { id: testCampaignId },
    });
    expect(campaignInDb.allowOverfunding).toBe(true);

    // Verify Audit Log in DB
    const auditLog = await prisma.auditLog.findFirst({
      where: {
        entityType: "campaign",
        entityId: testCampaignId,
        action: "CAMPAIGN_OVERFUNDING_POLICY_UPDATED",
      },
      orderBy: { id: "desc" },
    });
    expect(auditLog).toBeDefined();
    expect(auditLog?.actorId).toBe(adminUserId);
    expect(auditLog?.actorType).toBe(AuditActorType.USER);
    const meta = auditLog?.metadata as Record<string, unknown>;
    expect(meta.field).toBe("allowOverfunding");
    expect(meta.previousValue).toBe(false);
    expect(meta.newValue).toBe(true);

    // Verify Provenance Event in DB
    const provEvent = await prisma.provenanceEvent.findFirst({
      where: {
        campaignId: testCampaignId,
        eventType: ProvenanceEventType.CAMPAIGN_POLICY_UPDATED,
      },
      orderBy: { id: "desc" },
    });
    expect(provEvent).toBeDefined();
    expect(provEvent?.entityType).toBe("CampaignPolicy:allowOverfunding:false->true");
    expect(provEvent?.entityId).toBe(testCampaignId);
    expect(provEvent?.campaignId).toBe(testCampaignId);
    expect(provEvent?.ngoId).toBe(ngoUserId); // Preserves real NGO ID, not misleading admin mapping
    expect(provEvent?.amountInr).toBe("0.00");
    expect(provEvent?.chainHash).toBeDefined();
    expect(provEvent?.chainHash).not.toBeNull();
  });

  it("2. disables overfunding: true -> false, recording transitional audit and provenance records", async () => {
    // Ensure state is true
    await prisma.campaign.update({
      where: { id: testCampaignId },
      data: { allowOverfunding: true },
    });

    const res = await request(app)
      .patch(`/api/admin/campaigns/${testCampaignId}/overfunding`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ allowOverfunding: false });

    expect(res.status).toBe(200);
    expect(res.body.allowOverfunding).toBe(false);

    const campaignInDb = await prisma.campaign.findUniqueOrThrow({
      where: { id: testCampaignId },
    });
    expect(campaignInDb.allowOverfunding).toBe(false);

    const auditLog = await prisma.auditLog.findFirst({
      where: {
        entityType: "campaign",
        entityId: testCampaignId,
        action: "CAMPAIGN_OVERFUNDING_POLICY_UPDATED",
      },
      orderBy: { id: "desc" },
    });
    const meta = auditLog?.metadata as Record<string, unknown>;
    expect(meta.previousValue).toBe(true);
    expect(meta.newValue).toBe(false);

    const provEvent = await prisma.provenanceEvent.findFirst({
      where: {
        campaignId: testCampaignId,
        eventType: ProvenanceEventType.CAMPAIGN_POLICY_UPDATED,
      },
      orderBy: { id: "desc" },
    });
    expect(provEvent?.entityType).toBe("CampaignPolicy:allowOverfunding:true->false");
  });

  it("3. handles no-op updates without creating audit logs or provenance events", async () => {
    // Campaign is currently false
    await prisma.campaign.update({
      where: { id: testCampaignId },
      data: { allowOverfunding: false },
    });

    const auditCountBefore = await prisma.auditLog.count({
      where: { entityType: "campaign", entityId: testCampaignId },
    });
    const provCountBefore = await prisma.provenanceEvent.count({
      where: { campaignId: testCampaignId },
    });

    // Send identical value (false)
    const res = await request(app)
      .patch(`/api/admin/campaigns/${testCampaignId}/overfunding`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ allowOverfunding: false });

    expect(res.status).toBe(200);
    expect(res.body.allowOverfunding).toBe(false);

    const auditCountAfter = await prisma.auditLog.count({
      where: { entityType: "campaign", entityId: testCampaignId },
    });
    const provCountAfter = await prisma.provenanceEvent.count({
      where: { campaignId: testCampaignId },
    });

    expect(auditCountAfter).toBe(auditCountBefore);
    expect(provCountAfter).toBe(provCountBefore);
  });

  it("4. serializes concurrent administrative updates with order-independent verification", async () => {
    // Set initial state to false
    await prisma.campaign.update({
      where: { id: testCampaignId },
      data: { allowOverfunding: false },
    });

    const auditCountBefore = await prisma.auditLog.count({
      where: { entityType: "campaign", entityId: testCampaignId },
    });
    const provCountBefore = await prisma.provenanceEvent.count({
      where: { campaignId: testCampaignId },
    });

    // Fire two concurrent requests with opposing values
    const [res1, res2] = await Promise.all([
      request(app)
        .patch(`/api/admin/campaigns/${testCampaignId}/overfunding`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ allowOverfunding: true }),
      request(app)
        .patch(`/api/admin/campaigns/${testCampaignId}/overfunding`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ allowOverfunding: false }),
    ]);

    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);

    // Retrieve all audit logs created during this concurrent batch, ordered by ID
    const newAuditLogs = await prisma.auditLog.findMany({
      where: {
        entityType: "campaign",
        entityId: testCampaignId,
        action: "CAMPAIGN_OVERFUNDING_POLICY_UPDATED",
      },
      orderBy: { id: "asc" },
      skip: auditCountBefore,
    });

    const newProvEvents = await prisma.provenanceEvent.findMany({
      where: {
        campaignId: testCampaignId,
        eventType: ProvenanceEventType.CAMPAIGN_POLICY_UPDATED,
      },
      orderBy: { id: "asc" },
      skip: provCountBefore,
    });

    // Order-independent assertion:
    // If request 1 (true) acquired lock first:
    //   Transition 1: false -> true
    //   Transition 2: true -> false
    //   Total transitions: 2
    // If request 2 (false) acquired lock first:
    //   Transition 1: false -> false (no-op, 0 records)
    //   Transition 2: false -> true (1 record)
    //   Total transitions: 1
    expect([1, 2]).toContain(newAuditLogs.length);
    expect(newProvEvents.length).toBe(newAuditLogs.length);

    let currentState = false;
    for (let i = 0; i < newAuditLogs.length; i++) {
      const auditMeta = newAuditLogs[i].metadata as Record<string, unknown>;
      const prov = newProvEvents[i];

      // Each transition must accurately reflect previous and new state
      expect(auditMeta.previousValue).toBe(currentState);
      expect(auditMeta.newValue).toBe(!currentState);

      expect(prov.entityType).toBe(
        `CampaignPolicy:allowOverfunding:${String(currentState)}->${String(!currentState)}`,
      );
      currentState = !currentState;
    }

    // Database state must match the final transition's newValue
    const finalCampaign = await prisma.campaign.findUniqueOrThrow({
      where: { id: testCampaignId },
    });
    expect(finalCampaign.allowOverfunding).toBe(currentState);
  });

  it("5. rolls back campaign update when transactional audit persistence fails", async () => {
    // Set campaign to false
    await prisma.campaign.update({
      where: { id: testCampaignId },
      data: { allowOverfunding: false },
    });

    const provCountBefore = await prisma.provenanceEvent.count({
      where: { campaignId: testCampaignId },
    });

    // Intercept transaction to simulate tx.auditLog.create failure inside the real PG transaction
    const originalTransaction = prisma.$transaction.bind(prisma);
    const txSpy = jest
      .spyOn(prisma, "$transaction")
      .mockImplementationOnce(async (fn: any, ...args: any[]) => {
        return originalTransaction(async (tx: any) => {
          tx.auditLog.create = jest
            .fn()
            .mockRejectedValue(new Error("Simulated database audit write failure"));
          return fn(tx);
        }, ...args);
      });

    const res = await request(app)
      .patch(`/api/admin/campaigns/${testCampaignId}/overfunding`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ allowOverfunding: true });

    // Expect 500 error due to transaction abort
    expect(res.status).toBe(500);

    // Verify campaign was ROLLED BACK and remains false
    const campaignAfter = await prisma.campaign.findUniqueOrThrow({
      where: { id: testCampaignId },
    });
    expect(campaignAfter.allowOverfunding).toBe(false);

    // Verify no provenance event was committed
    const provCountAfter = await prisma.provenanceEvent.count({
      where: { campaignId: testCampaignId },
    });
    expect(provCountAfter).toBe(provCountBefore);

    txSpy.mockRestore();
  });

  it("6. rolls back campaign update and audit record when provenance append fails", async () => {
    await prisma.campaign.update({
      where: { id: testCampaignId },
      data: { allowOverfunding: false },
    });

    const auditCountBefore = await prisma.auditLog.count({
      where: { entityType: "campaign", entityId: testCampaignId },
    });

    // Intercept transaction to simulate tx.provenanceEvent.create failure inside appendProvenanceEvent
    const originalTransaction = prisma.$transaction.bind(prisma);
    const txSpy = jest
      .spyOn(prisma, "$transaction")
      .mockImplementationOnce(async (fn: any, ...args: any[]) => {
        return originalTransaction(async (tx: any) => {
          tx.provenanceEvent.create = jest
            .fn()
            .mockRejectedValue(new Error("Simulated provenance chain write failure"));
          return fn(tx);
        }, ...args);
      });

    const res = await request(app)
      .patch(`/api/admin/campaigns/${testCampaignId}/overfunding`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ allowOverfunding: true });

    expect(res.status).toBe(500);

    // Verify campaign was ROLLED BACK
    const campaignAfter = await prisma.campaign.findUniqueOrThrow({
      where: { id: testCampaignId },
    });
    expect(campaignAfter.allowOverfunding).toBe(false);

    // Verify audit log was ROLLED BACK
    const auditCountAfter = await prisma.auditLog.count({
      where: { entityType: "campaign", entityId: testCampaignId },
    });
    expect(auditCountAfter).toBe(auditCountBefore);

    txSpy.mockRestore();
  });

  it("7. post-commit SIEM delivery failure does not roll back committed policy change", async () => {
    await prisma.campaign.update({
      where: { id: testCampaignId },
      data: { allowOverfunding: false },
    });

    // Spy on logger.info and throw on SIEM forwarding
    const siemSpy = jest
      .spyOn(logger, "info")
      .mockImplementation(((msg: any) => {
        if (msg === "Security Event") {
          throw new Error("SIEM Elasticsearch endpoint unreachable");
        }
        return logger;
      }) as never);

    const warnSpy = jest.spyOn(logger, "warn").mockImplementation(() => logger);

    const res = await request(app)
      .patch(`/api/admin/campaigns/${testCampaignId}/overfunding`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ allowOverfunding: true });

    // Request still succeeds with 200 because DB transaction committed
    expect(res.status).toBe(200);
    expect(res.body.allowOverfunding).toBe(true);

    // Verify DB state is committed
    const campaignInDb = await prisma.campaign.findUniqueOrThrow({
      where: { id: testCampaignId },
    });
    expect(campaignInDb.allowOverfunding).toBe(true);

    // Verify fallback warning was emitted
    expect(warnSpy).toHaveBeenCalledWith(
      "[SIEM] Post-commit SIEM delivery failed",
      expect.objectContaining({ err: expect.any(Error) }),
    );

    siemSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it("8. enforces authorization and input validation", async () => {
    // Unauthenticated request
    const unauthRes = await request(app)
      .patch(`/api/admin/campaigns/${testCampaignId}/overfunding`)
      .send({ allowOverfunding: true });
    expect(unauthRes.status).toBe(401);

    // Authenticated as DONOR -> 403 Forbidden
    const donorRes = await request(app)
      .patch(`/api/admin/campaigns/${testCampaignId}/overfunding`)
      .set("Authorization", `Bearer ${donorToken}`)
      .send({ allowOverfunding: true });
    expect(donorRes.status).toBe(403);

    // Authenticated as CHARITY -> 403 Forbidden
    const ngoRes = await request(app)
      .patch(`/api/admin/campaigns/${testCampaignId}/overfunding`)
      .set("Authorization", `Bearer ${ngoToken}`)
      .send({ allowOverfunding: true });
    expect(ngoRes.status).toBe(403);

    // Invalid input: non-boolean string
    const invalidTypeRes = await request(app)
      .patch(`/api/admin/campaigns/${testCampaignId}/overfunding`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ allowOverfunding: "yes" });
    expect(invalidTypeRes.status).toBe(400);
    expect(invalidTypeRes.body.error).toBe("allowOverfunding must be a boolean");

    // Invalid input: missing field
    const missingFieldRes = await request(app)
      .patch(`/api/admin/campaigns/${testCampaignId}/overfunding`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({});
    expect(missingFieldRes.status).toBe(400);
  });

  it("9. returns 404 for a non-existent campaign", async () => {
    const nonExistentId = crypto.randomUUID();
    const res = await request(app)
      .patch(`/api/admin/campaigns/${nonExistentId}/overfunding`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ allowOverfunding: true });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Campaign not found");
  });

  it("10. validates full provenance chain integrity after policy changes", async () => {
    // Retrieve the full sequence of provenance events from database
    const allEvents = await prisma.provenanceEvent.findMany({
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

    expect(allEvents.length).toBeGreaterThan(0);

    // Run official chain integrity verification
    const verification = verifyProvenanceEvents(allEvents);

    expect(verification.valid).toBe(true);
    expect(verification.errors).toHaveLength(0);
    expect(verification.checkedEvents).toBeGreaterThan(0);
  });
});
