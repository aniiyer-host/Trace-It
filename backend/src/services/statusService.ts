import { prisma } from '../db/prisma.js';
import { writeAuditLog } from './auditLogService.js';
import { AuditActorType } from '../../generated/prisma/enums.js';

/**
 * Allocate a donation to a beneficiary cohort.
 * Sets donation status to ALLOCATED.
 * @param donationId - The donation ID
 * @param cohortId - The beneficiary cohort ID
 */
export const allocateDonation = async (donationId: string, cohortId: string) => {
  // Start a transaction to ensure consistency
  await prisma.$transaction(async (prismaTx) => {
    // Update donation status to ALLOCATED
    const donation = await prismaTx.donation.update({
      where: { id: donationId },
      data: { status: 'ALLOCATED' },
      include: {
        ngo: true,
        donor: true,
      },
    });

    // Audit log for allocation
    await writeAuditLog({
      actorType: AuditActorType.SYSTEM,
      entityType: 'donation',
      entityId: donation.id,
      action: 'DONATION_ALLOCATED',
      metadata: {
        donationId,
        cohortId,
        amount: donation.amount,
        ngoId: donation.ngoId,
        donorId: donation.donorId,
      },
      ipAddress: 'system', // System-generated action
    });
  });
};

/**
 * Mark a donation as disbursed (funds sent to NGO).
 * Sets donation status to DISBURSED.
 * @param donationId - The donation ID
 */
export const markDisbursed = async (donationId: string) => {
  await prisma.$transaction(async (prismaTx) => {
    // Update donation status to DISBURSED
    const donation = await prismaTx.donation.update({
      where: { id: donationId },
      data: { status: 'DISBURSED' },
      include: {
        ngo: true,
        donor: true,
      },
    });

    // Audit log for disbursement
    await writeAuditLog({
      actorType: AuditActorType.SYSTEM,
      entityType: 'donation',
      entityId: donation.id,
      action: 'DONATION_DISBURSED',
      metadata: {
        donationId,
        amount: donation.amount,
        ngoId: donation.ngoId,
        donorId: donation.donorId,
      },
      ipAddress: 'system',
    });
  });
};

/**
 * Mark a donation as delivered (beneficiary received aid).
 * Sets donation status to DELIVERED.
 * This triggers the mark_tokens_redeemed database trigger.
 * @param donationId - The donation ID
 */
export const markDelivered = async (donationId: string) => {
  await prisma.$transaction(async (prismaTx) => {
    // Update donation status to DELIVERED
    const donation = await prismaTx.donation.update({
      where: { id: donationId },
      data: { status: 'DELIVERED' },
      include: {
        ngo: true,
        donor: true,
      },
    });

    // Audit log for delivery
    await writeAuditLog({
      actorType: AuditActorType.SYSTEM,
      entityType: 'donation',
      entityId: donation.id,
      action: 'DONATION_DELIVERED',
      metadata: {
        donationId,
        amount: donation.amount,
        ngoId: donation.ngoId,
        donorId: donation.donorId,
      },
      ipAddress: 'system',
    });
  });
};