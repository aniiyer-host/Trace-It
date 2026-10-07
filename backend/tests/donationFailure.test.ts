import request from "supertest";
import app from "../src/index.js";
import { prisma } from "../src/db/prisma.js";
import {
  getRazorpayClient,
} from "../src/services/donationService.js";
import jwt from "jsonwebtoken";
import crypto from "node:crypto";
import { DonationStatus, UserRole } from "../generated/prisma/enums.js";

const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || "access_secret";

describe("Authenticated Razorpay payment failure reporting", () => {
  let donorId: string;
  let donorToken: string;
  let otherDonorId: string;
  let otherDonorToken: string;
  let ngoId: string;
  const donationIds: string[] = [];
  const paymentFetch = jest.spyOn(getRazorpayClient().payments, "fetch");

  beforeAll(async () => {
    const donor = await prisma.profile.create({
      data: {
        email: `payment-failure-donor-${crypto.randomUUID()}@example.com`,
        role: UserRole.DONOR,
      },
    });
    donorId = donor.id;
    donorToken = jwt.sign({ userId: donorId }, JWT_ACCESS_SECRET, {
      expiresIn: "1h",
    });

    const otherDonor = await prisma.profile.create({
      data: {
        email: `payment-failure-other-${crypto.randomUUID()}@example.com`,
        role: UserRole.DONOR,
      },
    });
    otherDonorId = otherDonor.id;
    otherDonorToken = jwt.sign({ userId: otherDonorId }, JWT_ACCESS_SECRET, {
      expiresIn: "1h",
    });

    const ngo = await prisma.profile.create({
      data: {
        email: `payment-failure-ngo-${crypto.randomUUID()}@example.com`,
        role: UserRole.CHARITY,
      },
    });
    ngoId = ngo.id;
  });

  afterAll(async () => {
    paymentFetch.mockRestore();
    await prisma.auditLog.deleteMany({
      where: { entityId: { in: donationIds } },
    });
    await prisma.donation.deleteMany({ where: { id: { in: donationIds } } });
    await prisma.profile.deleteMany({
      where: { id: { in: [donorId, otherDonorId, ngoId] } },
    });
  });

  beforeEach(() => {
    paymentFetch.mockClear();
    paymentFetch.mockResolvedValue({
      id: "pay_placeholder",
      order_id: "order_placeholder",
      status: "failed",
    } as never);
  });

  const createDonation = async (
    status: DonationStatus = DonationStatus.INITIATED,
    paymentId: string | null = null,
  ) => {
    const id = crypto.randomUUID();
    const donation = await prisma.donation.create({
      data: {
        id,
        donorId,
        ngoId,
        amount: 125,
        currencyCode: "INR",
        paymentMethod: "UPI",
        status,
        razorpayOrderId: `order_${id}`,
        razorpayPaymentId: paymentId,
      },
    });
    donationIds.push(donation.id);
    return donation;
  };

  const reportFailure = (
    donationId: string,
    donorAuth = donorToken,
    overrides: Record<string, unknown> = {},
  ) =>
    request(app)
      .post(`/api/donor/donations/${donationId}/report-payment-failure`)
      .set("Authorization", `Bearer ${donorAuth}`)
      .send({
        razorpay_order_id: `order_${donationId}`,
        razorpay_payment_id: `pay_${donationId}`,
        ...overrides,
      });

  const setFailedPayment = (
    donationId: string,
    overrides: Record<string, unknown> = {},
  ) => {
    paymentFetch.mockResolvedValue({
      id: `pay_${donationId}`,
      order_id: `order_${donationId}`,
      status: "failed",
      ...overrides,
    } as never);
  };

  const getFailureAuditCount = (donationId: string) =>
    prisma.auditLog.count({
      where: {
        entityType: "donation",
        entityId: donationId,
        action: "PAYMENT_FAILED",
      },
    });

  it("persists a verified explicit failure and audits it once", async () => {
    const donation = await createDonation();
    setFailedPayment(donation.id);

    const response = await reportFailure(donation.id);

    expect(response.status).toBe(200);
    expect(response.body.status).toBe("FAILED");
    expect(paymentFetch).toHaveBeenCalledWith(`pay_${donation.id}`);
    expect(
      (await prisma.donation.findUnique({ where: { id: donation.id } }))
        ?.status,
    ).toBe(DonationStatus.FAILED);
    expect(await getFailureAuditCount(donation.id)).toBe(1);
  });

  it("treats duplicate failure reports idempotently", async () => {
    const donation = await createDonation();
    setFailedPayment(donation.id);

    expect((await reportFailure(donation.id)).status).toBe(200);
    expect((await reportFailure(donation.id)).status).toBe(200);
    expect(await getFailureAuditCount(donation.id)).toBe(1);
  });

  it("rejects another donor without changing the donation", async () => {
    const donation = await createDonation();
    setFailedPayment(donation.id);

    const response = await reportFailure(
      donation.id,
      otherDonorToken,
    );

    expect(response.status).toBe(404);
    expect(paymentFetch).not.toHaveBeenCalled();
    expect(
      (await prisma.donation.findUnique({ where: { id: donation.id } }))
        ?.status,
    ).toBe(DonationStatus.INITIATED);
    expect(await getFailureAuditCount(donation.id)).toBe(0);
  });

  it.each([
    ["payment ID mismatch", { id: "pay_wrong" }, undefined, 400],
    ["payment order mismatch", { order_id: "order_wrong" }, undefined, 400],
    ["captured payment", { status: "captured" }, undefined, 400],
    ["malformed payment", { status: undefined }, undefined, 400],
    ["request order mismatch", {}, { razorpay_order_id: "order_wrong" }, 400],
    ["malformed request", {}, { razorpay_payment_id: "" }, 400],
  ])("rejects %s without changing donation state", async (_case, paymentOverrides, requestOverrides, expectedStatus) => {
    const donation = await createDonation();
    setFailedPayment(donation.id, paymentOverrides as Record<string, unknown>);

    const response = await reportFailure(
      donation.id,
      donorToken,
      requestOverrides as Record<string, unknown> | undefined,
    );

    expect(response.status).toBe(expectedStatus);
    expect(
      (await prisma.donation.findUnique({ where: { id: donation.id } }))
        ?.status,
    ).toBe(DonationStatus.INITIATED);
    expect(await getFailureAuditCount(donation.id)).toBe(0);
  });

  it("never changes an already-successful donation to failed", async () => {
    const donation = await createDonation(DonationStatus.SUCCESS, "pay_success");
    setFailedPayment(donation.id);

    const response = await reportFailure(donation.id);

    expect(response.status).toBe(409);
    expect(paymentFetch).not.toHaveBeenCalled();
    expect(
      (await prisma.donation.findUnique({ where: { id: donation.id } }))
        ?.status,
    ).toBe(DonationStatus.SUCCESS);
    expect(await getFailureAuditCount(donation.id)).toBe(0);
  });

  it("does not let a racing failure overwrite verified success", async () => {
    const donation = await createDonation();
    setFailedPayment(donation.id);

    const [failureResponse] = await Promise.all([
      reportFailure(donation.id),
      prisma.donation.updateMany({
        where: {
          id: donation.id,
          razorpayOrderId: donation.razorpayOrderId,
          amount: donation.amount,
          currencyCode: donation.currencyCode,
          status: { in: [DonationStatus.INITIATED, DonationStatus.FAILED] },
          razorpayPaymentId: null,
        },
        data: {
          status: DonationStatus.SUCCESS,
          razorpayPaymentId: `pay_success_${donation.id}`,
        },
      }),
    ]);

    expect([200, 409]).toContain(failureResponse.status);
    const currentDonation = await prisma.donation.findUnique({
      where: { id: donation.id },
    });
    expect(currentDonation?.status).toBe(DonationStatus.SUCCESS);
    expect(currentDonation?.razorpayPaymentId).toBe(`pay_success_${donation.id}`);
  });
});
