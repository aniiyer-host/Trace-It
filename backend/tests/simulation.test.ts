import request from "supertest";
import app from "../src/index.js";
import { prisma } from "../src/db/prisma.js";
import jwt from "jsonwebtoken";
import {
  UserRole,
  NgoStatus,
  CampaignStatus,
  AttestationType,
  AttestationStatus,
} from "../generated/prisma/enums.js";
import crypto from "crypto";

const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || "access_secret";

describe("Donation Webhook Simulation & Auto-Attestation Tests", () => {
  let donorToken: string;
  let donorUserId: string;
  let ngoToken: string;
  let ngoUserId: string;
  let campaignId: string;

  beforeAll(async () => {
    const donor = await prisma.profile.create({
      data: {
        email: `donor-sim-${crypto.randomUUID()}@example.com`,
        role: UserRole.DONOR,
      },
    });
    donorUserId = donor.id;
    donorToken = jwt.sign({ userId: donorUserId }, JWT_ACCESS_SECRET, {
      expiresIn: "1h",
    });

    const ngo = await prisma.profile.create({
      data: {
        email: `ngo-sim-${crypto.randomUUID()}@example.com`,
        role: UserRole.CHARITY,
        ngoStatus: NgoStatus.ACTIVE,
        organisationName: "Simulation Test NGO",
      },
    });
    ngoUserId = ngo.id;
    ngoToken = jwt.sign({ userId: ngoUserId }, JWT_ACCESS_SECRET, {
      expiresIn: "1h",
    });

    const campaign = await prisma.campaign.create({
      data: {
        ngoId: ngoUserId,
        title: "Simulation Water Campaign",
        description: "Testing simulation webhook",
        targetAmount: 50000,
        status: CampaignStatus.ACTIVE,
      },
    });
    campaignId = campaign.id;
  });

  it("POST /api/donor/donate should return id, orderId, and publicDonationId", async () => {
    const res = await request(app)
      .post("/api/donor/donate")
      .set("Authorization", `Bearer ${donorToken}`)
      .send({
        ngoId: ngoUserId,
        campaignId,
        amount: 250,
        paymentMethod: "UPI",
      });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty("id");
    expect(res.body).toHaveProperty("orderId");
    expect(res.body).toHaveProperty("publicDonationId");

    // Verify donation was created as INITIATED in DB
    const donation = await prisma.donation.findUnique({
      where: { id: res.body.id },
    });
    expect(donation).not.toBeNull();
    expect(donation?.status).toBe("INITIATED");
  });

  it("POST /api/webhooks/simulate-success transitions INITIATED donation to SUCCESS and auto-creates RECEIPT attestation", async () => {
    // 1. Create a donation
    const donateRes = await request(app)
      .post("/api/donor/donate")
      .set("Authorization", `Bearer ${donorToken}`)
      .send({
        ngoId: ngoUserId,
        campaignId,
        amount: 500,
        paymentMethod: "UPI",
      });
    expect(donateRes.status).toBe(201);
    const donationId = donateRes.body.id;

    // 2. Call simulation endpoint
    const simRes = await request(app)
      .post("/api/webhooks/simulate-success")
      .send({ donationId });

    expect(simRes.status).toBe(200);
    expect(simRes.body.success).toBe(true);

    // 3. Verify donation status is SUCCESS
    const updated = await prisma.donation.findUnique({
      where: { id: donationId },
      include: { attestations: true },
    });
    expect(updated?.status).toBe("SUCCESS");
    expect(updated?.attestations.length).toBeGreaterThanOrEqual(1);

    const receiptAtt = updated?.attestations.find(
      (a) => a.type === AttestationType.RECEIPT
    );
    expect(receiptAtt).toBeDefined();
    expect(receiptAtt?.status).toBe(AttestationStatus.PENDING);
    expect(receiptAtt?.requestedBy).toBe(donorUserId);

    // 4. Verify NGO can fetch it from their pending inbox
    const inboxRes = await request(app)
      .get("/api/charity/attestations/pending")
      .set("Authorization", `Bearer ${ngoToken}`);

    expect(inboxRes.status).toBe(200);
    const item = inboxRes.body.find((a: any) => a.id === receiptAtt?.id);
    expect(item).toBeDefined();
    expect(Number(item.donation?.amount)).toBe(500);
  });
});
