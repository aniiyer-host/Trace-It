import crypto from 'crypto';
import { prisma } from '../db/prisma.js';
import { requireEnvironmentVariable } from '../utils/envValidator.js';
import {
  AttestationStatus,
  AttestationType,
  AuditActorType,
  DonationStatus,
  ProvenanceEventType,
} from '../../generated/prisma/enums.js';
import Razorpay from 'razorpay';
import { Prisma } from '../../generated/prisma/client.js';
import { writeAuditLog } from './auditLogService.js';
import { generateAndStoreReceipt } from './receiptService.js';
import { notifyAdmin } from './emailService.js';
import { appendProvenanceEvent } from './provenanceChainService.js';
import { MonetaryInputError, parseInrAmount } from '../utils/money.js';
import { enqueueDonationSuccessEmail } from './email/notificationService.js';



export interface CompleteDonationOptions {
  ipAddress?: string;
  actorType?: AuditActorType;
}

export interface FailDonationOptions {
  actorId?: string;
  ipAddress?: string;
  actorType?: AuditActorType;
}

export type DonationFailureResult = "FAILED" | "ALREADY_FAILED" | "NOT_ELIGIBLE";

export type DonationPaymentEvidence =
  | {
      source: 'checkout' | 'webhook';
      razorpayOrderId: string;
      razorpayPaymentId: string;
      amountPaise: number;
      currency: string;
    }
  | { source: 'simulation' };

export class DonationPaymentError extends Error {
  constructor(message: string, public readonly statusCode = 400) {
    super(message);
    this.name = 'DonationPaymentError';
  }
}

let razorpayClient: Razorpay | undefined;

export const getRazorpayClient = () => {
  if (!razorpayClient) {
    razorpayClient = new Razorpay({
      key_id: requireEnvironmentVariable('RAZORPAY_KEY_ID'),
      key_secret: requireEnvironmentVariable('RAZORPAY_KEY_SECRET'),
    });
  }

  return razorpayClient;
};

/**
 * Atomically mark an initiated donation as failed after verified Razorpay evidence.
 */
export const failDonation = async (
  donationId: string,
  razorpayOrderId: string,
  razorpayPaymentId: string,
  options?: FailDonationOptions,
): Promise<DonationFailureResult> => {
  const transition = await prisma.donation.updateMany({
    where: {
      id: donationId,
      razorpayOrderId,
      status: DonationStatus.INITIATED,
      razorpayPaymentId: null,
    },
    data: { status: DonationStatus.FAILED },
  });

  if (transition.count === 1) {
    const donation = await prisma.donation.findUnique({
      where: { id: donationId },
      select: { amount: true },
    });
    await writeAuditLog({
      actorType: options?.actorType ?? AuditActorType.SYSTEM,
      actorId: options?.actorId,
      entityType: "donation",
      entityId: donationId,
      action: "PAYMENT_FAILED",
      metadata: {
        razorpayOrderId,
        razorpayPaymentId,
        amount: donation?.amount,
      },
      ipAddress: options?.ipAddress,
    });
    return "FAILED";
  }

  const donation = await prisma.donation.findUnique({
    where: { id: donationId },
    select: { status: true, razorpayOrderId: true },
  });

  if (
    donation?.status === DonationStatus.FAILED &&
    donation.razorpayOrderId === razorpayOrderId
  ) {
    return "ALREADY_FAILED";
  }

  return "NOT_ELIGIBLE";
};

/**
 * Shared service function to finalize a successful donation.
 * Only the request that conditionally transitions an eligible donation runs success side effects.
 */
export const completeDonationSuccess = async (
  donationId: string,
  evidence: DonationPaymentEvidence,
  options?: CompleteDonationOptions
) => {
  const donation = await prisma.donation.findUnique({
    where: { id: donationId },
    include: {
      ngo: true,
      donor: true,
    },
  });

  if (!donation) {
    throw new Error(`Donation with ID ${donationId} not found`);
  }

  const orderId =
    evidence.source === 'simulation'
      ? donation.razorpayOrderId
      : evidence.razorpayOrderId;
  const paymentId =
    evidence.source === 'simulation'
      ? `pay_sim_${donation.id.replace(/-/g, '')}`
      : evidence.razorpayPaymentId;
  const expectedAmount = parseInrAmount(donation.amount.toFixed(2));
  const amountPaise =
    evidence.source === 'simulation'
      ? expectedAmount.amountPaise
      : evidence.amountPaise;
  const currency =
    evidence.source === 'simulation' ? donation.currencyCode : evidence.currency;
  const expectedAmountPaise = expectedAmount.amountPaise;

  if (
    !orderId ||
    (evidence.source !== 'simulation' &&
      (!paymentId ||
        !Number.isSafeInteger(evidence.amountPaise) ||
        evidence.currency !== 'INR')) ||
    currency !== donation.currencyCode ||
    donation.currencyCode !== 'INR' ||
    !Number.isSafeInteger(expectedAmountPaise) ||
    expectedAmountPaise !== amountPaise
  ) {
    throw new DonationPaymentError('Payment evidence does not match donation');
  }

  if (
    evidence.source !== 'simulation' &&
    evidence.razorpayOrderId !== donation.razorpayOrderId
  ) {
    throw new DonationPaymentError('Razorpay order does not match donation');
  }

  if (
    donation.razorpayPaymentId === paymentId &&
    donation.status !== DonationStatus.INITIATED &&
    donation.status !== DonationStatus.FAILED
  ) {
    return donation;
  }

  let transition;
  try {
    transition = await prisma.$transaction(async (tx) => {
      const occurredAt = new Date();
      const claimed = await tx.donation.updateMany({
        where: {
          id: donation.id,
          razorpayOrderId: orderId,
          amount: donation.amount,
          currencyCode: donation.currencyCode,
          status: { in: [DonationStatus.INITIATED, DonationStatus.FAILED] },
          razorpayPaymentId: null,
        },
        data: {
          status: DonationStatus.SUCCESS,
          razorpayPaymentId: paymentId,
        },
      });

      const currentDonation = await tx.donation.findUnique({
        where: { id: donation.id },
        include: { ngo: true, donor: true },
      });

      if (!currentDonation) {
        throw new Error(`Donation with ID ${donationId} not found`);
      }

      if (claimed.count === 0) {
        if (
          currentDonation.razorpayOrderId === orderId &&
          currentDonation.razorpayPaymentId === paymentId &&
          currentDonation.status !== DonationStatus.INITIATED &&
          currentDonation.status !== DonationStatus.FAILED
        ) {
          return { donation: currentDonation, transitioned: false };
        }

        throw new DonationPaymentError(
          'Donation is not eligible for this payment transition',
          409,
        );
      }

      const provenanceInput = {
        eventType: ProvenanceEventType.DONATION_SUCCESS,
        entityType: 'Donation',
        entityId: currentDonation.id,
        amountInr: currentDonation.amount.toFixed(2),
        ngoId: currentDonation.ngoId,
        campaignId: currentDonation.campaignId,
        occurredAt,
      };
      await appendProvenanceEvent(tx, provenanceInput, paymentId);

      const existingReceiptAttestation = await tx.attestation.findFirst({
        where: {
          donationId: currentDonation.id,
          disbursementId: null,
          type: AttestationType.RECEIPT,
        },
        select: { id: true },
      });
      if (!existingReceiptAttestation) {
        await tx.attestation.create({
          data: {
            donationId: currentDonation.id,
            type: AttestationType.RECEIPT,
            allocatedAmount: currentDonation.amount,
            requestedBy: currentDonation.donorId,
            status: AttestationStatus.PENDING,
          },
        });
      }

      await tx.blockchainRetryQueue.create({
        data: {
          donationId: currentDonation.id,
          operationType: 'RECORD_DONATION',
          retryCount: 0,
          lastAttempt: new Date(0), // Immediate eligibility
          error: 'Enqueued from payment success'
        },
      });

      await enqueueDonationSuccessEmail(tx, currentDonation, occurredAt);

      return { donation: currentDonation, transitioned: true };
    });
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'P2002'
    ) {
      throw new DonationPaymentError(
        'Razorpay payment is already associated with another donation',
        409,
      );
    }
    throw error;
  }

  if (!transition.transitioned) {
    return transition.donation;
  }

  const updatedDonation = transition.donation;

  // 2. AML flag check: if amount > 100,000 INR
  if (updatedDonation.amount.greaterThan(new Prisma.Decimal('100000'))) {
    void writeAuditLog({
      actorType: AuditActorType.SYSTEM,
      entityType: 'donation',
      entityId: updatedDonation.id,
      action: 'AML_FLAG_RAISED',
      metadata: {
        amount: updatedDonation.amount,
        threshold: 100000,
      },
      ipAddress: options?.ipAddress,
    });

    void notifyAdmin(
      'AML Flag Raised',
      `Donation of INR ${updatedDonation.amount} by donor ${updatedDonation.donorId} exceeded AML threshold.`
    );
  }

  // 3. Audit log for payment success
  void writeAuditLog({
    actorType:
      options?.actorType ??
      (evidence.source === 'webhook' ? AuditActorType.WEBHOOK : AuditActorType.SYSTEM),
    actorId: undefined,
    entityType: 'donation',
    entityId: updatedDonation.id,
    action: 'PAYMENT_SUCCESS',
    metadata: {
      razorpayOrderId: orderId,
      razorpayPaymentId: paymentId,
      amount: updatedDonation.amount,
      ngoId: updatedDonation.ngoId,
      donorId: updatedDonation.donorId,
    },
    ipAddress: options?.ipAddress,
  });

  // 4. Queue 80G tax receipt generation (async)
  void generateAndStoreReceipt(updatedDonation.id)
    .then(() => {
      void writeAuditLog({
        actorType: AuditActorType.SYSTEM,
        entityType: 'donation',
        entityId: updatedDonation.id,
        action: 'RECEIPT_GENERATION_STARTED',
        metadata: {
          donationId: updatedDonation.id,
        },
        ipAddress: options?.ipAddress,
      });
    })
    .catch((error: unknown) => {
      void writeAuditLog({
        actorType: AuditActorType.SYSTEM,
        entityType: 'donation',
        entityId: updatedDonation.id,
        action: 'RECEIPT_GENERATION_FAILED',
        metadata: {
          donationId: updatedDonation.id,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        ipAddress: options?.ipAddress,
      });
    });

  return updatedDonation;
};

/**
 * Create a Razorpay order for the given amount in INR.
 * @param amountInr - Amount in Indian Rupees (integer in paise? Actually Razorpay expects amount in paise, but we'll convert)
 * @returns Order object from Razorpay
 */
export const createRazorpayOrder = async (
  amountInr: unknown,
  donationId: string,
) => {
  // Razorpay expects amount in the smallest currency unit (paise for INR)
  let amountInPaise: number;
  try {
    amountInPaise = parseInrAmount(amountInr).amountPaise;
  } catch (error) {
    if (error instanceof MonetaryInputError) {
      throw new DonationPaymentError('Donation amount must be a valid INR amount');
    }
    throw error;
  }

  return getRazorpayClient().orders.create({
    amount: amountInPaise,
    currency: 'INR',
    receipt: `don_${donationId.replace(/-/g, '')}`,
    notes: { donationId },
    // payment: {
    //   capture: 'automatic',
    //   capture_options: {
    //     automatic_expiry_period: 12,
    //     manual_expiry_period: 12,
    //     refund_speed: 'normal',
    //   },
    // },
  });
};

/**
 * Verify Razorpay payment signature
 * @param orderId - Razorpay order ID
 * @param paymentId - Razorpay payment ID
 * @param signature - Razorpay signature
 * @returns True if signature is valid
 */
export const verifyRazorpaySignature = (orderId: string, paymentId: string, signature: string) => {
  const razorpayKeySecret = requireEnvironmentVariable('RAZORPAY_KEY_SECRET');
  const hmac = crypto.createHmac('sha256', razorpayKeySecret);
  hmac.update(`${orderId}|${paymentId}`);
  const generatedSignature = hmac.digest('hex');
  if (!/^[a-f\d]{64}$/i.test(signature)) {
    return false;
  }

  return crypto.timingSafeEqual(
    Buffer.from(generatedSignature, 'hex'),
    Buffer.from(signature, 'hex'),
  );
};
