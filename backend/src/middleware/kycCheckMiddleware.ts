import { Request, Response, NextFunction } from 'express';
import { prisma } from '../db/prisma';
import { AuditActorType } from '../../generated/prisma/enums';
import { writeAuditLog } from '../services/auditLogService';

/**
 * Middleware to enforce KYC tier for donations.
 * Checks if donation amount > 10000 INR and donor's kycStatus is not APPROVED.
 * If KYC required, returns 402 with { requiresKyc: true }.
 * Otherwise, calls next().
 */
export const kycCheckMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    // Ensure authenticated user exists (requireAuth should have run before)
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    // Get amount from request body (assuming JSON body parsed by express.json())
    const amount = req.body?.amount;
    if (typeof amount !== 'number' || isNaN(amount)) {
      // If amount is not a valid number, let the route handler's validation deal with it.
      // We'll just skip KYC check and let next() handle validation errors.
      return next();
    }

    // Fetch donor's KYC status
    const donorProfile = await prisma.profile.findUnique({
      where: { id: userId },
      select: { kycStatus: true },
    });

    if (!donorProfile) {
      return res.status(404).json({ error: 'Donor profile not found' });
    }

    // KYC threshold: 10000 INR
    if (amount > 10000 && donorProfile.kycStatus !== 'APPROVED') {
      // Audit log for KYC required event (optional, but could be useful)
      void writeAuditLog({
        actorType: AuditActorType.USER,
        actorId: userId,
        entityType: 'profile',
        entityId: userId,
        action: 'KYC_REQUIRED',
        metadata: { amount, kycStatus: donorProfile.kycStatus },
        ipAddress: req.ip,
      });

      return res.status(402).json({ requiresKyc: true });
    }

    next();
  } catch (err) {
    next(err);
  }
};