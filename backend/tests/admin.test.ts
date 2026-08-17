import request from "supertest";
import app from "../src/index";
import { prisma } from "../src/db/prisma";
import jwt from "jsonwebtoken";
import { UserRole, NgoStatus, CampaignStatus } from "../generated/prisma/enums";

const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || "access_secret";

import crypto from "crypto";

// Mock storage service to avoid AWS calls in tests
import { StorageService } from "../src/services/storageService";
jest.spyOn(StorageService.prototype, "uploadFile").mockResolvedValue(undefined);

describe("Admin API Integration Tests", () => {
  let adminToken: string;
  let adminUserId: string;
  let ngoUserId: string;
  let campaignId: string;

  beforeAll(async () => {
    // Create a mock admin
    const admin = await prisma.profile.create({
      data: {
        email: `admin-${crypto.randomUUID()}@example.com`,
        role: UserRole.ADMIN,
      },
    });
    adminUserId = admin.id;
    adminToken = jwt.sign({ userId: admin.id }, JWT_ACCESS_SECRET, {
      expiresIn: "1h",
    });

    // Create a mock NGO
    const ngo = await prisma.profile.create({
      data: {
        email: `ngo-${crypto.randomUUID()}@example.com`,
        role: UserRole.CHARITY,
        ngoStatus: NgoStatus.PENDING,
      },
    });
    ngoUserId = ngo.id;

    // Create a mock Campaign
    const campaign = await prisma.campaign.create({
      data: {
        ngoId: ngo.id,
        title: "Test Admin Campaign",
        description: "Test description",
        targetAmount: 10000,
        status: CampaignStatus.PENDING_APPROVAL,
      },
    });
    campaignId = campaign.id;
  });

  afterAll(async () => {
    // Clean up
    await prisma.governmentRequest.deleteMany({});
    await prisma.campaign.deleteMany({ where: { id: campaignId } });
    await prisma.auditLog.deleteMany({ where: { actorId: adminUserId } });
    await prisma.profile.deleteMany({
      where: { id: { in: [adminUserId, ngoUserId] } },
    });
  });

  it("GET /api/admin/ngos - should list NGOs", async () => {
    const res = await request(app)
      .get("/api/admin/ngos")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("POST /api/admin/ngos/:id/approve - should approve NGO", async () => {
    const res = await request(app)
      .post(`/api/admin/ngos/${ngoUserId}/approve`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.ngoStatus).toBe(NgoStatus.ACTIVE);
  });

  it("POST /api/admin/campaigns/:id/approve - should approve campaign", async () => {
    const res = await request(app)
      .post(`/api/admin/campaigns/${campaignId}/approve`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe(CampaignStatus.ACTIVE);
  });

  it("GET /api/admin/users - should list users", async () => {
    const res = await request(app)
      .get("/api/admin/users")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.users)).toBe(true);
    expect(res.body.pagination).toBeDefined();
  });

  it("GET /api/admin/audit-logs - should fetch audit logs", async () => {
    const res = await request(app)
      .get("/api/admin/audit-logs")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.auditLogs)).toBe(true);
  });

  it("POST /api/admin/government-requests - should create government request", async () => {
    const res = await request(app)
      .post("/api/admin/government-requests")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        requestRef: `GR-REF-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
        requestingBody: "Ministry of Home Affairs",
        legalBasis: "FCRA Act 2010",
        scope: { type: "donation_investigation" },
      });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty("id");
    expect(res.body.requestingBody).toBe("Ministry of Home Affairs");
    expect(res.body.status).toBe("OPEN");
  });

  it("POST /api/admin/government-requests/:id/hold - should place legal hold on documents", async () => {
    let docRes = null;
    // Create a charity user for token
    const charityUser = await prisma.profile.create({
      data: {
        email: `charity-${Date.now()}@example.com`,
        role: UserRole.CHARITY,
        ngoStatus: NgoStatus.ACTIVE,
      },
    });

    const charityToken = jwt.sign(
      { userId: charityUser.id },
      JWT_ACCESS_SECRET,
      { expiresIn: "1h" },
    );

    // First create a document to hold
    docRes = await request(app)
      .post("/api/charity/documents/upload")
      .set("Authorization", `Bearer ${charityToken}`) // Need charity token for this
      .attach("file", Buffer.from("dummy doc content"), "test.pdf");

    const documentId = docRes.body.documentId;

    // Create government request targeting this charity
    const govReqRes = await request(app)
      .post("/api/admin/government-requests")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        requestRef: "GR-HOLD-TEST",
        requestingBody: "Income Tax Department",
        legalBasis: "Section 133 of Income Tax Act",
        targetUserId: charityUser.id,
      });

    const govRequestId = govReqRes.body.id;

    // Place legal hold on the document
    const holdRes = await request(app)
      .post(`/api/admin/government-requests/${govRequestId}/hold`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        documentIds: [documentId],
      });

    expect(holdRes.status).toBe(200);
    expect(holdRes.body.message).toContain("Legal hold placed");

    // Cleanup documents owned by the charity user
    await prisma.document.deleteMany({
      where: { ownerId: charityUser.id },
    });

    // Cleanup charity user
    await prisma.profile.delete({
      where: { id: charityUser.id },
    });
  });

  it("POST /api/admin/government-requests/:id/export - should export held documents", async () => {
    // Create a charity user for token
    const charityUser = await prisma.profile.create({
      data: {
        email: `charity-${Date.now()}@example.com`,
        role: UserRole.CHARITY,
        ngoStatus: NgoStatus.ACTIVE,
      },
    });
    const charityToken = jwt.sign(
      { userId: charityUser.id },
      JWT_ACCESS_SECRET,
      { expiresIn: "1h" },
    );

    // Create government request targeting this charity
    const govReqRes = await request(app)
      .post("/api/admin/government-requests")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        requestRef: "GR-EXPORT-TEST",
        requestingBody: "Enforcement Directorate",
        legalBasis: "FEMA 1999",
        targetUserId: charityUser.id,
      });

    const govRequestId = govReqRes.body.id;

    // Create a document to export
    let docRes = await request(app)
      .post("/api/charity/documents/upload")
      .set("Authorization", `Bearer ${charityToken}`)
      .attach("file", Buffer.from("dummy doc content"), "test.pdf");

    expect(docRes.status).toBe(201);
    expect(docRes.body).toHaveProperty("documentId");

    const documentId = docRes.body.documentId;

    // Place legal hold on the document (required for export)
    await request(app)
      .post(`/api/admin/government-requests/${govRequestId}/hold`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        documentIds: [documentId],
      });

    // Export documents
    const exportRes = await request(app)
      .post(`/api/admin/government-requests/${govRequestId}/export`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(exportRes.status).toBe(200);
    expect(exportRes.body).toHaveProperty("governmentRequestId", govRequestId);
    expect(exportRes.body).toHaveProperty("documentCount");
    expect(exportRes.body.documents).toBeDefined();

    // Cleanup documents first
    await prisma.document.deleteMany({
      where: { ownerId: charityUser.id },
    });

    // Cleanup charity user
    await prisma.profile.delete({
      where: { id: charityUser.id },
    });
  });
});
