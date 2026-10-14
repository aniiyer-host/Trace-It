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
  KycStatus,
  ProvenanceEventType,
} from "../generated/prisma/enums.js";
import crypto from "crypto";
import {
  computeChainHash,
  hashProvenanceEvent,
} from "../src/utils/provenance.js";

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
        kycStatus: KycStatus.NOT_REQUIRED,
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
    expect(res.body).toHaveProperty("razorpayOrderId");
    expect(res.body).toHaveProperty("publicId");

    // Verify donation was created as INITIATED in DB
    const donation = await prisma.donation.findUnique({
      where: { id: res.body.id },
    });
    expect(donation).not.toBeNull();
    expect(donation?.status).toBe("INITIATED");
  });

  it("creates an NGO receipt attestation when payment succeeds", async () => {
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

    const transitionKey = `pay_sim_${donationId.replace(/-/g, "")}`;
    const provenanceEvents = await prisma.provenanceEvent.findMany({
      where: {
        entityId: donationId,
        eventType: ProvenanceEventType.DONATION_SUCCESS,
      },
    });
    expect(provenanceEvents).toHaveLength(1);
    const [provenanceEvent] = provenanceEvents;
    expect(provenanceEvent).toMatchObject({
      eventType: ProvenanceEventType.DONATION_SUCCESS,
      entityType: "Donation",
      entityId: donationId,
      amountInr: "500.00",
      ngoId: ngoUserId,
      campaignId,
      transitionKey,
    });
    const canonicalPayload = JSON.parse(provenanceEvent.canonicalPayload) as Record<string, unknown>;
    expect(Object.keys(canonicalPayload)).toEqual([
      "schemaVersion",
      "eventType",
      "entityType",
      "entityId",
      "amountInr",
      "ngoId",
      "campaignId",
      "occurredAt",
    ]);
    expect(canonicalPayload).toEqual({
      schemaVersion: 1,
      eventType: "DONATION_SUCCESS",
      entityType: "Donation",
      entityId: donationId,
      amountInr: "500.00",
      ngoId: ngoUserId,
      campaignId,
      occurredAt: provenanceEvent.occurredAt.toISOString(),
    });
    expect(provenanceEvent.payloadHash).toBe(
      hashProvenanceEvent({
        eventType: "DONATION_SUCCESS",
        entityType: "Donation",
        entityId: donationId,
        amountInr: "500.00",
        ngoId: ngoUserId,
        campaignId,
        occurredAt: provenanceEvent.occurredAt,
      }),
    );
    const precedingChainEvent = await prisma.provenanceEvent.findFirst({
      where: {
        chainHash: { not: null },
        id: { lt: provenanceEvent.id },
      },
      orderBy: { id: "desc" },
      select: { chainHash: true },
    });
    expect(provenanceEvent.previous_hash).toBe(
      precedingChainEvent?.chainHash ?? null,
    );
    expect(provenanceEvent.chainHash).toBe(
      computeChainHash(
        {
          eventType: provenanceEvent.eventType,
          entityType: provenanceEvent.entityType,
          entityId: provenanceEvent.entityId,
          amountInr: provenanceEvent.amountInr,
          ngoId: provenanceEvent.ngoId,
          campaignId: provenanceEvent.campaignId,
          occurredAt: provenanceEvent.occurredAt,
        },
        provenanceEvent.previous_hash,
      ),
    );
    
    expect(updated?.attestations).toHaveLength(1);
    expect(updated?.attestations[0]).toMatchObject({
      type: "RECEIPT",
      status: "PENDING",
      disbursementId: null,
      requestedBy: donorUserId,
    });
    expect(updated?.attestations[0].allocatedAmount?.toFixed(2)).toBe(
      "500.00",
    );

    const ngoPendingAttestations = await request(app)
      .get("/api/charity/attestations/pending")
      .set("Authorization", `Bearer ${ngoToken}`);
    expect(ngoPendingAttestations.status).toBe(200);
    expect(
      ngoPendingAttestations.body.some(
        (attestation: { donationId: string; type: string }) =>
          attestation.donationId === donationId &&
          attestation.type === "RECEIPT",
      ),
    ).toBe(true);

    const receiptResponse = await request(app)
      .get(`/api/donor/receipt/${donationId}`)
      .set("Authorization", `Bearer ${donorToken}`);
    expect(receiptResponse.status).toBe(200);
    expect(receiptResponse.body.receiptUrl).toContain("mock.s3.test");
    expect(
      (await prisma.donation.findUnique({ where: { id: donationId } }))?.status,
    ).toBe("SUCCESS");

    const duplicateRes = await request(app)
      .post("/api/webhooks/simulate-success")
      .send({ donationId });
    expect(duplicateRes.status).toBe(200);
    expect(
      await prisma.provenanceEvent.count({
        where: {
          entityId: donationId,
          eventType: ProvenanceEventType.DONATION_SUCCESS,
        },
      }),
    ).toBe(1);
    expect(
      await prisma.attestation.count({
        where: {
          donationId,
          disbursementId: null,
          type: "RECEIPT",
        },
      }),
    ).toBe(1);

    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { raisedAmount: true },
    });
    expect(Number(campaign?.raisedAmount)).toBe(500);
  });

  it("does not persist failed payment IDs and allows a captured retry for the same order", async () => {
    const donateRes = await request(app)
      .post("/api/donor/donate")
      .set("Authorization", `Bearer ${donorToken}`)
      .send({
        ngoId: ngoUserId,
        campaignId,
        amount: 125,
        paymentMethod: "UPI",
      });
    expect(donateRes.status).toBe(201);

    const failedBody = JSON.stringify({
      event: "payment.failed",
      payload: {
        payment: {
          entity: {
            id: `pay_failed_${donateRes.body.id}`,
            order_id: donateRes.body.razorpayOrderId,
            status: "failed",
          },
        },
      },
    });
    const failedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET!)
      .update(failedBody)
      .digest("hex");
    const failedWebhook = await request(app)
      .post("/api/webhooks/razorpay")
      .set("Content-Type", "application/json")
      .set("x-razorpay-signature", failedSignature)
      .send(failedBody);
    expect(failedWebhook.status).toBe(200);

    const duplicateFailedWebhook = await request(app)
      .post("/api/webhooks/razorpay")
      .set("Content-Type", "application/json")
      .set("x-razorpay-signature", failedSignature)
      .send(failedBody);
    expect(duplicateFailedWebhook.status).toBe(200);

    const failedDonation = await prisma.donation.findUnique({
      where: { id: donateRes.body.id },
    });
    expect(failedDonation?.status).toBe("FAILED");
    expect(failedDonation?.razorpayPaymentId).toBeNull();

    const failedAuditLogs = await prisma.auditLog.findMany({
      where: {
        entityType: "donation",
        entityId: donateRes.body.id,
        action: "PAYMENT_FAILED",
      },
    });
    expect(failedAuditLogs).toHaveLength(1);

    const failedReceipt = await request(app)
      .get(`/api/donor/receipt/${donateRes.body.id}`)
      .set("Authorization", "Bearer " + donorToken);
    expect(failedReceipt.status).toBe(400);
    expect(failedReceipt.body.status).toBe("FAILED");
    expect(
      (await prisma.donation.findUnique({
        where: { id: donateRes.body.id },
        select: { taxReceiptUrl: true },
      }))?.taxReceiptUrl,
    ).toBeNull();

    const capturedBody = JSON.stringify({
      event: "payment.captured",
      payload: {
        payment: {
          entity: {
            id: `pay_retry_${donateRes.body.id}`,
            order_id: donateRes.body.razorpayOrderId,
            amount: 12500,
            currency: "INR",
            status: "captured",
            captured: true,
          },
        },
      },
    });
    const capturedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET!)
      .update(capturedBody)
      .digest("hex");
    const capturedWebhook = await request(app)
      .post("/api/webhooks/razorpay")
      .set("Content-Type", "application/json")
      .set("x-razorpay-signature", capturedSignature)
      .send(capturedBody);

    expect(capturedWebhook.status).toBe(200);
    const donation = await prisma.donation.findUnique({
      where: { id: donateRes.body.id },
    });
    expect(donation?.status).toBe("SUCCESS");
    expect(donation?.razorpayPaymentId).toBe(`pay_retry_${donateRes.body.id}`);

    const lateFailureBody = JSON.stringify({
      event: "payment.failed",
      payload: {
        payment: {
          entity: {
            id: `pay_late_failure_${donateRes.body.id}`,
            order_id: donateRes.body.razorpayOrderId,
            status: "failed",
          },
        },
      },
    });
    const lateFailureSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET!)
      .update(lateFailureBody)
      .digest("hex");
    const lateFailureWebhook = await request(app)
      .post("/api/webhooks/razorpay")
      .set("Content-Type", "application/json")
      .set("x-razorpay-signature", lateFailureSignature)
      .send(lateFailureBody);
    expect(lateFailureWebhook.status).toBe(200);

    const afterLateFailure = await prisma.donation.findUnique({
      where: { id: donateRes.body.id },
    });
    expect(afterLateFailure?.status).toBe("SUCCESS");
    expect(afterLateFailure?.razorpayPaymentId).toBe(`pay_retry_${donateRes.body.id}`);

    const failureAuditLogsAfterLateFailure = await prisma.auditLog.findMany({
      where: {
        entityType: "donation",
        entityId: donateRes.body.id,
        action: "PAYMENT_FAILED",
      },
    });
    expect(failureAuditLogsAfterLateFailure).toHaveLength(1);
  });

  it("requires KYC only above ₹10,000 and rejects before creating a donation", async () => {
    const belowThresholdDonation = await request(app)
      .post("/api/donor/donate")
      .set("Authorization", `Bearer ${donorToken}`)
      .send({
        ngoId: ngoUserId,
        campaignId,
        amount: 9999,
        paymentMethod: "UPI",
      });
    expect(belowThresholdDonation.status).toBe(201);

    const thresholdDonation = await request(app)
      .post("/api/donor/donate")
      .set("Authorization", `Bearer ${donorToken}`)
      .send({
        ngoId: ngoUserId,
        campaignId,
        amount: 10000,
        paymentMethod: "UPI",
      });
    expect(thresholdDonation.status).toBe(201);

    const donationsBeforeKycRequiredAttempt = await prisma.donation.count({
      where: { donorId: donorUserId },
    });
    const kycRequired = await request(app)
      .post("/api/donor/donate")
      .set("Authorization", `Bearer ${donorToken}`)
      .send({
        ngoId: ngoUserId,
        campaignId,
        amount: 10001,
        paymentMethod: "UPI",
      });

    expect(kycRequired.status).toBe(402);
    expect(kycRequired.body).toEqual({ requiresKyc: true });
    expect(
      await prisma.donation.count({ where: { donorId: donorUserId } }),
    ).toBe(donationsBeforeKycRequiredAttempt);

    const stringAmountKycRequired = await request(app)
      .post("/api/donor/donate")
      .set("Authorization", `Bearer ${donorToken}`)
      .send({
        ngoId: ngoUserId,
        campaignId,
        amount: "10001",
        paymentMethod: "UPI",
      });
    expect(stringAmountKycRequired.status).toBe(402);
    expect(stringAmountKycRequired.body).toEqual({ requiresKyc: true });
    expect(
      await prisma.donation.count({ where: { donorId: donorUserId } }),
    ).toBe(donationsBeforeKycRequiredAttempt);
  });

  it("verifies Checkout evidence server-side and treats repeated verification as a no-op", async () => {
    const donateRes = await request(app)
      .post("/api/donor/donate")
      .set("Authorization", `Bearer ${donorToken}`)
      .send({
        ngoId: ngoUserId,
        campaignId,
        amount: 40,
        paymentMethod: "UPI",
      });
    expect(donateRes.status).toBe(201);

    const paymentId = `pay_checkout_${donateRes.body.id}`;
    const signature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET!)
      .update(`${donateRes.body.razorpayOrderId}|${paymentId}`)
      .digest("hex");
    const verificationRequest = () =>
      request(app)
        .post(`/api/donor/donations/${donateRes.body.id}/verify-payment`)
        .set("Authorization", `Bearer ${donorToken}`)
        .send({
          razorpay_order_id: donateRes.body.razorpayOrderId,
          razorpay_payment_id: paymentId,
          razorpay_signature: signature,
        });

    const firstVerification = await verificationRequest();
    const duplicateVerification = await verificationRequest();
    expect(firstVerification.status).toBe(200);
    expect(firstVerification.body.status).toBe("SUCCESS");
    expect(duplicateVerification.status).toBe(200);

    const donation = await prisma.donation.findUnique({
      where: { id: donateRes.body.id },
    });
    expect(donation?.status).toBe("SUCCESS");
    expect(donation?.razorpayPaymentId).toBe(paymentId);

    const dashboard = await request(app)
      .get("/api/donor/dashboard")
      .set("Authorization", `Bearer ${donorToken}`);
    const dashboardDonation = dashboard.body.donations.find(
      (item: { id: string }) => item.id === donateRes.body.id,
    );
    expect(dashboardDonation?.status).toBe("SUCCESS");
  });

  it("routes a signed captured-payment webhook through the same success transition", async () => {
    const donateRes = await request(app)
      .post("/api/donor/donate")
      .set("Authorization", `Bearer ${donorToken}`)
      .send({
        ngoId: ngoUserId,
        campaignId,
        amount: 60,
        paymentMethod: "UPI",
      });
    expect(donateRes.status).toBe(201);

    const body = JSON.stringify({
      event: "payment.captured",
      payload: {
        payment: {
          entity: {
            id: `pay_webhook_${donateRes.body.id}`,
            order_id: donateRes.body.razorpayOrderId,
            amount: 6000,
            currency: "INR",
            status: "captured",
            captured: true,
          },
        },
      },
    });
    const signature = crypto
      .createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET!)
      .update(body)
      .digest("hex");

    const firstWebhook = await request(app)
      .post("/api/webhooks/razorpay")
      .set("Content-Type", "application/json")
      .set("x-razorpay-signature", signature)
      .send(body);
    const duplicateWebhook = await request(app)
      .post("/api/webhooks/razorpay")
      .set("Content-Type", "application/json")
      .set("x-razorpay-signature", signature)
      .send(body);

    expect(firstWebhook.status).toBe(200);
    expect(duplicateWebhook.status).toBe(200);
    const donation = await prisma.donation.findUnique({
      where: { id: donateRes.body.id },
    });
    expect(donation?.status).toBe("SUCCESS");
    expect(donation?.razorpayPaymentId).toBe(`pay_webhook_${donateRes.body.id}`);
  });
});
