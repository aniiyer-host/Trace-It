import request from "supertest";
import app from "../src/index";
import { prisma } from "../src/db/prisma";
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
        donorId: adminUserId, // doesn't matter who the donor is
        ngoId: ngoUserId,
        campaignId,
        amount: 5000,
        paymentMethod: "CARD",
        status: "SUCCESS",
      },
    });

    await prisma.donation.create({
      data: {
        donorId: adminUserId,
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
    await prisma.disbursement.deleteMany({ where: { campaignId } });
    await prisma.donation.deleteMany({ where: { campaignId } });
    await prisma.beneficiaryCohort.deleteMany({ where: { campaignId } });
    await prisma.campaign.deleteMany({ where: { id: campaignId } });

    await prisma.profile.delete({ where: { id: adminUserId } });
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

    // Verify that donations were allocated
    const donations = await prisma.donation.findMany({
      where: { campaignId },
    });

    // 6000 was disbursed.
    // First donation (5000) should be ALLOCATED
    // Second donation (5000) should be ALLOCATED (since 1000 spilled over)
    const allocated = donations.filter((d) => d.status === "ALLOCATED");
    expect(allocated.length).toBe(2);
  });
});
