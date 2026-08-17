import request from "supertest";
import app from "../src/index";
import { prisma } from "../src/db/prisma";
import jwt from "jsonwebtoken";
import { UserRole, NgoStatus, CampaignStatus } from "../generated/prisma/enums";

const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || "access_secret";

import crypto from "crypto";

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
    adminToken = jwt.sign({ userId: admin.id }, JWT_ACCESS_SECRET, { expiresIn: "1h" });

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
    await prisma.campaign.deleteMany({ where: { id: campaignId } });
    await prisma.auditLog.deleteMany({ where: { actorId: adminUserId } });
    await prisma.profile.deleteMany({ where: { id: { in: [adminUserId, ngoUserId] } } });
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
});
