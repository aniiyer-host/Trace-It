#!/usr/bin/env ts-node
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { getBlockchainService } from '../src/services/blockchainInstance.js';
import { prisma } from '../src/db/prisma.js';
import { writeAuditLog } from '../src/services/auditLogService.js';
import { AuditActorType, DonationStatus } from '../generated/prisma/enums.js';
import { MAX_BLOCKCHAIN_RETRIES } from '../src/services/blockchainRetryProcessor.js';

async function main() {
  console.log('Starting blockchain reconciliation process...');

  const blockchainService = await getBlockchainService();

  // Find donations that are SUCCESS or higher but missing solanaTxHash
  const donationsNeedingRecording = await prisma.donation.findMany({
    where: {
      status: { in: [DonationStatus.SUCCESS, DonationStatus.ALLOCATED, DonationStatus.DISBURSED, DonationStatus.DELIVERED] }, // SUCCESS or higher
      solanaTxHash: null
    },
    include: {
      ngo: true
    }
  });

  console.log(`Found ${donationsNeedingRecording.length} donations needing blockchain recording`);

  let recordedCount = 0;
  let failedCount = 0;

  for (const donation of donationsNeedingRecording) {
    try {
      console.log(`Processing donation ${donation.id} for recording...`);

      console.log(`Checking queue for donation ${donation.id}...`);

      const existingQueue = await prisma.blockchainRetryQueue.findUnique({
        where: { donationId: donation.id }
      });

      if (!existingQueue) {
        try {
          await prisma.blockchainRetryQueue.create({
            data: {
              donationId: donation.id,
              operationType: 'RECORD_DONATION',
              lastAttempt: new Date(0), // Ready immediately
              error: 'Enqueued by reconciliation script'
            }
          });
          console.log(`✓ Enqueued missing donation ${donation.id} to retry queue.`);
          recordedCount++;
        } catch (createError: any) {
          if (createError?.code === 'P2002') {
            // Concurrent reconciliation run already enqueued this donation — safe to ignore.
            console.log(`ℹ Donation ${donation.id} was concurrently enqueued. Skipping.`);
          } else {
            throw createError; // Re-throw so the outer catch handles it.
          }
        }
      } else {
        if (existingQueue.retryCount >= MAX_BLOCKCHAIN_RETRIES) {
          console.log(`⚠ Donation ${donation.id} is in terminal state in retry queue. Skipping.`);
        } else {
          console.log(`ℹ Donation ${donation.id} is already active in retry queue. Skipping.`);
        }
      }
    } catch (error: any) {
      console.error(`✗ Unexpected error queueing donation ${donation.id}:`, error);

      await writeAuditLog({
        actorType: AuditActorType.SYSTEM,
        entityType: 'donation',
        entityId: donation.id,
        action: 'BLOCKCHAIN_RECONCILE_ERROR',
        metadata: {
          donationId: donation.id,
          error: error.message
        },
        ipAddress: 'reconciliation-script',
      });

      failedCount++;
    }

    // Small delay between requests to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // Also check for donations that need status updates
  const donationsNeedingStatusUpdate = await prisma.donation.findMany({
    where: {
      status: { in: [DonationStatus.ALLOCATED, DonationStatus.DISBURSED, DonationStatus.DELIVERED] }, // ALLOCATED or higher
      solanaTxHash: { not: null }
    }
  });

  console.log(`Found ${donationsNeedingStatusUpdate.length} donations needing status verification`);

  let syncedCount = 0;
  let syncFailedCount = 0;

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
            actorType: AuditActorType.SYSTEM,
            entityType: 'donation',
            entityId: donation.id,
            action: 'BLOCKCHAIN_RECONCILE_STATUS_SYNC',
            metadata: {
              donationId: donation.id,
              newStatus: donation.status,
              transactionHash: result.txHash
            },
            ipAddress: 'reconciliation-script',
          });

          console.log(`✓ Synchronized donation ${donation.id} status to ${donation.status}`);
          syncedCount++;
        } else {
          console.error(`✗ Failed to synchronize donation ${donation.id} status: ${result.error}`);

          await writeAuditLog({
            actorType: AuditActorType.SYSTEM,
            entityType: 'donation',
            entityId: donation.id,
            action: 'BLOCKCHAIN_RECONCILE_STATUS_SYNC_FAILED',
            metadata: {
              donationId: donation.id,
              error: result.error
            },
            ipAddress: 'reconciliation-script',
          });

          syncFailedCount++;
        }
      }
    } catch (error) {
      console.error(`✗ Error checking donation ${donation.id} status:`, error);

      await writeAuditLog({
        actorType: AuditActorType.SYSTEM,
        entityType: 'donation',
        entityId: donation.id,
        action: 'BLOCKCHAIN_RECONCILE_STATUS_ERROR',
        metadata: {
          donationId: donation.id,
          error: error.message
        },
        ipAddress: 'reconciliation-script',
      });

      syncFailedCount++;
    }

    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log(`
  Blockchain reconciliation process completed.
  Summary:
  - Recordings: ${recordedCount} successful, ${failedCount} failed
  - Status Sync: ${syncedCount} successful, ${syncFailedCount} failed
  `);
}

// Run if executed directly (ESM-compatible, path-normalised guard)
if (process.argv[1] && resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1])) {
  main().catch(error => {
    console.error('Fatal error in reconciliation script:', error);
    process.exit(1);
  });
}

export default main;