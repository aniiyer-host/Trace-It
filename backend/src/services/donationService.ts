import crypto from 'crypto';
import { prisma } from '../db/prisma.js';
import { requireEnvironmentVariable } from '../utils/envValidator.js';
import {
  AuditActorType,
  AttestationType,
  AttestationStatus,
  DonationStatus,
} from '../../generated/prisma/enums.js';
import { writeAuditLog } from './auditLogService.js';
import { generateAndStoreReceipt } from './receiptService.js';
import { notifyAdmin } from './emailService.js';
import { getBlockchainService } from './blockchainInstance.js';
import { addToBlockchainRetryQueue } from './blockchainRetryQueue.js';

export interface CompleteDonationOptions {
  razorpayPaymentId?: string;
  razorpayOrderId?: string;
  ipAddress?: string;
  actorType?: AuditActorType;
}

/**
 * Shared service function to finalize a successful donation.
 * Transitions donation to SUCCESS, checks AML, records payment success audit,
 * initiates 80G receipt, records on Solana blockchain, and auto-creates RECEIPT attestation request.
 */
export const completeDonationSuccess = async (
  donationId: string,
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

  const paymentId =
    options?.razorpayPaymentId ||
    donation.razorpayPaymentId ||
    `pay_sim_${donation.id.replace(/-/g, '').substring(0, 14)}`;

  const updatedDonation = await prisma.donation.update({
    where: { id: donation.id },
    data: {
      status: DonationStatus.SUCCESS,
      razorpayPaymentId: paymentId,
    },
    include: {
      ngo: true,
      donor: true,
    },
  });

  // 1. Auto-create RECEIPT attestation for NGO action inbox
  try {
    await prisma.attestation.upsert({
      where: {
        donationId_type: {
          donationId: updatedDonation.id,
          type: AttestationType.RECEIPT,
        },
      },
      update: {},
      create: {
        donationId: updatedDonation.id,
        type: AttestationType.RECEIPT,
        status: AttestationStatus.PENDING,
        requestedBy: updatedDonation.donorId,
      },
    });
  } catch (attError) {
    console.error(`Failed to auto-create attestation for donation ${updatedDonation.id}:`, attError);
  }

  // 2. AML flag check: if amount > 100,000 INR
  if (Number(updatedDonation.amount) > 100000) {
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
    actorType: options?.actorType ?? (options?.razorpayPaymentId ? AuditActorType.WEBHOOK : AuditActorType.SYSTEM),
    actorId: undefined,
    entityType: 'donation',
    entityId: updatedDonation.id,
    action: 'PAYMENT_SUCCESS',
    metadata: {
      razorpayOrderId: options?.razorpayOrderId || updatedDonation.razorpayOrderId,
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

  // 5. Record on Solana Blockchain (only in non-test / when enabled)
  if (process.env.NODE_ENV !== 'test' && !process.env.JEST_WORKER_ID) {
    try {
      const blockchainService = await getBlockchainService();
      const donationData = {
        donationId: updatedDonation.id,
        donorUserId: updatedDonation.donorId,
        ngoId: updatedDonation.ngoId,
        campaignId: updatedDonation.campaignId ?? '',
        amountInr: Number(updatedDonation.amount),
        currency: 'INR',
        timestamp: new Date(),
      };

      const blockchainResult = await blockchainService.recordDonation(donationData);

      if (blockchainResult.success) {
        await prisma.donation.update({
          where: { id: updatedDonation.id },
          data: { solanaTxHash: blockchainResult.txHash },
        });

        await writeAuditLog({
          actorType: AuditActorType.SYSTEM,
          entityType: 'donation',
          entityId: updatedDonation.id,
          action: 'BLOCKCHAIN_RECORD_SUCCESS',
          metadata: {
            donationId: updatedDonation.id,
            transactionHash: blockchainResult.txHash,
          },
          ipAddress: options?.ipAddress,
        });

        console.info(`Blockchain recording successful for donation ${updatedDonation.id}: ${blockchainResult.txHash}`);
      } else {
        console.error(`Blockchain recording failed for donation ${updatedDonation.id}: ${blockchainResult.error}`);

        await addToBlockchainRetryQueue({
          donationId: updatedDonation.id,
          error: blockchainResult.error ?? 'Unknown error',
          retryCount: 0,
          operationType: 'RECORD_DONATION',
        });

        await writeAuditLog({
          actorType: AuditActorType.SYSTEM,
          entityType: 'donation',
          entityId: updatedDonation.id,
          action: 'BLOCKCHAIN_RECORD_FAILED',
          metadata: {
            donationId: updatedDonation.id,
            error: blockchainResult.error,
          },
          ipAddress: options?.ipAddress,
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`Blockchain service error for donation ${updatedDonation.id}:`, error);

      await addToBlockchainRetryQueue({
        donationId: updatedDonation.id,
        error: errorMessage,
        retryCount: 0,
        operationType: 'RECORD_DONATION',
      });

      await writeAuditLog({
        actorType: AuditActorType.SYSTEM,
        entityType: 'donation',
        entityId: updatedDonation.id,
        action: 'BLOCKCHAIN_SERVICE_ERROR',
        metadata: {
          donationId: updatedDonation.id,
          error: errorMessage,
        },
        ipAddress: options?.ipAddress,
      });
    }
  }

  return updatedDonation;
};

/**
 * Create a Razorpay order for the given amount in INR.
 * @param amountInr - Amount in Indian Rupees (integer in paise? Actually Razorpay expects amount in paise, but we'll convert)
 * @returns Order object from Razorpay
 */
export const createRazorpayOrder = async (amountInr: number) => {
  // Razorpay expects amount in the smallest currency unit (paise for INR)
  const amountInPaise = amountInr * 100;

  const options = {
    amount: amountInPaise,
    currency: 'INR',
    receipt: `receipt_${crypto.randomBytes(10).toString('hex')}`,
    payment_capture: 1, // auto capture
  };

  // In a real implementation, we would make an HTTP request to Razorpay API
  // For now, we'll simulate the response
  // TODO: Replace with actual Razorpay SDK or HTTP call
  const mockOrder = {
    id: `order_${crypto.randomBytes(10).toString('hex')}`,
    entity: 'order',
    amount: amountInPaise,
    amount_paid: 0,
    amount_due: amountInPaise,
    currency: 'INR',
    receipt: options.receipt,
    offer_id: null,
    status: 'created',
    attempts: 0,
    notes: [],
    created_at: Math.floor(Date.now() / 1000),
  };

  return mockOrder;
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
  return generatedSignature === signature;
};

