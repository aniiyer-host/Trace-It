import request from "supertest";
import app from "../src/index.js";
import { prisma } from "../src/db/prisma.js";
import jwt from "jsonwebtoken";
import {
  UserRole,
  NgoStatus,
  CampaignStatus,
  DisbursementStatus,
} from "../generated/prisma/enums";

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
    await prisma.donationAllocation.deleteMany({ where: { disbursement: { campaignId } } });
    await prisma.attestation.deleteMany({ where: { donation: { campaignId } } });
    await prisma.disbursement.deleteMany({ where: { campaignId } });
    await prisma.donation.deleteMany({ where: { campaignId } });
    await prisma.beneficiaryCohort.deleteMany({ where: { campaignId } });
    await prisma.campaign.deleteMany({ where: { id: campaignId } });

    await prisma.profile.delete({ where: { id: adminUserId } });
    await prisma.profile.delete({ where: { id: donorUserId } });
    await prisma.profile.delete({ where: { id: ngoUserId } });
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
      where: { disbursementId }
    });
    expect(allocations.length).toBe(2);

    // Verify RECEIPT Attestations were created
    const attestations = await prisma.attestation.findMany({
      where: { disbursementId, type: "RECEIPT" }
    });
    expect(attestations.length).toBe(2);

    // Verify Campaign is NOT closed (6000 < 10000)
    const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
    expect(campaign?.status).not.toBe(CampaignStatus.COMPLETED);
  });

  test("POST /api/admin/disburse/:id/approve - approve final disbursement auto-closes campaign", async () => {
    // Create another disbursement for the remaining 4000
    const disRes = await request(app)
      .post("/api/charity/disburse")
      .set("Authorization", `Bearer ${ngoToken}`)
      .send({
        campaignId,
        amountInr: 4000,
      });
    const finalDisbursementId = disRes.body.id;

    // Approve it
    const res = await request(app)
      .post(`/api/admin/disburse/${finalDisbursementId}/approve`)
      .set("Authorization", `Bearer ${adminToken}`);
    
    expect(res.status).toBe(200);
    expect(res.body.isFinalDisbursement).toBe(true);

    // Verify Campaign is closed
    const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
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
    
    // Find a donation that has attestations
    const donation = res.body.donations.find((d: any) => d.attestations && d.attestations.length > 0);
    expect(donation).toBeDefined();
    
    // Verify the structure of the attestation
    const attestation = donation.attestations[0];
    expect(attestation.type).toBe("RECEIPT");
    expect(attestation).toHaveProperty("disbursementId");
    expect(attestation.disbursementId).toBeTruthy(); // Should not be null
    expect(attestation).toHaveProperty("allocatedAmount");
    expect(Number(attestation.allocatedAmount)).toBeGreaterThan(0);
  });
});
