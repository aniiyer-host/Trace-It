import express from 'express';
import { Request, Response, NextFunction, Router } from 'express';
import { prisma } from '../../db/prisma.js';
import crypto from 'crypto';
import { writeAuditLog } from '../../services/auditLogService.js';
import { AuditActorType, DonationStatus } from '../../../generated/prisma/enums.js';
import {
  completeDonationSuccess,
  DonationPaymentError,
} from '../../services/donationService.js';

interface RawRequest extends Request {
  rawBody: Buffer;
}

const RAZORPAY_WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET;

if (!RAZORPAY_WEBHOOK_SECRET && process.env.NODE_ENV === 'production') {
  throw new Error('RAZORPAY_WEBHOOK_SECRET is required in production');
}

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

    //debug line starts
    const RAZORPAY_WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!RAZORPAY_WEBHOOK_SECRET) {
      throw new Error("RAZORPAY_WEBHOOK_SECRET is not configured");
    }
    //debug line ends

    // Verify Razorpay webhook signature
    const hmac = crypto.createHmac('sha256', RAZORPAY_WEBHOOK_SECRET);
    hmac.update(rawBody);
    const generatedSignature = hmac.digest('hex');

    if (
      !/^[a-f\d]{64}$/i.test(razorpaySignature) ||
      !crypto.timingSafeEqual(
        Buffer.from(generatedSignature, 'hex'),
        Buffer.from(razorpaySignature, 'hex'),
      )
    ) {
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

      if (
        typeof razorpayOrderId !== 'string' ||
        typeof razorpayPaymentId !== 'string' ||
        !Number.isSafeInteger(paymentEntity.amount) ||
        paymentEntity.currency !== 'INR' ||
        paymentEntity.status !== 'captured' ||
        paymentEntity.captured !== true
      ) {
        return res.status(400).json({ error: 'Invalid captured payment evidence' });
      }

      const donation = await prisma.donation.findUnique({
        where: { razorpayOrderId },
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

      await completeDonationSuccess(
        donation.id,
        {
          source: 'webhook',
          razorpayOrderId,
          razorpayPaymentId,
          amountPaise: paymentEntity.amount,
          currency: paymentEntity.currency,
        },
        { ipAddress: req.ip, actorType: AuditActorType.WEBHOOK },
      );

      return res.status(200).json({ received: true });
    }

    // Handle payment.failed event
    if (event.event === 'payment.failed') {
      const paymentEntity = event.payload.payment.entity;
      const razorpayOrderId = paymentEntity.order_id;
      const razorpayPaymentId = paymentEntity.id;
      if (
        typeof razorpayOrderId !== 'string' ||
        typeof razorpayPaymentId !== 'string' ||
        paymentEntity.status !== 'failed'
      ) {
        return res.status(400).json({ error: 'Invalid failed payment evidence' });
      }

      // Find donation by razorpayOrderId
      const donation = await prisma.donation.findUnique({
        where: { razorpayOrderId },
      });

      if (donation && donation.status === DonationStatus.INITIATED) {
        const failed = await prisma.donation.updateMany({
          where: {
            id: donation.id,
            status: DonationStatus.INITIATED,
            razorpayPaymentId: null,
          },
          data: { status: DonationStatus.FAILED },
        });

        if (failed.count === 1) {
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
      }

      return res.status(200).json({ received: true });
    }

    // For other events, just acknowledge receipt
    return res.status(200).json({ received: true });
  } catch (err) {
    if (err instanceof DonationPaymentError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
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

    //debug line starts
    const RAZORPAY_WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!RAZORPAY_WEBHOOK_SECRET) {
      throw new Error("RAZORPAY_WEBHOOK_SECRET is not configured");
    }
    //debug line ends
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

// Dev-only synthetic payment routed through the canonical donation success service.
export const simulateSuccessHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({ error: 'Simulation is disabled in production' });
    }

    let donationId: string | undefined;
    if (typeof req.body === 'string' || Buffer.isBuffer(req.body)) {
      try {
        const parsed = JSON.parse(req.body.toString());
        donationId = parsed.donationId;
      } catch {
        donationId = undefined;
      }
    } else if (req.body && typeof req.body === 'object') {
      donationId = req.body.donationId;
    }

    if (!donationId) {
      return res.status(400).json({ error: 'donationId is required' });
    }

    const donation = await completeDonationSuccess(
      donationId,
      { source: 'simulation' },
      { ipAddress: req.ip, actorType: AuditActorType.SYSTEM },
    );

    return res.status(200).json({
      success: true,
      message: 'Donation transitioned to SUCCESS',
      donation: {
        id: donation.id,
        status: donation.status,
        razorpayPaymentId: donation.razorpayPaymentId,
      },
    });
  } catch (err) {
    if (err instanceof DonationPaymentError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    next(err);
  }
};

// Router setup
const razorpayRouter = Router();

// Configure express.raw middleware to preserve raw body for webhook verification
// This must be done before express.json() in the chain
//razorpayRouter.use(express.raw({ type: '*/*' }));

razorpayRouter.post('/', razorpayWebhookHandler);
razorpayRouter.post('/refund', razorpayRefundWebhookHandler);
razorpayRouter.post('/simulate-success', simulateSuccessHandler);

export default razorpayRouter;