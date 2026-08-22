import { Request, Response, NextFunction, Router } from 'express';
import { prisma } from '../db/prisma.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';
import { kycCheckMiddleware } from '../middleware/kycCheckMiddleware.js';
import { UserRole, AuditActorType, PaymentMethod } from '../../generated/prisma/enums.js';
import Joi from 'joi';
import { createRazorpayOrder } from '../services/donationService.js';
import { writeAuditLog } from '../services/auditLogService.js';
import { generateAndStoreReceipt, getReceiptSignedUrl } from '../services/receiptService.js';
import { allocateDonation, markDisbursed, markDelivered } from '../services/statusService.js';
import { requireEnvironmentVariable } from '../utils/envValidator.js';

// ---------------------------------------------------------------------------
// GET /api/donor/dashboard
// ---------------------------------------------------------------------------

/**
 * Returns the authenticated donor's own donations with status.
 * requireRole('DONOR') applied at router level.
 */
export const getDonorDashboard = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const donorId = req.user?.id;
    if (!donorId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const donations = await prisma.donation.findMany({
      where: { donorId },
      select: {
        id: true,
        publicId: true,
        amount: true,
        currencyCode: true,
        paymentMethod: true,
        status: true,
        razorpayOrderId: true,
        razorpayPaymentId: true,
        taxReceiptUrl: true,
        taxReceiptEmailed: true,
        createdAt: true,
        project: {
          select: {
            id: true,
            title: true,
          },
        },
        ngo: {
          select: {
            id: true,
            organisationName: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ donations });
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// POST /api/donor/donate
// ---------------------------------------------------------------------------

const donateSchema = Joi.object({
  ngoId: Joi.string().required(),
  campaignId: Joi.string().required(),
  amount: Joi.number().positive().required(), // amount in INR
  paymentMethod: Joi.string()
    .valid('UPI', 'CARD', 'NETBANKING', 'WALLET', 'SOLANA_STUB')
    .required(),
}).unknown(false);

/**
 * Create a donation:
 *  1. joi validation
 *  2. KYC threshold check (amount > 10,000 → needs APPROVED KYC)
 *  3. Verify NGO is ACTIVE and campaign is ACTIVE
 *  4. Create Razorpay order
 *  5. Insert donation row (INITIATED)
 *  6. Return { orderId, publicDonationId }
 */
export const createDonation = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { error, value } = donateSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const { ngoId, campaignId, amount, paymentMethod } = value as {
      ngoId: string;
      campaignId: string;
      amount: number;
      paymentMethod: string;
    };

    const donorId = req.user?.id;
    if (!donorId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    // --- Validate NGO ---
    const ngoProfile = await prisma.profile.findUnique({
      where: { id: ngoId },
      select: { id: true, ngoStatus: true },
    });

    if (!ngoProfile || ngoProfile.ngoStatus !== 'ACTIVE') {
      return res.status(400).json({ error: 'Invalid or inactive NGO' });
    }

    // --- Validate campaign ---
    const campaign = await prisma.campaign.findFirst({
      where: { id: campaignId, ngoId, status: 'ACTIVE' },
      select: { id: true },
    });

    if (!campaign) {
      return res.status(400).json({ error: 'Invalid or inactive campaign' });
    }

    // --- Create Razorpay order ---
    const razorpayOrder = await createRazorpayOrder(amount);

    // --- Insert donation (INITIATED) ---
    const donation = await prisma.donation.create({
      data: {
        donorId,
        ngoId,
        campaignId,
        amount,
        currencyCode: 'INR',
        paymentMethod: paymentMethod as PaymentMethod,
        status: 'INITIATED',
        razorpayOrderId: razorpayOrder.id,
      },
      select: {
        id: true,
        publicId: true,
        razorpayOrderId: true,
      },
    });

    // Audit log — non-blocking
    void writeAuditLog({
      actorType: AuditActorType.USER,
      actorId: donorId,
      entityType: 'donation',
      entityId: donation.id,
      action: 'DONATION_INITIATED',
      metadata: {
        amount,
        paymentMethod,
        ngoId,
        campaignId,
        razorpayOrderId: razorpayOrder.id,
      },
      ipAddress: req.ip,
    });

    res.status(201).json({
      orderId: razorpayOrder.id,
      publicDonationId: donation.publicId,
    });
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// POST /api/donor/kyc
// ---------------------------------------------------------------------------

const kycSchema = Joi.object({
  pan: Joi.string()
    .length(10)
    .uppercase()
    .pattern(/^[A-Z]{5}[0-9]{4}[A-Z]$/)
    .required()
    .messages({
      'string.pattern.base': 'PAN must be in the format AAAAA9999A',
    }),
}).unknown(false);

/**
 * KYC stub:
 *  1. Validate PAN format (AAAAA9999A)
 *  2. Simulate Signzy/HyperVerge verification (always passes for valid format)
 *  3. HMAC-SHA512(pan, hmacKey) → store pan_hash
 *  4. Set kyc_status = APPROVED
 *  5. Audit log: KYC_APPROVED
 */
export const kycStub = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { error, value } = kycSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const { pan } = value as { pan: string };
    const donorId = req.user?.id;
    if (!donorId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    // Prevent re-submission if already approved
    const existing = await prisma.profile.findUnique({
      where: { id: donorId },
      select: { kycStatus: true },
    });
    if (existing?.kycStatus === 'APPROVED') {
      return res.status(409).json({ error: 'KYC already approved' });
    }

    // HMAC-SHA512 of PAN using key from env (Vault integration in Phase 5)
    const { createHmac } = await import('crypto');
    const hmacKey = requireEnvironmentVariable('KYC_HMAC_KEY');
    const panHash = createHmac('sha512', hmacKey).update(pan).digest('hex');

    // Persist pan_hash + approve KYC
    await prisma.profile.update({
      where: { id: donorId },
      data: {
        panHash,
        kycStatus: 'APPROVED',
      },
    });

    // Audit log — KYC_APPROVED
    void writeAuditLog({
      actorType: AuditActorType.USER,
      actorId: donorId,
      entityType: 'profile',
      entityId: donorId,
      action: 'KYC_APPROVED',
      metadata: {
        // Never log the raw PAN — only a short snippet of the hash for trace correlation
        panHashSnippet: panHash.slice(0, 16),
      },
      ipAddress: req.ip,
    });

    res.json({ message: 'KYC approved successfully' });
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// GET /api/donor/receipt/:donationId
// ---------------------------------------------------------------------------

/**
 * Returns a 15-min signed URL for the 80G receipt.
 * If the receipt hasn't been generated yet (e.g., webhook hasn't fired),
 * it generates one on-demand before returning.
 *
 * IDOR protection: only the donor who made the donation can access their receipt.
 */
export const getDonorReceipt = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const donationId = req.params['donationId'] as string;
    const donorId = req.user?.id;
    if (!donorId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    // Fetch donation — enforce ownership (IDOR guard)
    // Use findMany({take:1}) so Prisma properly infers the select return type
    const results = await prisma.donation.findMany({
      where: { id: donationId, donorId },
      take: 1,
      select: {
        id: true,
        status: true,
        taxReceiptUrl: true,
        publicId: true,
      },
    });

    const donation = results[0];

    if (!donation) {
      // Return 404 regardless of whether the donation belongs to someone else
      return res.status(404).json({ error: 'Donation not found' });
    }

    // Receipts are only valid for successful donations
    if (donation.status !== 'SUCCESS' &&
        donation.status !== 'ALLOCATED' &&
        donation.status !== 'DISBURSED' &&
        donation.status !== 'DELIVERED') {
      return res.status(400).json({
        error: 'Receipt not available: donation has not been confirmed as successful.',
        status: donation.status,
      });
    }

    // If receipt already generated, return a fresh signed URL
    if (donation.taxReceiptUrl) {
      const signedUrl = await getReceiptSignedUrl(donation.taxReceiptUrl);
      return res.json({ receiptUrl: signedUrl, publicDonationId: donation.publicId });
    }

    // Generate receipt on-demand (handles case where webhook fired before receipt service was ready)
    const signedUrl = await generateAndStoreReceipt(donation.id);
    if (!signedUrl) {
      return res.status(500).json({ error: 'Failed to generate receipt. Please try again later.' });
    }

    res.json({ receiptUrl: signedUrl, publicDonationId: donation.publicId });
  } catch (err) {
    next(err);
  }
};

/**
 * Returns the status transition timeline for a donation.
 * Only accessible by the donor who made the donation.
 * Returns ordered audit log entries for the donation.
 */
export const getDonationTimeline = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const donationId = req.params['id'] as string;
    const donorId = req.user?.id;
    if (!donorId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    // Verify ownership of the donation (IDOR protection)
    const donation = await prisma.donation.findFirst({
      where: { id: donationId, donorId },
      select: { id: true },
    });

    if (!donation) {
      return res.status(404).json({ error: 'Donation not found' });
    }

    // Fetch audit logs for this donation, ordered by creation time
    const auditLogs = await prisma.auditLog.findMany({
      where: {
        entityType: 'donation',
        entityId: donationId,
      },
      select: {
        id: true,
        actorType: true,
        action: true,
        metadata: true,
        createdAt: true,
        ipAddress: true,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    // Serialize BigInt id fields to string for JSON compatibility
    const serialized = auditLogs.map((log) => ({
      ...log,
      id: log.id.toString(),
    }));

    res.json(serialized);
  } catch (err) {
    next(err);
  }
};


// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

const donorRouter = Router();
donorRouter.use(requireAuth); // All donor routes require authentication

donorRouter.get('/dashboard', requireRole(UserRole.DONOR), getDonorDashboard);
donorRouter.post('/donate', requireRole(UserRole.DONOR), kycCheckMiddleware, createDonation);
donorRouter.post('/kyc', requireRole(UserRole.DONOR), kycStub);
donorRouter.get('/receipt/:donationId', requireRole(UserRole.DONOR), getDonorReceipt);
donorRouter.get('/donations/:id/timeline', requireRole(UserRole.DONOR), getDonationTimeline);

export default donorRouter;
