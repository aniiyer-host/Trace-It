import request from "supertest";
import app from "../src/index.js";
import { prisma } from "../src/db/prisma.js";
import jwt from "jsonwebtoken";
import {
  UserRole,
  NgoStatus,
  CampaignStatus,
  DisbursementStatus,
  ProvenanceEventType,
} from "../generated/prisma/enums";
import {
  computeChainHash,
  hashProvenanceEvent,
} from "../src/utils/provenance.js";
import { completeDonationSuccess } from "../src/services/donationService.js";
import { settleDueDisbursements } from "../src/services/disbursementSettlementWorker.js";

const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || "access_secret";

import crypto from "crypto";

describe("Disbursement API Integration Tests", () => {
  let adminToken: string;
  let adminUserId: string;

  let ngoToken: string;
  let ngoUserId: string;

  let donorToken: string;
  let donorUserId: string;

  let campaignId: string;
  let cohortId: string;
  let disbursementId: string;
  let lifecycleCampaignId: string;
  let lifecycleDonationId: string;

  beforeAll(async () => {
    // 1. Create a mock admin
    const adminUser = await prisma.profile.create({
      data: {
        email: `admin-${crypto.randomUUID()}@example.com`,
        role: UserRole.ADMIN,
      },
    });
    adminUserId = adminUser.id;
    adminToken = jwt.sign({ userId: adminUserId }, JWT_ACCESS_SECRET, {
      expiresIn: "1h",
    });

    // 1b. Create a mock donor
    const donorUser = await prisma.profile.create({
      data: {
        email: `donor-${crypto.randomUUID()}@example.com`,
        role: UserRole.DONOR,
      },
    });
    donorUserId = donorUser.id;
    donorToken = jwt.sign({ userId: donorUserId }, JWT_ACCESS_SECRET, {
      expiresIn: "1h",
    });

    // 2. Create a mock NGO
    const ngoUser = await prisma.profile.create({
      data: {
        email: `charity-${crypto.randomUUID()}@example.com`,
        role: UserRole.CHARITY,
        ngoStatus: NgoStatus.ACTIVE,
      },
    });
    ngoUserId = ngoUser.id;
    ngoToken = jwt.sign({ userId: ngoUserId }, JWT_ACCESS_SECRET, {
      expiresIn: "1h",
    });

    // 3. Create a campaign
    const campaign = await prisma.campaign.create({
      data: {
        ngoId: ngoUserId,
        title: "Test Campaign for Disbursement",
        description: "Test Campaign",
        targetAmount: 10000,
        raisedAmount: 10000,
        status: CampaignStatus.ACTIVE,
      },
    });
    campaignId = campaign.id;

    // 4. Create a cohort with proof
    const cohort = await prisma.beneficiaryCohort.create({
      data: {
        campaignId,
        ngoId: ngoUserId,
        name: "Test Cohort",
        beneficiaryCount: 10,
        sha512DocHash: "dummyhash",
      },
    });
    cohortId = cohort.id;

    // 5. Create some SUCCESS donations
    await prisma.donation.create({
      data: {
        donorId: donorUserId,
        ngoId: ngoUserId,
        campaignId,
        amount: 5000,
        paymentMethod: "CARD",
        status: "SUCCESS",
      },
    });

    await prisma.donation.create({
      data: {
        donorId: donorUserId,
        ngoId: ngoUserId,
        campaignId,
        amount: 5000,
        paymentMethod: "UPI",
        status: "SUCCESS",
      },
    });
  });

  afterAll(async () => {
    // Clean up
    if (lifecycleCampaignId) {
      await prisma.donationAllocation.deleteMany({ where: { disbursement: { campaignId: lifecycleCampaignId } } });
      await prisma.attestation.deleteMany({ where: { donation: { campaignId: lifecycleCampaignId } } });
      await prisma.disbursement.deleteMany({ where: { campaignId: lifecycleCampaignId } });
      await prisma.attestation.deleteMany({ where: { donationId: lifecycleDonationId } });
    }
    await prisma.donationAllocation.deleteMany({ where: { disbursement: { campaignId } } });
    await prisma.attestation.deleteMany({ where: { donation: { campaignId } } });
    await prisma.disbursement.deleteMany({ where: { campaignId } });
    await prisma.donation.deleteMany({ where: { campaignId } });
    await prisma.donation.deleteMany({ where: { id: lifecycleDonationId } });
    await prisma.beneficiaryCohort.deleteMany({ where: { campaignId } });
    await prisma.campaign.deleteMany({ where: { id: campaignId } });
    if (lifecycleCampaignId) await prisma.campaign.deleteMany({ where: { id: lifecycleCampaignId } });

    await prisma.profile.delete({ where: { id: adminUserId } });
    await prisma.profile.delete({ where: { id: donorUserId } });
    await prisma.profile.delete({ where: { id: ngoUserId } });
  });

  test("funding target closes intake while keeping public visibility and disbursement eligibility", async () => {
    const campaign = await prisma.campaign.create({ data: {
      ngoId: ngoUserId, title: "Lifecycle regression", description: "Strict funding lifecycle",
      targetAmount: 100, raisedAmount: 0, status: CampaignStatus.ACTIVE, sdgTags: [],
    } });
    lifecycleCampaignId = campaign.id;
    const donation = await prisma.donation.create({ data: {
      donorId: donorUserId, ngoId: ngoUserId, campaignId: campaign.id, amount: 100,
      paymentMethod: "UPI", status: "INITIATED", razorpayOrderId: `lifecycle-${crypto.randomUUID()}`,
    } });
    lifecycleDonationId = donation.id;
    await completeDonationSuccess(donation.id, { source: "simulation" });
    expect((await prisma.campaign.findUniqueOrThrow({ where: { id: campaign.id } })).status).toBe(CampaignStatus.FUNDING_COMPLETE);
    const publicList = await request(app).get("/api/public/campaigns");
    expect(publicList.body.data.some((row: { id: string }) => row.id === campaign.id)).toBe(true);
    await prisma.profile.update({ where: { id: donorUserId }, data: { kycStatus: "APPROVED" } });
    const donationAttempt = await request(app).post("/api/donor/donate").set("Authorization", `Bearer ${donorToken}`).send({ ngoId: ngoUserId, campaignId: campaign.id, amount: 10, paymentMethod: "UPI" });
    expect(donationAttempt.status).toBe(400);
    expect(donationAttempt.body.code).toBe("CAMPAIGN_CLOSED");
    const disbursement = await request(app).post("/api/charity/disburse").set("Authorization", `Bearer ${ngoToken}`).send({ campaignId: campaign.id, amountInr: 100 });
    expect(disbursement.status).toBe(201);
  });

  test("POST /api/charity/disburse - create a disbursement", async () => {
    const res = await request(app)
      .post("/api/charity/disburse")
      .set("Authorization", `Bearer ${ngoToken}`)
      .send({
        campaignId,
        cohortId,
        amountInr: 6000,
      });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty("id");
    expect(res.body.status).toBe(DisbursementStatus.PENDING);
    expect(Number(res.body.amountInr)).toBe(6000);
    disbursementId = res.body.id;
  });

  test("GET /api/charity/disbursements - list disbursements for NGO", async () => {
    const res = await request(app)
      .get("/api/charity/disbursements")
      .set("Authorization", `Bearer ${ngoToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
    expect(res.body[0].id).toBe(disbursementId);
  });

  test("GET /api/admin/disbursements - list all disbursements (Admin)", async () => {
    const res = await request(app)
      .get("/api/admin/disbursements")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    // Find ours
    const found = res.body.find((d: any) => d.id === disbursementId);
    expect(found).toBeDefined();
  });

  test("POST /api/admin/disburse/:id/approve - approve disbursement", async () => {
    const res = await request(app)
      .post(`/api/admin/disburse/${disbursementId}/approve`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe(DisbursementStatus.APPROVED);
    expect(res.body.approvedBy).toBe(adminUserId);

    // Verify that donations were allocated via partial tracking
    const donations = await prisma.donation.findMany({
      where: { campaignId },
      orderBy: { createdAt: "asc" }
    });

    // 6000 was disbursed.
    // First donation (5000) should be ALLOCATED with 5000 allocatedAmount
    // Second donation (5000) should be ALLOCATED with 1000 allocatedAmount
    const firstDonation = donations[0];
    const secondDonation = donations[1];
    
    expect(firstDonation.status).toBe("ALLOCATED");
    expect(Number(firstDonation.allocatedAmount)).toBe(5000);
    
    expect(secondDonation.status).toBe("ALLOCATED");
    expect(Number(secondDonation.allocatedAmount)).toBe(1000);

    // Verify DonationAllocation records
    const allocations = await prisma.donationAllocation.findMany({
      where: { disbursementId },
      include: { donation: true },
    });
    expect(allocations.length).toBe(2);

    const provenanceEvents = await prisma.provenanceEvent.findMany({
      where: {
        entityType: "Donation",
        eventType: ProvenanceEventType.DONATION_ALLOCATED,
        transitionKey: disbursementId,
      },
      orderBy: { id: "asc" },
    });
    expect(provenanceEvents).toHaveLength(2);
    const precedingChainEvent = await prisma.provenanceEvent.findFirst({
      where: {
        chainHash: { not: null },
        id: { lt: provenanceEvents[0].id },
      },
      orderBy: { id: "desc" },
      select: { chainHash: true },
    });
    expect(provenanceEvents[0].previous_hash).toBe(
      precedingChainEvent?.chainHash ?? null,
    );
    expect(provenanceEvents[1].previous_hash).toBe(
      provenanceEvents[0].chainHash,
    );

    for (const allocation of allocations) {
      const event = provenanceEvents.find(
        (candidate) => candidate.entityId === allocation.donationId,
      );
      expect(event).toBeDefined();
      expect(event).toMatchObject({
        eventType: ProvenanceEventType.DONATION_ALLOCATED,
        entityType: "Donation",
        entityId: allocation.donationId,
        amountInr: allocation.amount.toFixed(2),
        ngoId: allocation.donation.ngoId,
        campaignId: allocation.donation.campaignId,
        transitionKey: disbursementId,
      });

      const canonicalPayload = JSON.parse(event!.canonicalPayload) as Record<
        string,
        unknown
      >;
      expect(Object.keys(canonicalPayload)).toEqual([
        "schemaVersion",
        "eventType",
        "entityType",
        "entityId",
        "amountInr",
        "ngoId",
        "campaignId",
        "occurredAt",
      ]);
      expect(canonicalPayload).toEqual({
        schemaVersion: 1,
        eventType: "DONATION_ALLOCATED",
        entityType: "Donation",
        entityId: allocation.donationId,
        amountInr: allocation.amount.toFixed(2),
        ngoId: allocation.donation.ngoId,
        campaignId: allocation.donation.campaignId,
        occurredAt: event!.occurredAt.toISOString(),
      });
      expect(event!.payloadHash).toBe(
        hashProvenanceEvent({
          eventType: "DONATION_ALLOCATED",
          entityType: "Donation",
          entityId: allocation.donationId,
          amountInr: allocation.amount.toFixed(2),
          ngoId: allocation.donation.ngoId,
          campaignId: allocation.donation.campaignId,
          occurredAt: event!.occurredAt,
        }),
      );
      expect(event!.chainHash).toBe(
        computeChainHash(
          {
            eventType: event!.eventType,
            entityType: event!.entityType,
            entityId: event!.entityId,
            amountInr: event!.amountInr,
            ngoId: event!.ngoId,
            campaignId: event!.campaignId,
            occurredAt: event!.occurredAt,
          },
          event!.previous_hash,
        ),
      );
    }

    // Verify RECEIPT Attestations were created
    const attestations = await prisma.attestation.findMany({
      where: { disbursementId, type: "RECEIPT" }
    });
    expect(attestations.length).toBe(2);

    // Verify Campaign is NOT closed (6000 < 10000)
    const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
    expect(campaign?.status).not.toBe(CampaignStatus.COMPLETED);
  });

  test("rejects repeated approval without duplicating allocation side effects", async () => {
    const res = await request(app)
      .post(`/api/admin/disburse/${disbursementId}/approve`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "Disbursement is not PENDING" });
    expect(
      await prisma.donationAllocation.count({ where: { disbursementId } }),
    ).toBe(2);
    expect(
      await prisma.attestation.count({
        where: { disbursementId, type: "RECEIPT" },
      }),
    ).toBe(2);
    expect(
      await prisma.provenanceEvent.count({
        where: {
          eventType: ProvenanceEventType.DONATION_ALLOCATED,
          transitionKey: disbursementId,
        },
      }),
    ).toBe(2);
  });

  test("rolls back approval and allocation writes when a later write fails", async () => {
    const originalChainHead = await prisma.provenanceEvent.findFirst({
      where: { chainHash: { not: null } },
      orderBy: { id: "desc" },
      select: { id: true, chainHash: true },
    });
    const donations = await prisma.donation.findMany({
      where: { campaignId },
      orderBy: { createdAt: "asc" },
    });
    const donation = donations[1];
    expect(
      donation.amount.minus(donation.allocatedAmount).greaterThanOrEqualTo(500),
    ).toBe(true);
    const rollbackDisbursement = await prisma.disbursement.create({
      data: {
        campaignId,
        ngoId: ngoUserId,
        amountInr: 500,
        status: DisbursementStatus.PENDING,
      },
    });

    await prisma.attestation.create({
      data: {
        donationId: donation.id,
        disbursementId: rollbackDisbursement.id,
        type: "RECEIPT",
        requestedBy: donation.donorId,
        status: "PENDING",
      },
    });

    const res = await request(app)
      .post(`/api/admin/disburse/${rollbackDisbursement.id}/approve`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(500);
    expect(
      (await prisma.disbursement.findUnique({
        where: { id: rollbackDisbursement.id },
      }))?.status,
    ).toBe(DisbursementStatus.PENDING);
    expect(
      (
        await prisma.donation.findUnique({ where: { id: donation.id } })
      )?.allocatedAmount.toFixed(2),
    ).toBe(donation.allocatedAmount.toFixed(2));
    expect(
      await prisma.donationAllocation.count({
        where: { disbursementId: rollbackDisbursement.id },
      }),
    ).toBe(0);
    expect(
      await prisma.provenanceEvent.count({
        where: { transitionKey: rollbackDisbursement.id },
      }),
    ).toBe(0);
    expect(
      await prisma.provenanceEvent.findFirst({
        where: { chainHash: { not: null } },
        orderBy: { id: "desc" },
        select: { id: true, chainHash: true },
      }),
    ).toEqual(originalChainHead);
    expect(
      await prisma.attestation.count({
        where: {
          donationId: donation.id,
          disbursementId: rollbackDisbursement.id,
          type: "RECEIPT",
        },
      }),
    ).toBe(1);
  });

  test("allows only one concurrent approval to claim a disbursement", async () => {
    const concurrentDisbursement = await prisma.disbursement.create({
      data: {
        campaignId,
        ngoId: ngoUserId,
        amountInr: 100,
        status: DisbursementStatus.PENDING,
      },
    });

    const responses = await Promise.all(
      [1, 2].map(() =>
        request(app)
          .post(`/api/admin/disburse/${concurrentDisbursement.id}/approve`)
          .set("Authorization", `Bearer ${adminToken}`),
      ),
    );

    expect(responses.map((response) => response.status).sort()).toEqual([
      200,
      400,
    ]);
    expect(
      await prisma.donationAllocation.count({
        where: { disbursementId: concurrentDisbursement.id },
      }),
    ).toBe(1);
    expect(
      await prisma.provenanceEvent.count({
        where: { transitionKey: concurrentDisbursement.id },
      }),
    ).toBe(1);
  });

  test("POST /api/admin/disburse/:id/approve - approve final disbursement auto-closes campaign", async () => {
    // Earlier tests left one completed request and one unrelated approval.
    // Model their terminal outcomes so exactly ₹6,000 remains committed and
    // this final ₹4,000 request is eligible under the one-outstanding rule.
    await prisma.disbursement.update({
      where: { id: disbursementId },
      data: { status: DisbursementStatus.SETTLED },
    });
    await prisma.disbursement.updateMany({
      where: {
        campaignId,
        id: { not: disbursementId },
        status: { in: [DisbursementStatus.PENDING, DisbursementStatus.APPROVED, DisbursementStatus.SENT] },
      },
      data: { status: DisbursementStatus.REJECTED },
    });

    // Create another disbursement for the remaining 4000
    const disRes = await request(app)
      .post("/api/charity/disburse")
      .set("Authorization", `Bearer ${ngoToken}`)
      .send({
        campaignId,
        amountInr: 4000,
      });
    expect(disRes.status).toBe(201);
    const finalDisbursementId = disRes.body.id;

    // Approve it
    const res = await request(app)
      .post(`/api/admin/disburse/${finalDisbursementId}/approve`)
      .set("Authorization", `Bearer ${adminToken}`);
    
    expect(res.status).toBe(200);
    expect(res.body.isFinalDisbursement).toBe(true);

    // Completion follows final disbursement settlement, not approval alone.
    let campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
    expect(campaign?.status).toBe(CampaignStatus.ACTIVE);
    await prisma.disbursement.update({ where: { id: finalDisbursementId }, data: { status: DisbursementStatus.SENT, settlementDueAt: new Date(Date.now() - 1_000) } });
    expect(await settleDueDisbursements(prisma, new Date())).toBe(1);
    campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
    expect(campaign?.status).toBe(CampaignStatus.COMPLETED);
  });

  test("POST /api/admin/campaigns/:id/close - force close endpoint", async () => {
    // Re-open campaign for testing
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: CampaignStatus.ACTIVE }
    });

    const res = await request(app)
      .post(`/api/admin/campaigns/${campaignId}/close`)
      .set("Authorization", `Bearer ${adminToken}`);
    
    expect(res.status).toBe(200);
    expect(res.body.status).toBe(CampaignStatus.COMPLETED);
  });

  test("GET /api/donor/dashboard - donor sees attestations with disbursementId and allocatedAmount", async () => {
    const res = await request(app)
      .get("/api/donor/dashboard")
      .set("Authorization", `Bearer ${donorToken}`);
      
    expect(res.status).toBe(200);
    expect(res.body.donations).toBeDefined();
    
    // Select the allocation created by this suite's first approval. Other
    // later attestations are unordered in the dashboard response.
    const donation = res.body.donations.find((d: any) =>
      d.attestations?.some((a: any) => a.disbursementId === disbursementId),
    );
    expect(donation).toBeDefined();
    
    const attestation = donation.attestations.find((a: any) =>
      a.disbursementId === disbursementId && a.type === "RECEIPT",
    );
    expect(attestation).toBeDefined();
    expect(attestation.type).toBe("RECEIPT");
    expect(attestation).toHaveProperty("disbursementId");
    expect(attestation.disbursementId).toBeTruthy(); // Should not be null
    expect(attestation).toHaveProperty("allocatedAmount");
    expect(Number(attestation.allocatedAmount)).toBeGreaterThan(0);
  });
});
