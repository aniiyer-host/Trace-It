import request from "supertest";
import app from "../src/index.js";
import { prisma } from "../src/db/prisma.js";
import jwt from "jsonwebtoken";
import {
  UserRole,
  NgoStatus,
  CampaignStatus,
  DisbursementStatus,
  AttestationStatus,
} from "../generated/prisma/enums.js";
import crypto from "crypto";

const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || "access_secret";

describe("Attestation & Milestone API Integration Tests", () => {
  let donorToken: string;
  let donorUserId: string;

  let ngoToken: string;
  let ngoUserId: string;

  let otherNgoToken: string;
  let otherNgoUserId: string;

  let adminToken: string;
  let adminUserId: string;

  let campaignId: string;
  let donationId: string;
  let disbursementId: string;
  let attestationId: string;

  beforeAll(async () => {
    const donor = await prisma.profile.create({
      data: {
        email: `donor-${crypto.randomUUID()}@example.com`,
        role: UserRole.DONOR,
      },
    });
    donorUserId = donor.id;
    donorToken = jwt.sign({ userId: donorUserId }, JWT_ACCESS_SECRET, {
      expiresIn: "1h",
    });

    const ngo = await prisma.profile.create({
      data: {
        email: `charity-${crypto.randomUUID()}@example.com`,
        role: UserRole.CHARITY,
        ngoStatus: NgoStatus.ACTIVE,
      },
    });
    ngoUserId = ngo.id;
    ngoToken = jwt.sign({ userId: ngoUserId }, JWT_ACCESS_SECRET, {
      expiresIn: "1h",
    });

    // A second NGO, used to prove ownership checks actually work (IDOR guard)
    const otherNgo = await prisma.profile.create({
      data: {
        email: `charity-${crypto.randomUUID()}@example.com`,
        role: UserRole.CHARITY,
        ngoStatus: NgoStatus.ACTIVE,
      },
    });
    otherNgoUserId = otherNgo.id;
    otherNgoToken = jwt.sign({ userId: otherNgoUserId }, JWT_ACCESS_SECRET, {
      expiresIn: "1h",
    });

    const admin = await prisma.profile.create({
      data: {
        email: `admin-${crypto.randomUUID()}@example.com`,
        role: UserRole.ADMIN,
      },
    });
    adminUserId = admin.id;
    adminToken = jwt.sign({ userId: adminUserId }, JWT_ACCESS_SECRET, {
      expiresIn: "1h",
    });

    const campaign = await prisma.campaign.create({
      data: {
        ngoId: ngoUserId,
        title: "Test Campaign for Attestation",
        description: "Test Campaign",
        targetAmount: 10000,
        status: CampaignStatus.ACTIVE,
      },
    });
    campaignId = campaign.id;

    const donation = await prisma.donation.create({
      data: {
        donorId: donorUserId,
        ngoId: ngoUserId,
        campaignId,
        amount: 500,
        paymentMethod: "UPI",
        status: "SUCCESS",
      },
    });
    donationId = donation.id;

    const disbursement = await prisma.disbursement.create({
      data: {
        campaignId,
        ngoId: ngoUserId,
        amountInr: 500,
        status: DisbursementStatus.PENDING,
      },
    });
    disbursementId = disbursement.id;
  });

  afterAll(async () => {
    await prisma.document.deleteMany({
      where: { ownerId: { in: [ngoUserId, otherNgoUserId] } },
    });
    await prisma.attestation.deleteMany({ where: { donationId } });
    await prisma.disbursement.deleteMany({ where: { campaignId } });
    await prisma.donation.deleteMany({ where: { id: donationId } });
    await prisma.campaign.deleteMany({ where: { id: campaignId } });
    await prisma.profile.deleteMany({
      where: {
        id: { in: [donorUserId, ngoUserId, otherNgoUserId, adminUserId] },
      },
    });
  });

  // -------------------------------------------------------------------------
  // Attestation flow: donor requests -> NGO signs -> admin approves
  // -------------------------------------------------------------------------

  test("POST /api/donor/donations/:id/attestation - donor requests a RECEIPT attestation", async () => {
    const res = await request(app)
      .post(`/api/donor/donations/${donationId}/attestation`)
      .set("Authorization", `Bearer ${donorToken}`)
      .send({ type: "receipt" });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe(AttestationStatus.PENDING);
    attestationId = res.body.id;
  });

  test("POST /api/donor/donations/:id/attestation - duplicate request for same type is rejected", async () => {
    const res = await request(app)
      .post(`/api/donor/donations/${donationId}/attestation`)
      .set("Authorization", `Bearer ${donorToken}`)
      .send({ type: "receipt" });

    expect(res.status).toBe(409);
  });

  test("GET /api/donor/donations/:id/attestation - donor can view own attestations", async () => {
    const res = await request(app)
      .get(`/api/donor/donations/${donationId}/attestation`)
      .set("Authorization", `Bearer ${donorToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(1);
  });

  test("GET /api/charity/attestations/pending - the OWNING ngo sees it, an unrelated ngo does not", async () => {
    const ownRes = await request(app)
      .get("/api/charity/attestations/pending")
      .set("Authorization", `Bearer ${ngoToken}`);
    expect(ownRes.status).toBe(200);
    expect(ownRes.body.some((a: any) => a.id === attestationId)).toBe(true);

    const otherRes = await request(app)
      .get("/api/charity/attestations/pending")
      .set("Authorization", `Bearer ${otherNgoToken}`);
    expect(otherRes.status).toBe(200);
    expect(otherRes.body.some((a: any) => a.id === attestationId)).toBe(false);
  });

  test("POST /api/charity/attestations - an UNRELATED ngo cannot sign someone else's attestation", async () => {
    const res = await request(app)
      .post("/api/charity/attestations")
      .set("Authorization", `Bearer ${otherNgoToken}`)
      .send({ donationId, type: "receipt" });

    expect(res.status).toBe(404); // donation lookup is scoped to ngoId, so it's a 404 not a 403
  });

  test("POST /api/charity/attestations - the owning NGO signs the attestation", async () => {
    const res = await request(app)
      .post("/api/charity/attestations")
      .set("Authorization", `Bearer ${ngoToken}`)
      .send({ donationId, type: "receipt" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe(AttestationStatus.NGO_SIGNED);
  });

  test("POST /api/charity/attestations - signing again is rejected (already signed)", async () => {
    const res = await request(app)
      .post("/api/charity/attestations")
      .set("Authorization", `Bearer ${ngoToken}`)
      .send({ donationId, type: "receipt" });

    expect(res.status).toBe(409);
  });

  test("GET /api/admin/attestations/pending - admin sees the NGO-signed attestation", async () => {
    const res = await request(app)
      .get("/api/admin/attestations/pending")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.some((a: any) => a.id === attestationId)).toBe(true);
  });

  test("POST /api/admin/attestations/:id/approve - a DONOR cannot approve (RBAC)", async () => {
    const res = await request(app)
      .post(`/api/admin/attestations/${attestationId}/approve`)
      .set("Authorization", `Bearer ${donorToken}`);

    expect(res.status).toBe(403);
  });

  test("POST /api/admin/attestations/:id/approve - admin approves", async () => {
    const res = await request(app)
      .post(`/api/admin/attestations/${attestationId}/approve`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe(AttestationStatus.APPROVED);
  });

  test("POST /api/admin/attestations/:id/reject - cannot reject an already-approved attestation", async () => {
    const res = await request(app)
      .post(`/api/admin/attestations/${attestationId}/reject`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ reason: "too late" });

    expect(res.status).toBe(409);
  });

  // -------------------------------------------------------------------------
  // Milestone flow: NGO uploads proof -> admin approves/rejects
  // -------------------------------------------------------------------------

  test("POST /api/charity/disburse/:id/proof - an UNRELATED ngo cannot upload proof", async () => {
    const res = await request(app)
      .post(`/api/charity/disburse/${disbursementId}/proof`)
      .set("Authorization", `Bearer ${otherNgoToken}`)
      .attach("file", Buffer.from("dummy proof"), "proof.pdf");

    expect(res.status).toBe(404);
  });

  test("POST /api/charity/disburse/:id/proof - owning ngo uploads proof", async () => {
    const res = await request(app)
      .post(`/api/charity/disburse/${disbursementId}/proof`)
      .set("Authorization", `Bearer ${ngoToken}`)
      .attach("file", Buffer.from("dummy proof"), "proof.pdf");

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty("documentId");
  });

  test("GET /api/admin/milestones/pending - admin sees the milestone with submitted proof", async () => {
    const res = await request(app)
      .get("/api/admin/milestones/pending")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.some((d: any) => d.id === disbursementId)).toBe(true);
  });

  test("POST /api/admin/milestones/:id/reject - a CHARITY cannot reject (RBAC)", async () => {
    const res = await request(app)
      .post(`/api/admin/milestones/${disbursementId}/reject`)
      .set("Authorization", `Bearer ${ngoToken}`)
      .send({ reason: "not good enough" });

    expect(res.status).toBe(403);
  });

  test("POST /api/admin/milestones/:id/reject - admin rejects with a reason", async () => {
    const res = await request(app)
      .post(`/api/admin/milestones/${disbursementId}/reject`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ reason: "field report insufficient" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe(DisbursementStatus.REJECTED);
  });

  test("POST /api/admin/milestones/:id/approve - cannot approve a rejected milestone", async () => {
    const res = await request(app)
      .post(`/api/admin/milestones/${disbursementId}/approve`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(400);
  });
});
