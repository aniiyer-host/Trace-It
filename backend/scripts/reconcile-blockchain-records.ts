#!/usr/bin/env ts-node
import { getBlockchainService } from '../src/services/blockchainInstance';
import { prisma } from '../src/db/prisma';
import { writeAuditLog } from '../src/services/auditLogService';

async function main() {
  console.log('Starting blockchain reconciliation process...');

  const blockchainService = await getBlockchainService();

  // Find donations that are SUCCESS or higher but missing solanaTxHash
  const donationsNeedingRecording = await prisma.donation.findMany({
    where: {
      status: { in: [1, 2, 3, 4] }, // SUCCESS or higher
      solanaTxHash: null
    },
    include: {
      ngo: true
    }
  });

  console.log(`Found ${donationsNeedingRecording.length} donations needing blockchain recording`);

  for (const donation of donationsNeedingRecording) {
    try {
      console.log(`Processing donation ${donation.id}...`);

      const donationData = {
        donationId: donation.id,
        donorUserId: donation.donorId,
        ngoId: donation.ngoId,
        campaignId: donation.campaignId,
        amountInr: donation.amount,
        currency: 'INR',
        timestamp: new Date(donation.createdAt)
      };

      const result = await blockchainService.recordDonation(donationData);

      if (result.success) {
        // Update donation with transaction hash
        await prisma.donation.update({
          where: { id: donation.id },
          data: { solanaTxHash: result.txHash }
        });

        await writeAuditLog({
          actorType: 'SYSTEM',
          entityType: 'donation',
          entityId: donation.id,
          action: 'BLOCKCHAIN_RECONCILE_RECORD',
          metadata: {
            donationId: donation.id,
            transactionHash: result.txHash
          },
          ipAddress: 'system',
        });

        console.log(`✓ Successfully recorded donation ${donation.id}: ${result.txHash}`);
      } else {
        console.error(`✗ Failed to record donation ${donation.id}: ${result.error}`);

        await writeAuditLog({
          actorType: 'SYSTEM',
          entityType: 'donation',
          entityId: donation.id,
          action: 'BLOCKCHAIN_RECONCILE_FAILED',
          metadata: {
            donationId: donation.id,
            error: result.error
          },
          ipAddress: 'system',
        });
      }
    } catch (error) {
      console.error(`✗ Unexpected error processing donation ${donation.id}:`, error);

      await writeAuditLog({
        actorType: 'SYSTEM',
        entityType: 'donation',
        entityId: donation.id,
        action: 'BLOCKCHAIN_RECONCILE_ERROR',
        metadata: {
          donationId: donation.id,
          error: error.message
        },
        ipAddress: 'system',
      });
    }

    // Small delay between requests to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // Also check for donations that need status updates
  const donationsNeedingStatusUpdate = await prisma.donation.findMany({
    where: {
      status: { in: [2, 3, 4] }, // ALLOCATED or higher
      solanaTxHash: { not: null }
    }
  });

  console.log(`Found ${donationsNeedingStatusUpdate.length} donations needing status verification`);

  for (const donation of donationsNeedingStatusUpdate) {
    try {
      const onChainData = await blockchainService.getDonationRecord(donation.id);

      if (onChainData && onChainData.status !== donation.status) {
        console.log(`Donation ${donation.id} status mismatch: DB=${donation.status}, Chain=${onChainData.status}`);

        // Update on-chain status to match DB (assuming DB is source of truth)
        const result = await blockchainService.updateDonationStatus(
          donation.id,
          donation.status
        );

        if (result.success) {
          await writeAuditLog({
            actorType: 'SYSTEM',
            entityType: 'donation',
            entityId: donation.id,
            action: 'BLOCKCHAIN_RECONCILE_STATUS_SYNC',
            metadata: {
              donationId: donation.id,
              transactionHash: result.txHash,
              newStatus: donation.status
            },
            ipAddress: 'system',
          });

          console.log(`✓ Synchronized donation ${donation.id} status to ${donation.status}`);
        } else {
          console.error(`✗ Failed to synchronize donation ${donation.id} status: ${result.error}`);
        }
      }
    } catch (error) {
      console.error(`✗ Error checking donation ${donation.id} status:`, error);
    }

    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log('Blockchain reconciliation process completed.');
}

// Run if executed directly
if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error in reconciliation script:', error);
    process.exit(1);
  });
}

export default main;