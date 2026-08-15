import request from "supertest";
import app from "../src/index";
import { prisma } from "../src/db/prisma";
import jwt from "jsonwebtoken";
import { UserRole, NgoStatus, CampaignStatus } from "../generated/prisma/enums";

const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || "access_secret";

describe("Charity API Integration Tests", () => {
  let charityToken: string;
  let charityUserId: string;

  beforeAll(async () => {
    // Create a mock charity user
    const user = await prisma.profile.create({
      data: {
        email: `charity-${Date.now()}@example.com`,
        role: UserRole.CHARITY,
        ngoStatus: NgoStatus.ACTIVE,
      },
    });
    charityUserId = user.id;

    // Generate JWT
    charityToken = jwt.sign({ userId: user.id }, JWT_ACCESS_SECRET, {
      expiresIn: "1h",
    });
  });

  afterAll(async () => {
    // Clean up
    await prisma.document.deleteMany({ where: { ownerId: charityUserId } });
    await prisma.beneficiaryCohort.deleteMany({
      where: { ngoId: charityUserId },
    });
    await prisma.campaign.deleteMany({ where: { ngoId: charityUserId } });
    await prisma.profile.delete({ where: { id: charityUserId } });
  });

  let campaignId: string;
  let cohortId: string;
  let documentId: string;

  test("POST /api/charity/onboard - update NGO details", async () => {
    const res = await request(app)
      .post("/api/charity/onboard")
      .set("Authorization", `Bearer ${charityToken}`)
      .send({
        organisationName: "Test NGO",
        registrationNo: "REG123",
        description: "A test NGO",
      });

    // Will be 400 because ngoStatus is ACTIVE, which is expected based on our setup.
    // Let's create a new user just for onboarding test.
    const pendingUser = await prisma.profile.create({
      data: {
        email: `pending-${Date.now()}@example.com`,
        role: UserRole.DONOR, // Initial role
      },
    });
    const pendingToken = jwt.sign(
      { userId: pendingUser.id },
      JWT_ACCESS_SECRET,
    );

    const onboardRes = await request(app)
      .post("/api/charity/onboard")
      .set("Authorization", `Bearer ${pendingToken}`)
      .send({
        organisationName: "New NGO",
        registrationNo: "NEW123",
        description: "New NGO desc",
      });

    expect(onboardRes.status).toBe(200);

    // Clean up pending user
    await prisma.profile.delete({ where: { id: pendingUser.id } });
  });

  test("POST /api/charity/campaigns - create a campaign", async () => {
    const res = await request(app)
      .post("/api/charity/campaigns")
      .set("Authorization", `Bearer ${charityToken}`)
      .send({
        title: "Save the Turtles",
        description: "Help us save sea turtles",
        targetAmount: 50000,
      });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty("id");
    expect(res.body.status).toBe(CampaignStatus.DRAFT);
    campaignId = res.body.id;
  });

  test("POST /api/charity/campaigns/:id/submit - submit campaign", async () => {
    const res = await request(app)
      .post(`/api/charity/campaigns/${campaignId}/submit`)
      .set("Authorization", `Bearer ${charityToken}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe(CampaignStatus.PENDING_APPROVAL);
  });

  test("POST /api/charity/cohorts - create cohort", async () => {
    const res = await request(app)
      .post("/api/charity/cohorts")
      .set("Authorization", `Bearer ${charityToken}`)
      .send({
        campaignId,
        name: "Turtle Rescuers",
        count: 50,
      });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty("id");
    cohortId = res.body.id;
  });

  test("POST /api/charity/documents/upload - upload file", async () => {
    const res = await request(app)
      .post("/api/charity/documents/upload")
      .set("Authorization", `Bearer ${charityToken}`)
      .attach("file", Buffer.from("dummy pdf content"), "test.pdf");

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty("documentId");
    documentId = res.body.documentId;
  });

  test("POST /api/charity/cohorts/:id/proof - upload proof for cohort", async () => {
    const res = await request(app)
      .post(`/api/charity/cohorts/${cohortId}/proof`)
      .set("Authorization", `Bearer ${charityToken}`)
      .attach("file", Buffer.from("dummy proof content"), "proof.pdf");

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty("sha512DocHash");
  });

  test("GET /api/charity/documents - list documents", async () => {
    const res = await request(app)
      .get("/api/charity/documents")
      .set("Authorization", `Bearer ${charityToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(2); // One upload, one proof
  });
});
