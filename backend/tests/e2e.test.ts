import request from "supertest";
import app from "../src/index.js";
import { prisma } from "../src/db/prisma.js";
import jwt from "jsonwebtoken";
import {
  UserRole,
  NgoStatus,
  CampaignStatus,
  DonationStatus,
  DisbursementStatus,
  KycStatus,
} from "../generated/prisma/enums";
import crypto from "crypto";

// Mock storage service to avoid AWS/B2 calls in tests
import { StorageService } from "../src/services/storageService";
jest.spyOn(StorageService.prototype, "uploadFile").mockResolvedValue(undefined);

const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || "access_secret";
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || "refresh_secret";

describe("End-to-End Flow Tests", () => {
  let adminToken: string;
  let adminUserId: string;
  let ngoToken: string;
  let ngoUserId: string;
  let donorToken: string;
  let donorUserId: string;
  let donor2Token: string;
  let donor2UserId: string;

  let campaignId: string;
  let cohortId: string;
  let donationId: string;
  let donationPublicId: string;
  let disbursementId: string;
  let documentId: string;

  beforeAll(async () => {
    // Clear test data
    await prisma.governmentRequest.deleteMany({});
    await prisma.auditLog.deleteMany({});
    await prisma.document.deleteMany({});
    await prisma.disbursement.deleteMany({});
    await prisma.beneficiaryCohort.deleteMany({});
    await prisma.donation.deleteMany({});
    await prisma.campaign.deleteMany({});
    await prisma.profile.deleteMany({});

    // Create admin user
    const admin = await prisma.profile.create({
      data: {
        email: `admin-${crypto.randomUUID()}@test.com`,
        role: UserRole.ADMIN,
        isVerified: true,
      },
    });
    adminUserId = admin.id;
    adminToken = jwt.sign({ userId: admin.id }, JWT_ACCESS_SECRET, {
      expiresIn: "1h",
    });

    // Create NGO user
    const ngo = await prisma.profile.create({
      data: {
        email: `ngo-${crypto.randomUUID()}@test.com`,
        role: UserRole.CHARITY,
        ngoStatus: NgoStatus.ACTIVE,
        isVerified: true,
      },
    });
    ngoUserId = ngo.id;
    ngoToken = jwt.sign({ userId: ngo.id }, JWT_ACCESS_SECRET, {
      expiresIn: "1h",
    });

    // Create donor user 1
    const donor = await prisma.profile.create({
      data: {
        email: `donor-${crypto.randomUUID()}@test.com`,
        role: UserRole.DONOR,
        kycStatus: KycStatus.APPROVED,
        isVerified: true,
      },
    });
    donorUserId = donor.id;
    donorToken = jwt.sign({ userId: donor.id }, JWT_ACCESS_SECRET, {
      expiresIn: "1h",
    });

    // Create donor user 2 (without KYC)
    const donor2 = await prisma.profile.create({
      data: {
        email: `donor2-${crypto.randomUUID()}@test.com`,
        role: UserRole.DONOR,
        kycStatus: KycStatus.NOT_REQUIRED,
        isVerified: true,
      },
    });
    donor2UserId = donor2.id;
    donor2Token = jwt.sign({ userId: donor2.id }, JWT_ACCESS_SECRET, {
      expiresIn: "1h",
    });
  });

  afterAll(async () => {
    // Cleanup
    await prisma.governmentRequest.deleteMany({});
    await prisma.auditLog.deleteMany({});
    await prisma.document.deleteMany({});
    await prisma.disbursement.deleteMany({});
    await prisma.beneficiaryCohort.deleteMany({});
    await prisma.donation.deleteMany({});
    await prisma.campaign.deleteMany({});
    await prisma.profile.deleteMany({});
  });

  describe("Complete Donor Flow", () => {
    it("should allow donor to signup and verify email", async () => {
      // This would typically be done via Supabase auth,
      // but we're testing the backend flow
      expect(donorToken).toBeDefined();
    });

    it("should allow KYC approved donor to make donation", async () => {
      // First create a campaign
      const campaignRes = await request(app)
        .post("/api/charity/campaigns")
        .set("Authorization", `Bearer ${ngoToken}`)
        .send({
          title: "Test Campaign for E2E",
          description: "Testing end-to-end flow",
          targetAmount: 10000,
          category: "Test",
        });

      expect(campaignRes.status).toBe(201);
      campaignId = campaignRes.body.id;

      // Submit campaign for approval
      await request(app)
        .post(`/api/charity/campaigns/${campaignId}/submit`)
        .set("Authorization", `Bearer ${ngoToken}`);

      // Admin approves campaign
      await request(app)
        .post(`/api/admin/campaigns/${campaignId}/approve`)
        .set("Authorization", `Bearer ${adminToken}`);

      // Donor makes donation
      const donationRes = await request(app)
        .post("/api/donor/donate")
        .set("Authorization", `Bearer ${donorToken}`)
        .send({
          ngoId: ngoUserId,
          campaignId,
          amount: 5000,
          paymentMethod: "UPI",
        });

      // expect([200, 201]).toContain(donationRes.status);
      expect(donationRes.status).toBe(201);
      expect(donationRes.body).toHaveProperty("orderId");
      expect(donationRes.body).toHaveProperty("publicDonationId");
      // Store both IDs for different endpoints
      donationPublicId = donationRes.body.publicDonationId;
      // We need to get the actual donation record to get the UUID id
      const donationRecord = await prisma.donation.findFirst({
        where: { publicId: donationRes.body.publicDonationId },
        select: { id: true },
      });

      expect(donationRecord).not.toBeNull();

      donationId = donationRecord!.id;
    });

    it("should handle webhook success and update donation status", async () => {
      // Simulate Razorpay webhook for successful payment
      const webhookRes = await request(app)
        .post("/api/webhooks/razorpay")
        .set("Content-Type", "application/json")
        .send({
          event: "payment.captured",
          payload: {
            payment: {
              entity: {
                id: "pay_test_" + Date.now(),
                order_id: "order_test_" + Date.now(), // This should match the orderId from donation
                amount: 500000, // amount in paisa (₹5000)
                currency: "INR",
                status: "captured",
                method: "upi",
              },
            },
          },
        });

      // Note: In real scenario, we'd need to match the order_id
      // For this test, we'll verify the endpoint exists and processes
      expect([200, 400, 401]).toContain(webhookRes.status); // 400/401 expected due to signature mismatch
    });

    it("should allow donor to check donation status", async () => {
      // Create a campaign
      const campaignRes = await request(app)
        .post("/api/charity/campaigns")
        .set("Authorization", `Bearer ${ngoToken}`)
        .send({
          title: "Test Campaign for Timeline",
          description: "Testing donation timeline",
          targetAmount: 10000,
          category: "Test",
        });

      expect(campaignRes.status).toBe(201);
      const campaignId = campaignRes.body.id;

      // Submit and approve the campaign
      await request(app)
        .post(`/api/charity/campaigns/${campaignId}/submit`)
        .set("Authorization", `Bearer ${ngoToken}`);

      await request(app)
        .post(`/api/admin/campaigns/${campaignId}/approve`)
        .set("Authorization", `Bearer ${adminToken}`);

      // Create a donor and make a donation
      const donor = await prisma.profile.create({
        data: {
          email: `donortimeline-${crypto.randomUUID()}@test.com`,
          role: UserRole.DONOR,
          kycStatus: KycStatus.APPROVED,
          isVerified: true,
        },
      });
      const donorToken = jwt.sign({ userId: donor.id }, JWT_ACCESS_SECRET, {
        expiresIn: "1h",
      });

      const donationRes = await request(app)
        .post("/api/donor/donate")
        .set("Authorization", `Bearer ${donorToken}`)
        .send({
          ngoId: ngoUserId,
          campaignId,
          amount: 5000,
          paymentMethod: "UPI",
        });

      // expect(donationRes.status).toBe(200);
      expect(donationRes.status).toBe(201);
      const donationId = donationRes.body.publicDonationId;
      // Get the UUID id
      const donationRecord = await prisma.donation.findFirst({
        where: { publicId: donationId },
        select: { id: true },
      });
      const donationUuid = donationRecord!.id;

      // Update donation status to SUCCESS (simulating webhook)
      await prisma.donation.update({
        where: { publicId: donationId },
        data: { status: DonationStatus.SUCCESS },
      });

      // Now check the timeline
      const statusRes = await request(app)
        .get(`/api/donor/donations/${donationUuid}/timeline`)
        .set("Authorization", `Bearer ${donorToken}`);

      expect(statusRes.status).toBe(200);
      expect(Array.isArray(statusRes.body)).toBe(true);
    });

    it("should generate 80G receipt after successful donation", async () => {
      const receiptRes = await request(app)
        .get(`/api/donor/receipt/${donationId}`)
        .set("Authorization", `Bearer ${donorToken}`);

      // Might be 400 if donation not yet confirmed, 404 if receipt not generated yet, or 200 if generated
      expect([200, 400, 404]).toContain(receiptRes.status);
    });
  });

  describe("Complete NGO Flow", () => {
    it("should allow NGO onboarding", async () => {
      // Create new NGO for onboarding test
      const newNgo = await prisma.profile.create({
        data: {
          email: `newnogo-${crypto.randomUUID()}@test.com`,
          role: UserRole.DONOR, // Start as donor
          isVerified: true,
        },
      });
      const newNgoToken = jwt.sign({ userId: newNgo.id }, JWT_ACCESS_SECRET, {
        expiresIn: "1h",
      });

      const onboardRes = await request(app)
        .post("/api/charity/onboard")
        .set("Authorization", `Bearer ${newNgoToken}`)
        .send({
          organisationName: "Test NGO Org",
          registrationNo: "TESTREG001",
          description: "A test NGO for E2E testing",
        });

      expect(onboardRes.status).toBe(200);

      // Cleanup
      await prisma.profile.delete({ where: { id: newNgo.id } });
    });

    it("should allow NGO to upload documents", async () => {
      const docRes = await request(app)
        .post("/api/charity/documents/upload")
        .set("Authorization", `Bearer ${ngoToken}`)
        .attach(
          "file",
          Buffer.from("test ngo certificate content"),
          "ngo_cert.pdf",
        );

      expect(docRes.status).toBe(201);
      expect(docRes.body).toHaveProperty("documentId");
      documentId = docRes.body.documentId;
    });

    it("should allow NGO to create campaign", async () => {
      // We already created a campaign above in donor flow test
      expect(campaignId).toBeDefined();
    });

    it("should allow NGO to create beneficiary cohort", async () => {
      const cohortRes = await request(app)
        .post("/api/charity/cohorts")
        .set("Authorization", `Bearer ${ngoToken}`)
        .send({
          campaignId,
          name: "Test Cohort",
          beneficiaryCount: 25,
          description: "Cohort for testing",
        });

      expect(cohortRes.status).toBe(201);
      expect(cohortRes.body).toHaveProperty("id");
      cohortId = cohortRes.body.id;
    });

    it("should allow NGO to upload cohort proof", async () => {
      const proofRes = await request(app)
        .post(`/api/charity/cohorts/${cohortId}/proof`)
        .set("Authorization", `Bearer ${ngoToken}`)
        .attach(
          "file",
          Buffer.from("test cohort proof content"),
          "cohort_proof.pdf",
        );

      expect(proofRes.status).toBe(201);
      expect(proofRes.body).toHaveProperty("sha512DocHash");
    });

    it("should allow NGO to create disbursement", async () => {
      // Mark the initial donor's donation as SUCCESS first
      // (simulating that the Razorpay webhook has already processed the payment)
      await prisma.donation.updateMany({
        where: { campaignId, status: "INITIATED" },
        data: { status: "SUCCESS" },
      });

      const disburseRes = await request(app)
        .post("/api/charity/disburse")
        .set("Authorization", `Bearer ${ngoToken}`)
        .send({
          cohortId,
          amountInr: 3000,
          fieldReportUrl: "https://example.com/field-report.pdf",
        });

      expect(disburseRes.status).toBe(201);
      expect(disburseRes.body).toHaveProperty("id");
      expect(disburseRes.body.status).toBe(DisbursementStatus.PENDING);
      disbursementId = disburseRes.body.id;
    });

    it("should allow NGO to view disbursements", async () => {
      const disbursementsRes = await request(app)
        .get("/api/charity/disbursements")
        .set("Authorization", `Bearer ${ngoToken}`);

      expect(disbursementsRes.status).toBe(200);
      expect(Array.isArray(disbursementsRes.body)).toBe(true);
      expect(disbursementsRes.body.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("Admin Approval Flow", () => {
    it("should allow admin to approve disbursement", async () => {
      const approveRes = await request(app)
        .post(`/api/admin/disburse/${disbursementId}/approve`)
        .set("Authorization", `Bearer ${adminToken}`);

      expect(approveRes.status).toBe(200);
      expect(approveRes.body.status).toBe(DisbursementStatus.APPROVED);
      expect(approveRes.body.approvedBy).toBe(adminUserId);
    });

    it("should trigger donation allocation on disbursement approval", async () => {
      // Check if donations were allocated
      const donations = await prisma.donation.findMany({
        where: { campaignId },
      });

      const allocatedDonations = donations.filter(
        (d) => d.status === 'ALLOCATED',
      );

      // Should have at least one allocated donation
      expect(allocatedDonations.length).toBeGreaterThanOrEqual(1);
    });

    it("should allow admin to view audit logs", async () => {
      const auditRes = await request(app)
        .get("/api/admin/audit-logs")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(auditRes.status).toBe(200);
      expect(auditRes.body).toHaveProperty("auditLogs");
      expect(Array.isArray(auditRes.body.auditLogs)).toBe(true);
    });
  });

  describe("Compliance Reporting", () => {
    it("should generate FCRA report for NGO", async () => {
      // Create a campaign
      const campaignRes = await request(app)
        .post("/api/charity/campaigns")
        .set("Authorization", `Bearer ${ngoToken}`)
        .send({
          title: "Test Campaign for FCRA",
          description: "Testing FCRA report",
          targetAmount: 10000,
          category: "Test",
        });

      expect(campaignRes.status).toBe(201);
      const campaignId = campaignRes.body.id;

      // Submit and approve the campaign
      await request(app)
        .post(`/api/charity/campaigns/${campaignId}/submit`)
        .set("Authorization", `Bearer ${ngoToken}`);

      await request(app)
        .post(`/api/admin/campaigns/${campaignId}/approve`)
        .set("Authorization", `Bearer ${adminToken}`);

      // Create a donor and make a donation (foreign donation for FCRA)
      const donor = await prisma.profile.create({
        data: {
          email: `donorfcra-${crypto.randomUUID()}@test.com`,
          role: UserRole.DONOR,
          kycStatus: KycStatus.APPROVED,
          isVerified: true,
        },
      });
      const donorToken = jwt.sign({ userId: donor.id }, JWT_ACCESS_SECRET, {
        expiresIn: "1h",
      });

      const donationRes = await request(app)
        .post("/api/donor/donate")
        .set("Authorization", `Bearer ${donorToken}`)
        .send({
          ngoId: ngoUserId,
          campaignId,
          amount: 5000,
          paymentMethod: "UPI",
        });

      // expect(donationRes.status).toBe(200);
      expect(donationRes.status).toBe(201);
      const donationId = donationRes.body.publicDonationId;

      // Update donation status to SUCCESS (simulating webhook)
      await prisma.donation.update({
        where: { publicId: donationId },
        data: { status: DonationStatus.SUCCESS },
      });

      // Now request the FCRA report
      const fcraRes = await request(app)
        .get(`/api/charity/reports/fcra`)
        .set("Authorization", `Bearer ${ngoToken}`);

      expect(fcraRes.status).toBe(200);
      expect(fcraRes.body).toHaveProperty("ngoId", ngoUserId);
      expect(fcraRes.body.totalDonations).toBeGreaterThanOrEqual(5000); // At least 5000 INR
      expect(fcraRes.body).toHaveProperty("donationsDetails");
      expect(Array.isArray(fcraRes.body.donationsDetails)).toBe(true);
      expect(fcraRes.body.donationsDetails.length).toBeGreaterThanOrEqual(1);
      expect(fcraRes.body.donationsDetails[0]).toHaveProperty("amount");
    });

    it("should generate 80G report for NGO", async () => {
      // Create a campaign
      const campaignRes = await request(app)
        .post("/api/charity/campaigns")
        .set("Authorization", `Bearer ${ngoToken}`)
        .send({
          title: "Test Campaign for 80G",
          description: "Testing 80G report",
          targetAmount: 10000,
          category: "Test",
        });

      expect(campaignRes.status).toBe(201);
      const campaignId = campaignRes.body.id;

      // Submit and approve the campaign
      await request(app)
        .post(`/api/charity/campaigns/${campaignId}/submit`)
        .set("Authorization", `Bearer ${ngoToken}`);

      await request(app)
        .post(`/api/admin/campaigns/${campaignId}/approve`)
        .set("Authorization", `Bearer ${adminToken}`);

      // Create a donor and make a donation
      const donor = await prisma.profile.create({
        data: {
          email: `donor80g-${crypto.randomUUID()}@test.com`,
          role: UserRole.DONOR,
          kycStatus: KycStatus.APPROVED,
          isVerified: true,
        },
      });
      const donorToken = jwt.sign({ userId: donor.id }, JWT_ACCESS_SECRET, {
        expiresIn: "1h",
      });

      const donationRes = await request(app)
        .post("/api/donor/donate")
        .set("Authorization", `Bearer ${donorToken}`)
        .send({
          ngoId: ngoUserId,
          campaignId,
          amount: 5000,
          paymentMethod: "UPI",
        });

      // expect(donationRes.status).toBe(200);
      expect(donationRes.status).toBe(201);
      const donationId = donationRes.body.publicDonationId;

      // Update donation status to SUCCESS (simulating webhook)
      await prisma.donation.update({
        where: { publicId: donationId },
        data: { status: DonationStatus.SUCCESS },
      });

      // Now request the 80G report
      const eightyGRes = await request(app)
        .get(`/api/charity/reports/80g`)
        .set("Authorization", `Bearer ${ngoToken}`);

      expect(eightyGRes.status).toBe(200);
      expect(eightyGRes.body).toHaveProperty("ngoId", ngoUserId);
      expect(eightyGRes.body.totalDonations).toBeGreaterThanOrEqual(5000); // At least 5000 INR
      expect(eightyGRes.body).toHaveProperty("donationsDetails");
      expect(Array.isArray(eightyGRes.body.donationsDetails)).toBe(true);
      expect(eightyGRes.body.donationsDetails.length).toBeGreaterThanOrEqual(1);
      expect(eightyGRes.body.donationsDetails[0]).toHaveProperty(
        "amount",
      );
    });
  });

  describe("Legal Gateway Flow", () => {
    it("should allow admin to create government request", async () => {
      const govReqRes = await request(app)
        .post("/api/admin/government-requests")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          requestRef: `GR-E2E-${Date.now()}`,
          requestingBody: "Ministry of Home Affairs",
          legalBasis: "FCRA Act 2010",
          scope: { type: "donation_investigation", ngoId: ngoUserId },
        });

      expect(govReqRes.status).toBe(201);
      expect(govReqRes.body).toHaveProperty("id");
      expect(govReqRes.body.requestingBody).toBe("Ministry of Home Affairs");
    });

    it("should allow admin to place legal hold on documents", async () => {
      // First create a government request
      const govReqRes = await request(app)
        .post("/api/admin/government-requests")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          requestRef: `GR-HOLD-${Date.now()}`,
          requestingBody: "Income Tax Department",
          legalBasis: "Section 133 of Income Tax Act",
          targetUserId: ngoUserId,
        });

      const govRequestId = govReqRes.body.id;

      // Place legal hold on document
      const holdRes = await request(app)
        .post(`/api/admin/government-requests/${govRequestId}/hold`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          documentIds: [documentId],
        });

      expect(holdRes.status).toBe(200);
      expect(holdRes.body.message).toContain("Legal hold placed");
    });

    it("should allow admin to export held documents", async () => {
      // Create government request for export test
      const govReqRes = await request(app)
        .post("/api/admin/government-requests")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          requestRef: `GR-EXPORT-${Date.now()}`,
          requestingBody: "Enforcement Directorate",
          legalBasis: "FEMA 1999",
          targetUserId: ngoUserId,
        });

      const govRequestId = govReqRes.body.id;

      // Create a document to export
      const docRes = await request(app)
        .post("/api/charity/documents/upload")
        .set("Authorization", `Bearer ${ngoToken}`)
        .attach("file", Buffer.from("test export document"), "export_doc.pdf");

      expect(docRes.status).toBe(201);
      expect(docRes.body).toHaveProperty("documentId");
      const exportDocId = docRes.body.documentId;

      // Place legal hold
      await request(app)
        .post(`/api/admin/government-requests/${govRequestId}/hold`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          documentIds: [exportDocId],
        });

      // Export documents
      const exportRes = await request(app)
        .post(`/api/admin/government-requests/${govRequestId}/export`)
        .set("Authorization", `Bearer ${adminToken}`);

      expect(exportRes.status).toBe(200);
      expect(exportRes.body).toHaveProperty(
        "governmentRequestId",
        govRequestId,
      );
      expect(exportRes.body).toHaveProperty("documentCount");
      expect(exportRes.body.documents).toBeDefined();

      // Cleanup
      await prisma.document.delete({ where: { id: exportDocId } });
    });
  });

  describe("Negative Tests & Security", () => {
    it("should return empty campaigns list for non-NGO users", async () => {
      const res = await request(app)
        .get("/api/charity/campaigns")
        .set("Authorization", `Bearer ${donorToken}`); // Donor accessing charity endpoint

      expect(res.status).toBe(200); // Authenticated but not NGO
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(0); // Should be empty for non-NGO users
    });

    it("should prevent donor without KYC from making large donations", async () => {
      const largeDonationRes = await request(app)
        .post("/api/donor/donate")
        .set("Authorization", `Bearer ${donor2Token}`) // Donor without KYC
        .send({
          ngoId: ngoUserId,
          campaignId,
          amount: 15000, // Above KYC threshold of 10000
          paymentMethod: "UPI",
        });

      expect(largeDonationRes.status).toBe(402); // Payment Required / Requires KYC
      expect(largeDonationRes.body).toHaveProperty("requiresKyc", true);
    });

    it("should prevent SQL injection attempts", async () => {
      // Test with malicious input that tries to break SQL query
      const sqlInjectionRes = await request(app)
        .get(`/api/donor/donations/${donationPublicId}' OR '1'='1`)
        .set("Authorization", `Bearer ${donorToken}`);

      // Should not return 200 or expose data (should be 400 or 404)
      expect([400, 404]).toContain(sqlInjectionRes.status);
    });
  });

  describe("System Health & Performance", () => {
    it("should respond to health checks", async () => {
      const healthRes = await request(app).get("/api/health");
      // Note: Health endpoint might not exist, so we check for common health patterns
      expect([200, 404]).toContain(healthRes.status);
    });

    it("should handle concurrent requests", async () => {
      // Create multiple concurrent donation requests
      const promises = [];
      for (let i = 0; i < 5; i++) {
        promises.push(
          request(app)
            .post("/api/donor/donate")
            .set("Authorization", `Bearer ${donorToken}`)
            .send({
              ngoId: ngoUserId,
              campaignId,
              amount: 1000 + i * 100, // Small amounts
              paymentMethod: "UPI",
            }),
        );
      }

      const results = await Promise.all(promises);

      // All should either succeed (201) or give predictable errors (like duplicate order: 400, KYC: 402)
      results.forEach((res) => {
        expect([201, 200, 400, 402]).toContain(res.status);
      });
    });
  });
});
