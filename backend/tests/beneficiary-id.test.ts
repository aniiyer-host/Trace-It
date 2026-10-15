import request from "supertest";
import app from "../src/index.js";
import { prisma } from "../src/db/prisma.js";
import { HashService } from "../src/services/hashService.js";
import { UserRole } from "../generated/prisma/enums.js";
import jwt from "jsonwebtoken";
import crypto from "crypto";

// Setup env
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || "test_secret";
process.env.AES_BENEFICIARY_KEY =
  process.env.AES_BENEFICIARY_KEY || crypto.randomBytes(32).toString("hex");
process.env.BENEFICIARY_HMAC_SECRET =
  process.env.BENEFICIARY_HMAC_SECRET || "beneficiary-test-hmac-secret";

const generateToken = (userId: string) => {
  return jwt.sign({ userId }, process.env.JWT_ACCESS_SECRET!, {
    expiresIn: "1h",
  });
};

describe("Beneficiary ID Feature", () => {
  let ngoId: string;
  let otherNgoId: string;
  let adminId: string;
  let donorId: string;
  let campaignId: string;
  let rawBeneficiaryId: string;
  let ngoToken: string;
  let otherNgoToken: string;
  let adminToken: string;
  let donorToken: string;

  beforeAll(async () => {
    // Create users
    const ngo = await prisma.profile.create({
      // data: { email: 'ngo_bene@test.com', role: UserRole.CHARITY, passwordHash: 'hash', ngoStatus: 'ACTIVE' }
      data: {
        email: `ngo-bene-${crypto.randomUUID()}@test.com`,
        role: UserRole.CHARITY,
        passwordHash: "hash",
        ngoStatus: "ACTIVE",
      },
    });
    ngoId = ngo.id;
    ngoToken = generateToken(ngoId);

    const otherNgo = await prisma.profile.create({
      data: {
        // email: "other_ngo@test.com",
        email: `other-ngo-${crypto.randomUUID()}@test.com`,
        role: UserRole.CHARITY,
        passwordHash: "hash",
        ngoStatus: "ACTIVE",
      },
    });
    otherNgoId = otherNgo.id;
    otherNgoToken = generateToken(otherNgoId);

    const admin = await prisma.profile.create({
      data: {
        // email: "admin_bene@test.com",
        email: `admin-bene-${crypto.randomUUID()}@test.com`,
        role: UserRole.ADMIN,
        passwordHash: "hash",
      },
    });
    adminId = admin.id;
    adminToken = generateToken(adminId);

    const donor = await prisma.profile.create({
      data: {
        // email: "donor_bene@test.com",
        email: `donor-bene-${crypto.randomUUID()}@test.com`,
        role: UserRole.DONOR,
        passwordHash: "hash",
      },
    });
    donorId = donor.id;
    donorToken = generateToken(donorId);

    // Create a campaign via API to ensure the encryption kicks in correctly
    const res = await request(app)
      .post("/api/charity/campaigns")
      .set("Authorization", `Bearer ${ngoToken}`)
      .send({
        title: "Identity fixture campaign",
        description: "Testing",
        targetAmount: 1000,
        category: "Test",
        currencyCode: "INR",
        beneficiaryName: "Test Beneficiary",
        beneficiaryDescription: "Private assistance test description",
        beneficiaryPan: " ABCDE1234F ",
      });

    // campaignId = res.body.id;
    // expect(res.status).toBe(201);
    // expect(res.body.id).toBeDefined();
    // campaignId = res.body.id;
    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();

    campaignId = res.body.id;
    rawBeneficiaryId = HashService.beneficiaryIdFromPan(
      "ABCDE1234F",
      process.env.BENEFICIARY_HMAC_SECRET!,
      campaignId,
    );
  });

  // afterAll(async () => {
  //   await prisma.campaign.deleteMany({ where: { id: campaignId } });
  //   await prisma.profile.deleteMany({
  //     where: { id: { in: [ngoId, otherNgoId, adminId, donorId] } },
  //   });
  //   await prisma.$disconnect();
  // });

  afterAll(async () => {
    await prisma.campaign.deleteMany({
      where: {
        ngoId: {
          in: [ngoId, otherNgoId],
        },
      },
    });

    await prisma.profile.deleteMany({
      where: {
        id: {
          in: [ngoId, otherNgoId, adminId, donorId],
        },
      },
    });

    await prisma.$disconnect();
  });

  describe("HashService Encryption/Decryption Round-trip", () => {
    it("encrypting and decrypting a beneficiary ID returns the original string", () => {
      const original = "SOL1234567890ABCDEF";
      const encrypted = HashService.encryptBeneficiaryId(original);
      const decrypted = HashService.decryptBeneficiaryId(encrypted);
      expect(decrypted).toBe(original);
    });
  });

  describe("Campaign Response Stripping", () => {
    it("beneficiaryIdEncrypted is never present in the response body of POST /api/charity/campaigns", async () => {
      const res = await request(app)
        .post("/api/charity/campaigns")
        .set("Authorization", `Bearer ${ngoToken}`)
        .send({
          title: "Test Leaks 1",
          description: "Testing",
          targetAmount: 1000,
          category: "Test",
          currencyCode: "INR",
          beneficiaryName: "Test Beneficiary",
          beneficiaryDescription: "Private assistance test description",
          beneficiaryPan: "BCDEF1234G",
        });

      expect(res.body.beneficiaryIdEncrypted).toBeUndefined();
      expect(res.body.beneficiaryIdHash).toBeUndefined();
      expect(res.body.beneficiaryPan).toBeUndefined();
    });

    it("persists encrypted private details and a campaign-bound verifier without storing PAN", async () => {
      const campaign = await prisma.campaign.findUniqueOrThrow({ where: { id: campaignId } });
      expect(campaign.beneficiaryName).toBeNull();
      expect(campaign.beneficiaryDescription).toBeNull();
      expect(HashService.decryptSensitiveValue(campaign.beneficiaryNameEncrypted!)).toBe("Test Beneficiary");
      expect(HashService.decryptSensitiveValue(campaign.beneficiaryDescriptionEncrypted!)).toBe("Private assistance test description");
      expect(campaign.beneficiaryIdHash).toBe(
        HashService.beneficiaryIdVerifier(rawBeneficiaryId, campaignId, process.env.BENEFICIARY_HMAC_SECRET!),
      );
      expect(JSON.stringify(campaign)).not.toContain("ABCDE1234F");
    });

    it("beneficiaryIdEncrypted is never present in GET /api/charity/campaigns", async () => {
      const res = await request(app)
        .get("/api/charity/campaigns")
        .set("Authorization", `Bearer ${ngoToken}`);

      expect(res.body.length).toBeGreaterThan(0);

      res.body.forEach((c: any) => {
        expect(c.beneficiaryIdEncrypted).toBeUndefined();
        expect(c.beneficiaryIdHash).toBeUndefined();
        expect(c.beneficiaryNameEncrypted).toBeUndefined();
        expect(c.beneficiaryDescriptionEncrypted).toBeUndefined();
      });
      expect(res.body.find((c: any) => c.id === campaignId)).toMatchObject({
        beneficiaryName: "Test Beneficiary",
        beneficiaryDescription: "Private assistance test description",
      });

      const donorCampaigns = await request(app)
        .get("/api/charity/campaigns")
        .set("Authorization", `Bearer ${donorToken}`);
      expect(donorCampaigns.status).toBe(403);

      await prisma.campaign.update({
        where: { id: campaignId },
        data: { status: "PENDING_APPROVAL" },
      });
      const adminCampaigns = await request(app)
        .get("/api/admin/campaigns/pending")
        .set("Authorization", `Bearer ${adminToken}`);
      expect(adminCampaigns.status).toBe(200);
      expect(adminCampaigns.body.find((c: any) => c.id === campaignId)).toMatchObject({
        beneficiaryName: "Test Beneficiary",
        beneficiaryDescription: "Private assistance test description",
      });
      const adminCampaign = adminCampaigns.body.find((c: any) => c.id === campaignId);
      expect(adminCampaign.beneficiaryNameEncrypted).toBeUndefined();
      expect(adminCampaign.beneficiaryDescriptionEncrypted).toBeUndefined();
      await prisma.campaign.update({ where: { id: campaignId }, data: { status: "DRAFT" } });
    });

    it("rejects invalid PAN input without returning the submitted PAN", async () => {
      const pan = "NOTAPAN123";
      const res = await request(app)
        .post("/api/charity/campaigns")
        .set("Authorization", `Bearer ${ngoToken}`)
        .send({
          title: "Invalid PAN",
          description: "Testing",
          targetAmount: 1000,
          beneficiaryName: "Test Beneficiary",
          beneficiaryDescription: "Private assistance test description",
          beneficiaryPan: pan,
        });
      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body)).not.toContain(pan);
    });
  });

  describe("GET /api/charity/campaigns/:id/beneficiary-id", () => {
    it("returns the decrypted ID for the owning NGO", async () => {
      const res = await request(app)
        .get(`/api/charity/campaigns/${campaignId}/beneficiary-id`)
        .set("Authorization", `Bearer ${ngoToken}`);

      expect(res.status).toBe(200);
      expect(res.body.beneficiaryId).toBe(rawBeneficiaryId);
    });

    it("returns 404/access denied for a different NGO", async () => {
      const res = await request(app)
        .get(`/api/charity/campaigns/${campaignId}/beneficiary-id`)
        .set("Authorization", `Bearer ${otherNgoToken}`);

      expect(res.status).toBe(404);
      expect(res.body.error).toContain("access denied");
      const privateCampaigns = await request(app)
        .get("/api/charity/campaigns")
        .set("Authorization", `Bearer ${otherNgoToken}`);
      expect(privateCampaigns.body).toEqual([]);
    });

    it("returns 403 for ADMIN role", async () => {
      const res = await request(app)
        .get(`/api/charity/campaigns/${campaignId}/beneficiary-id`)
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(403);
    });

    it("returns 403 for DONOR role", async () => {
      const res = await request(app)
        .get(`/api/charity/campaigns/${campaignId}/beneficiary-id`)
        .set("Authorization", `Bearer ${donorToken}`);

      expect(res.status).toBe(403);
    });
  });

  it("requires the campaign-bound Beneficiary ID during the delivery attestation", async () => {
    const donation = await prisma.donation.create({
      data: {
        donorId,
        ngoId,
        campaignId,
        amount: 100,
        paymentMethod: "UPI",
        status: "SUCCESS",
      },
    });
    const attestation = await prisma.attestation.create({
      data: {
        donationId: donation.id,
        type: "DELIVERY",
        requestedBy: donorId,
      },
    });

    try {
      const mismatch = await request(app)
        .post("/api/charity/attestations")
        .set("Authorization", `Bearer ${ngoToken}`)
        .send({ donationId: donation.id, attestationId: attestation.id, type: "DELIVERY", beneficiaryId: "BEN-invalid" });
      expect(mismatch.status).toBe(422);
      expect(mismatch.body.error).toBe("BENEFICIARY_MISMATCH");

      const accepted = await request(app)
        .post("/api/charity/attestations")
        .set("Authorization", `Bearer ${ngoToken}`)
        .send({ donationId: donation.id, attestationId: attestation.id, type: "DELIVERY", beneficiaryId: rawBeneficiaryId });
      expect(accepted.status).toBe(200);
      expect(accepted.body.status).toBe("NGO_SIGNED");
    } finally {
      await prisma.attestation.deleteMany({ where: { donationId: donation.id } });
      await prisma.donation.delete({ where: { id: donation.id } });
    }
  });

  it("rejects an otherwise valid ID copied from a different campaign", async () => {
    const secondCampaign = await request(app)
      .post("/api/charity/campaigns")
      .set("Authorization", `Bearer ${ngoToken}`)
      .send({
        title: "Second test campaign",
        description: "Testing cross-campaign binding",
        targetAmount: 1000,
        beneficiaryName: "Test Beneficiary",
        beneficiaryDescription: "Private assistance test description",
        beneficiaryPan: "ABCDE1234F",
      });
    expect(secondCampaign.status).toBe(201);
    const secondBeneficiaryId = HashService.beneficiaryIdFromPan(
      "ABCDE1234F",
      process.env.BENEFICIARY_HMAC_SECRET!,
      secondCampaign.body.id,
    );
    expect(secondBeneficiaryId).not.toBe(rawBeneficiaryId);

    const donation = await prisma.donation.create({
      data: {
        donorId,
        ngoId,
        campaignId: secondCampaign.body.id,
        amount: 100,
        paymentMethod: "UPI",
        status: "SUCCESS",
      },
    });
    const attestation = await prisma.attestation.create({
      data: { donationId: donation.id, type: "DELIVERY", requestedBy: donorId },
    });
    try {
      const response = await request(app)
        .post("/api/charity/attestations")
        .set("Authorization", `Bearer ${ngoToken}`)
        .send({
          donationId: donation.id,
          attestationId: attestation.id,
          type: "DELIVERY",
          beneficiaryId: rawBeneficiaryId,
        });
      expect(response.status).toBe(422);
      expect(response.body.error).toBe("BENEFICIARY_MISMATCH");
    } finally {
      await prisma.attestation.deleteMany({ where: { donationId: donation.id } });
      await prisma.donation.delete({ where: { id: donation.id } });
      await prisma.campaign.delete({ where: { id: secondCampaign.body.id } });
    }
  });

  it("keeps beneficiary information out of public campaign responses", async () => {
    await prisma.campaign.update({ where: { id: campaignId }, data: { status: "ACTIVE" } });
    const res = await request(app).get(`/api/public/campaigns/${campaignId}`);
    expect(res.status).toBe(200);
    const campaign = res.body.campaign ?? res.body;
    expect(campaign.beneficiaryName).toBeUndefined();
    expect(campaign.beneficiaryDescription).toBeUndefined();
    expect(campaign.beneficiaryNameEncrypted).toBeUndefined();
    expect(campaign.beneficiaryDescriptionEncrypted).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toContain("ABCDE1234F");
    expect(JSON.stringify(res.body)).not.toContain("beneficiaryId");
    const listResponse = await request(app).get("/api/public/campaigns");
    expect(JSON.stringify(listResponse.body)).not.toContain("Private assistance test description");
    expect(JSON.stringify(listResponse.body)).not.toContain("beneficiaryName");
  });
});
