import express from 'express';
import { Request, Response, NextFunction, Router } from 'express';
import { prisma } from '../../db/prisma';
import crypto from 'crypto';
import { writeAuditLog } from '../../services/auditLogService';
import { AuditActorType } from '../../../generated/prisma/enums';
import { generateAndStoreReceipt } from '../../services/receiptService';
import { notifyAdmin } from '../../services/emailService';
import { getBlockchainService } from '../../services/blockchainInstance';

interface RawRequest extends Request {
  rawBody: Buffer;
}

const RAZORPAY_WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET || 'your_webhook_secret_change_in_production';

/**
 * Razorpay webhook handler for payment events
 * Preserve raw body for signature verification
 */
export const razorpayWebhookHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const rawReq = req as RawRequest;
    const razorpaySignature = req.headers['x-razorpay-signature'] as string;
    const rawBody = rawReq.rawBody; // Set by express.raw() middleware

    if (!razorpaySignature || !rawBody) {
      // Log webhook tamper attempt
      void writeAuditLog({
        actorType: AuditActorType.WEBHOOK,
        entityType: 'webhook',
        action: 'WEBHOOK_TAMPER_ATTEMPT',
        metadata: {
          reason: 'Missing signature or raw body',
          headers: req.headers,
        },
        ipAddress: req.ip,
      });

      return res.status(401).json({ error: 'Invalid webhook signature' });
    }

    // Verify Razorpay webhook signature
    const hmac = crypto.createHmac('sha256', RAZORPAY_WEBHOOK_SECRET);
    hmac.update(rawBody);
    const generatedSignature = hmac.digest('hex');

    if (generatedSignature !== razorpaySignature) {
      // Log webhook tamper attempt
      void writeAuditLog({
        actorType: AuditActorType.WEBHOOK,
        entityType: 'webhook',
        action: 'WEBHOOK_TAMPER_ATTEMPT',
        metadata: {
          reason: 'Signature mismatch',
          providedSignature: razorpaySignature,
          generatedSignature,
        },
        ipAddress: req.ip,
      });

      return res.status(401).json({ error: 'Invalid webhook signature' });
    }

    const event = JSON.parse(rawBody.toString());

    // Handle payment.captured event
    if (event.event === 'payment.captured') {
      const paymentEntity = event.payload.payment.entity;
      const razorpayOrderId = paymentEntity.order_id;
      const razorpayPaymentId = paymentEntity.id;

      // Find donation by razorpayOrderId
      const donation = await prisma.donation.findFirst({
        where: { razorpayOrderId },
        include: {
          ngo: true,
          donor: true,
        },
      });

      if (!donation) {
        // Log warning - donation not found for this order
        void writeAuditLog({
          actorType: AuditActorType.WEBHOOK,
          entityType: 'webhook',
          action: 'WEBHOOK_DONATION_NOT_FOUND',
          metadata: {
            razorpayOrderId,
            razorpayPaymentId,
          },
          ipAddress: req.ip,
        });

        // Still return 200 to Razorpay to prevent retries
        return res.status(200).json({ received: true });
      }

      // Check if payment already processed (idempotency)
      if (donation.razorpayPaymentId) {
        // Log duplicate webhook
        void writeAuditLog({
          actorType: AuditActorType.WEBHOOK,
          entityType: 'donation',
          entityId: donation.id,
          action: 'WEBHOOK_DUPLICATE',
          metadata: {
            razorpayOrderId,
            razorpayPaymentId,
            existingPaymentId: donation.razorpayPaymentId,
          },
          ipAddress: req.ip,
        });

        return res.status(200).json({ received: true });
      }

      // Update donation status to SUCCESS and store payment ID
      await prisma.donation.update({
        where: { id: donation.id },
        data: {
          status: 'SUCCESS',
          razorpayPaymentId,
        },
      });

      // AML flag: if amount_inr > 100000, inject AML_FLAG_RAISED audit entry
      if (donation.amount.gt(100000)) {
        void writeAuditLog({
          actorType: AuditActorType.SYSTEM,
          entityType: 'donation',
          entityId: donation.id,
          action: 'AML_FLAG_RAISED',
          metadata: {
            amount: donation.amount,
            threshold: 100000,
          },
          ipAddress: req.ip,
        });

        // Notify admin about AML flag
        void notifyAdmin(
          'AML Flag Raised',
          `Donation of INR ${donation.amount} by donor ${donation.donorId} exceeded AML threshold.`
        );
      }

      // Audit log for successful payment
      void writeAuditLog({
        actorType: AuditActorType.WEBHOOK,
        actorId: undefined, // Webhook is system-generated
        entityType: 'donation',
        entityId: donation.id,
        action: 'PAYMENT_SUCCESS',
        metadata: {
          razorpayOrderId,
          razorpayPaymentId,
          amount: donation.amount,
          ngoId: donation.ngoId,
          donorId: donation.donorId,
        },
        ipAddress: req.ip,
      });

      // Queue 80G receipt generation (async, non-blocking)
      // This will generate the receipt and upload to storage
      void generateAndStoreReceipt(donation.id)
        .then(() => {
          // Log receipt generation started
          void writeAuditLog({
            actorType: AuditActorType.SYSTEM,
            entityType: 'donation',
            entityId: donation.id,
            action: 'RECEIPT_GENERATION_STARTED',
            metadata: {
              donationId: donation.id,
            },
            ipAddress: req.ip,
          });
        })
        .catch((error: unknown) => {
          // Log receipt generation failure
          void writeAuditLog({
            actorType: AuditActorType.SYSTEM,
            entityType: 'donation',
            entityId: donation.id,
            action: 'RECEIPT_GENERATION_FAILED',
            metadata: {
              donationId: donation.id,
              error: error instanceof Error ? error.message : 'Unknown error',
            },
            ipAddress: req.ip,
          });
        });

      // BLOCKCHAIN INTEGRATION: Record donation on-chain after successful payment
      try {
        const blockchainService = await getBlockchainService();

        // Prepare donation data for on-chain recording
        const donationData = {
          donationId: donation.id, // UUID from Postgres
          donorUserId: donation.donorId, // Raw user ID (will be hashed by service)
          ngoId: donation.ngoId,
          campaignId: donation.campaignId,
          amountInr: donation.amount, // Amount in INR
          currency: 'INR',
          timestamp: new Date() // Current timestamp
        };

        // Record on-chain (idempotent - safe to call multiple times)
        const blockchainResult = await blockchainService.recordDonation(donationData);

        if (blockchainResult.success) {
          // Store transaction hash in donation record
          await prisma.donation.update({
            where: { id: donation.id },
            data: { solanaTxHash: blockchainResult.txHash }
          });

          // Log success to audit trail
          await writeAuditLog({
            actorType: AuditActorType.SYSTEM,
            entityType: 'donation',
            entityId: donation.id,
            action: 'BLOCKCHAIN_RECORD_SUCCESS',
            metadata: {
              donationId: donation.id,
              transactionHash: blockchainResult.txHash
            },
            ipAddress: req.ip,
          });

          console.info(`Blockchain recording successful for donation ${donation.id}: ${blockchainResult.txHash}`);
        } else {
          // Handle recording failure
          console.error(`Blockchain recording failed for donation ${donation.id}: ${blockchainResult.error}`);

          // Add to retry queue for later processing
          await addToBlockchainRetryQueue({
            donationId: donation.id,
            error: blockchainResult.error,
            retryCount: 0
          });

          // Log failure to audit trail
          await writeAuditLog({
            actorType: AuditActorType.SYSTEM,
            entityType: 'donation',
            entityId: donation.id,
            action: 'BLOCKCHAIN_RECORD_FAILED',
            metadata: {
              donationId: donation.id,
              error: blockchainResult.error
            },
            ipAddress: req.ip,
          });
        }
      } catch (error) {
        // Handle service initialization or other unexpected errors
        console.error(`Blockchain service error for donation ${donation.id}:`, error);

        // Add to retry queue
        await addToBlockchainRetryQueue({
          donationId: donation.id,
          error: error.message,
          retryCount: 0
        });

        await writeAuditLog({
          actorType: AuditActorType.SYSTEM,
          entityType: 'donation',
          entityId: donation.id,
          action: 'BLOCKCHAIN_SERVICE_ERROR',
          metadata: {
            donationId: donation.id,
            error: error.message
          },
          ipAddress: req.ip,
        });
      }

      return res.status(200).json({ received: true });
    }

    // Handle payment.failed event
    if (event.event === 'payment.failed') {
      const paymentEntity = event.payload.payment.entity;
      const razorpayOrderId = paymentEntity.order_id;
      const razorpayPaymentId = paymentEntity.id;

      // Find donation by razorpayOrderId
      const donation = await prisma.donation.findFirst({
        where: { razorpayOrderId },
      });

      if (donation) {
        // Update donation status to FAILED
        await prisma.donation.update({
          where: { id: donation.id },
          data: {
            status: 'FAILED',
            razorpayPaymentId,
          },
        });

        // Audit log for failed payment
        void writeAuditLog({
          actorType: AuditActorType.WEBHOOK,
          entityType: 'donation',
          entityId: donation.id,
          action: 'PAYMENT_FAILED',
          metadata: {
            razorpayOrderId,
            razorpayPaymentId,
            amount: donation.amount,
          },
          ipAddress: req.ip,
        });
      }

      return res.status(200).json({ received: true });
    }

    // For other events, just acknowledge receipt
    return res.status(200).json({ received: true });
  } catch (err) {
    next(err);
  }
};

/**
 * Razorpay webhook handler for refund events
 */
export const razorpayRefundWebhookHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const rawReq = req as RawRequest;
    const razorpaySignature = req.headers['x-razorpay-signature'] as string;
    const rawBody = rawReq.rawBody; // Set by express.raw() middleware

    if (!razorpaySignature || !rawBody) {
      // Log webhook tamper attempt
      void writeAuditLog({
        actorType: AuditActorType.WEBHOOK,
        entityType: 'webhook_refund',
        action: 'WEBHOOK_TAMPER_ATTEMPT',
        metadata: {
          reason: 'Missing signature or raw body',
          headers: req.headers,
        },
        ipAddress: req.ip,
      });

      return res.status(401).json({ error: 'Invalid webhook signature' });
    }

    // Verify Razorpay webhook signature
    const hmac = crypto.createHmac('sha256', RAZORPAY_WEBHOOK_SECRET);
    hmac.update(rawBody);
    const generatedSignature = hmac.digest('hex');

    if (generatedSignature !== razorpaySignature) {
      // Log webhook tamper attempt
      void writeAuditLog({
        actorType: AuditActorType.WEBHOOK,
        entityType: 'webhook_refund',
        action: 'WEBHOOK_TAMPER_ATTEMPT',
        metadata: {
          reason: 'Signature mismatch',
          providedSignature: razorpaySignature,
          generatedSignature,
        },
        ipAddress: req.ip,
      });

      return res.status(401).json({ error: 'Invalid webhook signature' });
    }

    const event = JSON.parse(rawBody.toString());

    // Handle refund.processed event
    if (event.event === 'refund.processed') {
      const refundEntity = event.payload.refund.entity;
      const razorpayPaymentId = refundEntity.payment_id;
      const refundId = refundEntity.id;
      const amount = refundEntity.amount; // Amount in paise

      // Find donation by razorpayPaymentId
      const donation = await prisma.donation.findFirst({
        where: { razorpayPaymentId },
      });

      if (donation) {
        // Update donation status to REFUNDED
        await prisma.donation.update({
          where: { id: donation.id },
          data: {
            status: 'REFUNDED',
          },
        });

        // Audit log for refund
        void writeAuditLog({
          actorType: AuditActorType.WEBHOOK,
          entityType: 'donation',
          entityId: donation.id,
          action: 'PAYMENT_REFUNDED',
          metadata: {
            razorpayPaymentId,
            refundId,
            amountRefunded: amount / 100, // Convert paise to INR
            originalAmount: donation.amount,
          },
          ipAddress: req.ip,
        });
      }

      return res.status(200).json({ received: true });
    }

    // For other events, just acknowledge receipt
    return res.status(200).json({ received: true });
  } catch (err) {
    next(err);
  }
};

// Helper function for retry queue
async function addToBlockchainRetryQueue(data: {
  donationId: string;
  error: string;
  retryCount: number;
}): Promise<void> {
  try {
    // Import Prisma client
    const { prisma } = require('../db/prisma');

    // Create or update retry queue entry
    await prisma.blockchainRetryQueue.upsert({
      where: { donationId: data.donationId },
      update: {
        error: data.error,
        retryCount: data.retryCount + 1,
        lastAttempt: new Date(),
        updatedAt: new Date()
      },
      create: {
        donationId: data.donationId,
        error: data.error,
        retryCount: data.retryCount + 1,
        lastAttempt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date()
      }
    });

    console.info(`Added donation ${data.donationId} to blockchain retry queue (attempt ${data.retryCount + 1})`);
  } catch (queueError) {
    console.error(`Failed to add to retry queue:`, queueError);
    // Don't fail the webhook if queue fails - the donation is already recorded in DB
  }
}

// Router setup
const razorpayRouter = Router();

// Configure express.raw middleware to preserve raw body for webhook verification
// This must be done before express.json() in the chain
razorpayRouter.use(express.raw({ type: '*/*' }));

razorpayRouter.post('/', razorpayWebhookHandler);
razorpayRouter.post('/refund', razorpayRefundWebhookHandler);

export default razorpayRouter;