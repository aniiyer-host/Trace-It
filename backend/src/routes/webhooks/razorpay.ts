import express from 'express';
import { Request, Response, NextFunction, Router } from 'express';
import { prisma } from '../../db/prisma';
import crypto from 'crypto';
import { writeAuditLog } from '../../services/auditLogService';
import { AuditActorType } from '../../../generated/prisma/enums';
import { generateAndStoreReceipt } from '../../services/receiptService';
import { notifyAdmin } from '../../services/emailService';

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

      // TODO(blockchain-team): after webhook success, call Donation Registry Program with donor_id_hash
      // This is a blockchain stub as mentioned in the implementation plan

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

// Router setup
const razorpayRouter = Router();

// Configure express.raw middleware to preserve raw body for webhook verification
// This must be done before express.json() in the chain
razorpayRouter.use(express.raw({ type: '*/*' }));

razorpayRouter.post('/', razorpayWebhookHandler);
razorpayRouter.post('/refund', razorpayRefundWebhookHandler);

export default razorpayRouter;