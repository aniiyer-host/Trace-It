import request from "supertest";
import app from "../src/index.js";
import { prisma } from "../src/db/prisma.js";
import jwt from "jsonwebtoken";
import { getBlockchainService } from "../src/services/blockchainInstance.js";
import { UserRole, NgoStatus, DocumentType } from "../generated/prisma/enums.js";

const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || "access_secret";

describe("Document Hash Verification Endpoint", () => {
  let adminToken: string;
  let charityToken: string;
  let adminUserId: string;
  let charityUserId: string;
  let ngoId: string;
  let campaignId: string;
  let cohortId: string;
  let documentId: string;
  let proofDocId: string;

  beforeAll(async () => {
    // Create admin user
    const adminUser = await prisma.profile.create({
      data: {
        email: `admin-${Date.now()}@example.com`,
        role: UserRole.ADMIN,
      },
    });
    adminUserId = adminUser.id;
    adminToken = jwt.sign({ userId: adminUser.id }, JWT_ACCESS_SECRET, {
      expiresIn: "1h",
    });

    // Create charity user (NGO)
    const charityUser = await prisma.profile.create({
      data: {
        email: `charity-${Date.now()}@example.com`,
        role: UserRole.CHARITY,
        ngoStatus: NgoStatus.PENDING,
      },
    });
    charityUserId = charityUser.id;
    charityToken = jwt.sign({ userId: charityUser.id }, JWT_ACCESS_SECRET, {
      expiresIn: "1h",
    });

    // Create a campaign for the NGO
    const campaign = await prisma.campaign.create({
      data: {
        title: `Test Campaign ${Date.now()}`,
        description: "A test campaign for Phase 3",
        ngoId: charityUserId,
        targetAmount: 10000, // Required field
        status: "DRAFT",
      },
    });
    campaignId = campaign.id;

    // Create a cohort for the campaign
    const cohort = await prisma.beneficiaryCohort.create({
      data: {
        name: `Test Cohort ${Date.now()}`,
        beneficiaryCount: 10,
        campaignId,
        ngoId: charityUserId,
      },
    });
    cohortId = cohort.id;

    // Upload a test document for NGO verification
    const ngoDoc = await prisma.document.create({
      data: {
        ownerId: charityUserId,
        documentType: DocumentType.NGO_CERT,
        sha512Hash: "test_ngo_metadata_hash_" + Date.now(),
        storageBucket: "test-bucket",
        storagePath: "test/path/ngo-cert.pdf",
      },
    });
    documentId = ngoDoc.id;

    // Create a proof document for the cohort
    const proofDoc = await prisma.document.create({
      data: {
        ownerId: charityUserId,
        campaignId,
        documentType: DocumentType.COHORT_PROOF,
        sha512Hash: "test_cohort_proof_hash_" + Date.now(),
        storageBucket: "test-bucket",
        storagePath: "test/path/cohash-proof.pdf",
      },
    });
    proofDocId = proofDoc.id;
  });

  afterAll(async () => {
    // Clean up test data
    await prisma.document.deleteMany({
      where: { ownerId: charityUserId },
    });
    await prisma.beneficiaryCohort.deleteMany({
      where: { ngoId: charityUserId },
    });
    await prisma.campaign.deleteMany({
      where: { ngoId: charityUserId },
    });
    await prisma.profile.deleteMany({
      where: { id: { in: [adminUserId, charityUserId] } },
    });
  });

  it("should verify a document's hash against the on-chain record", async () => {
    // Test the verification endpoint
    const res = await request(app)
      .get(`/api/charity/documents/${proofDocId}/verify`)
      // No authentication required - this is a public endpoint for auditors
      .expect(200);

    expect(res.body).toHaveProperty("documentId", proofDocId);
    expect(res.body).toHaveProperty("isValid"); // Boolean indicating if hash matches
    expect(res.body).toHaveProperty("onChainHash");
    expect(res.body).toHaveProperty("providedHash");
    expect(res.body).toHaveProperty("verifiedAt");

    // Clean up the test document
    await prisma.document.delete({ where: { id: proofDocId } });
  });

  it("should return 404 for non-existent document", async () => {
    const fakeId = "00000000-0000-0000-0000-000000000000";
    const res = await request(app)
      .get(`/api/charity/documents/${fakeId}/verify`)
      .expect(404);

    expect(res.body).toHaveProperty("error");
  });

  it("should return 400 for non-COHORT_PROOF document", async () => {
    // Use the NGO cert document we created earlier
    const res = await request(app)
      .get(`/api/charity/documents/${documentId}/verify`)
      .expect(400);

    expect(res.body).toHaveProperty("error");
    expect(res.body.error).toContain("not a cohort proof document");
  });
});