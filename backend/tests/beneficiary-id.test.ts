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
  let rawBeneficiaryId = "SOL" + crypto.randomBytes(16).toString("hex");
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
        title: "Test Beneficiary",
        description: "Testing",
        targetAmount: 1000,
        category: "Test",
        currencyCode: "INR",
        beneficiaryId: rawBeneficiaryId,
      });

    // campaignId = res.body.id;
    // expect(res.status).toBe(201);
    // expect(res.body.id).toBeDefined();
    // campaignId = res.body.id;
    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();

    campaignId = res.body.id;
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
          beneficiaryId: rawBeneficiaryId,
        });

      expect(res.body.beneficiaryIdEncrypted).toBeUndefined();
      expect(res.body.beneficiaryIdHash).toBeUndefined();
    });

    it("beneficiaryIdEncrypted is never present in GET /api/charity/campaigns", async () => {
      const res = await request(app)
        .get("/api/charity/campaigns")
        .set("Authorization", `Bearer ${ngoToken}`);

      expect(res.body.length).toBeGreaterThan(0);

      res.body.forEach((c: any) => {
        expect(c.beneficiaryIdEncrypted).toBeUndefined();
        expect(c.beneficiaryIdHash).toBeUndefined();
      });
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
});
