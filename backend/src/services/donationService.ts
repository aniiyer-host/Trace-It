import crypto from 'crypto';
import { prisma } from '../db/prisma.js';
import { requireEnvironmentVariable } from '../utils/envValidator.js';
import {
  AttestationStatus,
  AttestationType,
  AuditActorType,
  CampaignStatus,
  DonationStatus,
  ProvenanceEventType,
  RefundOutboxStatus,
} from '../../generated/prisma/enums.js';
import Razorpay from 'razorpay';
import { Prisma } from '../../generated/prisma/client.js';
import { writeAuditLog } from './auditLogService.js';
import { generateAndStoreReceipt } from './receiptService.js';
import { notifyAdmin } from './emailService.js';
import { appendProvenanceEvent } from './provenanceChainService.js';
import { MonetaryInputError, parseInrAmount } from '../utils/money.js';
import {
  enqueueDonationExcessRefundEmail,
  enqueueDonationSuccessEmail,
} from './email/notificationService.js';



export interface CompleteDonationOptions {
  ipAddress?: string;
  actorType?: AuditActorType;
}

export type DonationFailureResult = "ATTEMPT_FAILED" | "ALREADY_FAILED" | "NOT_ELIGIBLE";

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
 * Record that one Razorpay payment attempt failed without releasing the donation's
 * campaign reservation. An order can have another payment attempt, so payment
 * failure alone is not terminal evidence for the donation.
 */
export const failDonation = async (
  donationId: string,
  razorpayOrderId: string,
): Promise<DonationFailureResult> => {
  const donation = await prisma.donation.findUnique({
    where: { id: donationId },
    select: { status: true, razorpayOrderId: true },
  });

  if (
    donation?.status === DonationStatus.INITIATED &&
    donation.razorpayOrderId === razorpayOrderId
  ) {
    return "ATTEMPT_FAILED";
  }

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
      let lockedCampaign: {
        id: string;
        targetAmount: Prisma.Decimal;
        raisedAmount: Prisma.Decimal;
        allowOverfunding: boolean;
        status: CampaignStatus;
      } | undefined;

      // Always acquire locks in campaign -> donation order. This serializes
      // capacity decisions and avoids a donation/campaign lock inversion.
      if (donation.campaignId) {
        const rows = await tx.$queryRaw<Array<{
          id: string;
          targetAmount: Prisma.Decimal;
          raisedAmount: Prisma.Decimal;
          allowOverfunding: boolean;
          status: CampaignStatus;
        }>>`
          SELECT "id", "targetAmount", "raisedAmount", "allowOverfunding", "status"
          FROM "campaigns"
          WHERE "id" = ${donation.campaignId}
          FOR UPDATE
        `;
        lockedCampaign = rows[0];
        if (!lockedCampaign) throw new Error(`Associated campaign ${donation.campaignId} not found`);
      }

      const strictCap = lockedCampaign ? !lockedCampaign.allowOverfunding : false;
      const inactive = lockedCampaign ? lockedCampaign.status !== CampaignStatus.ACTIVE : false;
      const capacityExceeded = lockedCampaign && strictCap
        ? new Prisma.Decimal(lockedCampaign.targetAmount)
          .minus(lockedCampaign.raisedAmount)
          .lessThan(donation.amount)
        : false;
      // Inactive campaigns reject captured payments even when overfunding is on.
      const isOverflow = Boolean(inactive || capacityExceeded);
      const nextStatus = isOverflow
        ? DonationStatus.EXCESS_REFUND_PENDING
        : DonationStatus.SUCCESS;
      const claimed = await tx.donation.updateMany({
        where: {
          id: donation.id,
          razorpayOrderId: orderId,
          amount: donation.amount,
          currencyCode: donation.currencyCode,
          status: { in: [DonationStatus.INITIATED, DonationStatus.FAILED] },
          razorpayPaymentId: null,
        },
        data: { status: nextStatus, razorpayPaymentId: paymentId },
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
          return { donation: currentDonation, transitioned: false, outcome: 'IDEMPOTENT' as const };
        }

        throw new DonationPaymentError(
          'Donation is not eligible for this payment transition',
          409,
        );
      }

      if (isOverflow) {
        const reason = inactive ? 'CAMPAIGN_INACTIVE' : 'CAMPAIGN_TARGET_EXCEEDED';
        const compactId = donation.id.replace(/-/g, '');
        await tx.refundOutbox.create({
          data: {
            donationId: donation.id,
            razorpayPaymentId: paymentId,
            amountPaise: expectedAmountPaise,
            reason,
            receipt: `rfnd_${compactId}`,
            idempotencyKey: compactId,
            status: RefundOutboxStatus.PENDING,
          },
        });
        await appendProvenanceEvent(tx, {
          eventType: ProvenanceEventType.DONATION_OVERFLOW_REJECTED,
          entityType: 'Donation',
          entityId: currentDonation.id,
          amountInr: currentDonation.amount.toFixed(2),
          ngoId: currentDonation.ngoId,
          campaignId: currentDonation.campaignId,
          occurredAt,
        }, paymentId);
        await enqueueDonationExcessRefundEmail(tx, currentDonation, occurredAt);
        return { donation: currentDonation, transitioned: true, outcome: 'REFUND_QUEUED' as const };
      }

      if (lockedCampaign) {
        const newRaised = new Prisma.Decimal(lockedCampaign.raisedAmount).plus(donation.amount);
        await tx.campaign.update({
          where: { id: lockedCampaign.id },
          data: {
            raisedAmount: newRaised,
            status: strictCap && newRaised.greaterThanOrEqualTo(lockedCampaign.targetAmount)
              ? CampaignStatus.COMPLETED
              : lockedCampaign.status,
          },
        });
      }

      await appendProvenanceEvent(tx, {
        eventType: ProvenanceEventType.DONATION_SUCCESS,
        entityType: 'Donation',
        entityId: currentDonation.id,
        amountInr: currentDonation.amount.toFixed(2),
        ngoId: currentDonation.ngoId,
        campaignId: currentDonation.campaignId,
        occurredAt,
      }, paymentId);

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
          lastAttempt: new Date(0),
          error: 'Enqueued from payment success',
        },
      });

      await enqueueDonationSuccessEmail(tx, currentDonation, occurredAt);

      return { donation: currentDonation, transitioned: true, outcome: 'SUCCESS' as const };
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

  // Captured excess payments still go through AML monitoring.
  if (updatedDonation.amount.greaterThan(new Prisma.Decimal('100000'))) {
    void writeAuditLog({
      actorType: AuditActorType.SYSTEM,
      entityType: 'donation',
      entityId: updatedDonation.id,
      action: 'AML_FLAG_RAISED',
      metadata: {
        amount: updatedDonation.amount,
        threshold: 100000,
        ...(transition.outcome === 'REFUND_QUEUED' ? { outcome: 'REFUND_PENDING' } : {}),
      },
      ipAddress: options?.ipAddress,
    });

    void notifyAdmin(
      'AML Flag Raised',
      `Donation of INR ${updatedDonation.amount} by donor ${updatedDonation.donorId} exceeded AML threshold.`
    );
  }

  if (transition.outcome === 'REFUND_QUEUED') {
    void writeAuditLog({
      actorType: options?.actorType ?? (evidence.source === 'webhook' ? AuditActorType.WEBHOOK : AuditActorType.SYSTEM),
      entityType: 'donation',
      entityId: updatedDonation.id,
      action: 'DONATION_OVERFLOW_REJECTED',
      metadata: {
        razorpayOrderId: orderId,
        razorpayPaymentId: paymentId,
        amount: updatedDonation.amount,
      },
      ipAddress: options?.ipAddress,
    });
    return updatedDonation;
  }

  // Payment success side effects apply only to accepted contributions.
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
