import { getBlockchainService } from './blockchainInstance';
import { writeAuditLog } from './auditLogService';
import { prisma } from '../db/prisma';
import { AuditActorType } from '../../generated/prisma/enums';
import type { BlockchainService } from './blockchainService';
import type { Prisma } from '../../generated/prisma/client';

export class BlockchainRetryProcessor {
  private readonly batchSize = 10;
  private readonly baseDelayMs = 5000; // 5 seconds base delay
  private readonly maxRetries = 5;
  private isRunning = false;
  private readonly operationTypes: ('RECORD_DONATION' | 'UPDATE_STATUS')[] = ['RECORD_DONATION', 'UPDATE_STATUS'];

  async start(): Promise<void> {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    console.log('Blockchain retry processor started');

    while (this.isRunning) {
      try {
        await this.processRetryQueue();
        await new Promise(resolve => setTimeout(resolve, this.baseDelayMs));
      } catch (error) {
        console.error('Error in blockchain retry processor:', error);
        await new Promise(resolve => setTimeout(resolve, this.baseDelayMs * 2)); // Longer delay on error
      }
    }
  }

  stop(): void {
    this.isRunning = false;
    console.log('Blockchain retry processor stopped');
  }

  private async processRetryQueue(): Promise<void> {
    // Get failed attempts that are ready for retry (exponential backoff)
    const now = new Date();
    const retryFilter = getRetryEligibilityFilter(now, this.maxRetries, this.baseDelayMs);

    // Combine with operationType filter
    const combinedFilter: Prisma.BlockchainRetryQueueWhereInput = {
      AND: [
        retryFilter,
        {
          operationType: {
            in: this.operationTypes as string[]
          }
        }
      ]
    };

    const retryItems = await prisma.blockchainRetryQueue.findMany({
      where: combinedFilter,
      orderBy: { lastAttempt: 'asc' },
      take: this.batchSize
    });

    if (retryItems.length === 0) {
      return;
    }

    console.log(`Processing ${retryItems.length} blockchain retry items`);

    const blockchainService = await getBlockchainService();

    for (const item of retryItems) {
      try {
        // Fetch the donation to get current data
        const donation = await prisma.donation.findUnique({
          where: { id: item.donationId }
        });

        if (!donation) {
          // Donation no longer exists, remove from queue
          await prisma.blockchainRetryQueue.delete({
            where: { donationId: item.donationId }
          });
          continue;
        }

        // Skip if already has a transaction hash (successfully recorded elsewhere) for RECORD_DONATION
        if (item.operationType === 'RECORD_DONATION' && donation.solanaTxHash) {
          await prisma.blockchainRetryQueue.delete({
            where: { donationId: item.donationId }
          });
          continue;
        }

        // Process based on operation type
        if (item.operationType === 'RECORD_DONATION') {
          await this.processRecordDonationRetry(item, donation, blockchainService);
        } else if (item.operationType === 'UPDATE_STATUS') {
          await this.processUpdateStatusRetry(item, donation, blockchainService);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        // Handle unexpected errors
        await prisma.blockchainRetryQueue.update({
          where: { id: item.id },
          data: {
            error: errorMessage,
            retryCount: item.retryCount + 1,
            lastAttempt: new Date(),
            updatedAt: new Date()
          }
        });

        console.error(`Unexpected error processing retry for donation ${item.donationId}:`, error);
      }
    }
  }

  private async processRecordDonationRetry(
    item: any,
    donation: any,
    blockchainService: BlockchainService
  ): Promise<void> {
    try {
      // Prepare donation data for on-chain recording
      const donationData = {
        donationId: donation.id,
        donorUserId: donation.donorId,
        ngoId: donation.ngoId,
        campaignId: donation.campaignId ?? '',
        amountInr: donation.amount.toNumber(),
        currency: 'INR',
        timestamp: new Date(donation.createdAt) // Use original donation timestamp
      };

      // Attempt to record on-chain
      const result = await blockchainService.recordDonation(donationData);

      if (result.success) {
        // Success! Update donation and remove from queue
        await prisma.donation.update({
          where: { id: donation.id },
          data: { solanaTxHash: result.txHash }
        });

        await prisma.blockchainRetryQueue.delete({
          where: { id: item.id }
        });

        await writeAuditLog({
          actorType: AuditActorType.SYSTEM,
          entityType: 'donation',
          entityId: donation.id,
          action: 'BLOCKCHAIN_RETRY_SUCCESS',
          metadata: {
            donationId: donation.id,
            transactionHash: result.txHash,
            attemptNumber: item.retryCount + 1
          },
          ipAddress: 'retry-processor',
        });

        console.log(`Successfully recorded donation ${donation.id} on-chain via retry (attempt ${item.retryCount + 1}): ${result.txHash}`);
      } else {
        // Failed again, update retry count and error
        await prisma.blockchainRetryQueue.update({
          where: { id: item.id },
          data: {
            error: result.error,
            retryCount: item.retryCount + 1,
            lastAttempt: new Date(),
            updatedAt: new Date()
          }
        });

        console.log(`Retry failed for donation ${donation.id} (attempt ${item.retryCount + 1}): ${result.error}`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      await prisma.blockchainRetryQueue.update({
        where: { id: item.id },
        data: {
          error: errorMessage,
          retryCount: item.retryCount + 1,
          lastAttempt: new Date(),
          updatedAt: new Date()
        }
      });

      console.error(`Error processing record donation retry for ${donation.id}:`, error);
    }
  }

  private async processUpdateStatusRetry(
    item: any,
    donation: any,
    blockchainService: BlockchainService
  ): Promise<void> {
    try {
      // We need to know the target status. We stored it in metadata or targetStatus field.
      // For now, we'll use the metadata field (if available) or fall back to donation.status (source of truth).
      const targetStatus = item.metadata?.targetStatus ?? donation.status;

      // Attempt to update status on-chain
      const result = await blockchainService.updateDonationStatus(
        donation.id,
        targetStatus
      );

      if (result.success) {
        // Success! Remove from queue
        await prisma.blockchainRetryQueue.delete({
          where: { id: item.id }
        });

        await writeAuditLog({
          actorType: AuditActorType.SYSTEM,
          entityType: 'donation',
          entityId: donation.id,
          action: 'BLOCKCHAIN_STATUS_UPDATE_RETRY_SUCCESS',
          metadata: {
            donationId: donation.id,
            newStatus: targetStatus,
            transactionHash: result.txHash,
            attemptNumber: item.retryCount + 1
          },
          ipAddress: 'retry-processor',
        });

        console.log(`Successfully updated donation ${donation.id} status on-chain via retry (attempt ${item.retryCount + 1}): ${result.txHash}`);
      } else {
        // Failed again, update retry count and error
        await prisma.blockchainRetryQueue.update({
          where: { id: item.id },
          data: {
            error: result.error,
            retryCount: item.retryCount + 1,
            lastAttempt: new Date(),
            updatedAt: new Date()
          }
        });

        console.log(`Retry failed for donation ${donation.id} status update (attempt ${item.retryCount + 1}): ${result.error}`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      await prisma.blockchainRetryQueue.update({
        where: { id: item.id },
        data: {
          error: errorMessage,
          retryCount: item.retryCount + 1,
          lastAttempt: new Date(),
          updatedAt: new Date()
        }
      });

      console.error(`Error processing status update retry for ${donation.id}:`, error);
    }
  }
}

// Start the processor when the module is imported in a long-running process
// Note: Using import.meta.url instead of require.main === module for ES modules
if (import.meta.url === `file://${process.argv[1]}`) {
    const processor = new BlockchainRetryProcessor();
    processor.start().catch(console.error);

    // Graceful shutdown
    process.on('SIGINT', () => {
      processor.stop();
      process.exit(0);
    });

    process.on('SIGTERM', () => {
      processor.stop();
      process.exit(0);
    });
  }

  export default BlockchainRetryProcessor;

  export function getRetryEligibilityFilter(
    now: Date,
    maxRetries: number,
    baseDelayMs: number
  ): Prisma.BlockchainRetryQueueWhereInput {
    const orArray: Prisma.BlockchainRetryQueueWhereInput['OR'] = [];

    for (let i = 0; i < maxRetries; i++) {
      orArray.push({
        retryCount: i,
        lastAttempt: { lte: new Date(now.getTime() - baseDelayMs * Math.pow(2, i)) }
      });
    }

    return {
      retryCount: { lt: maxRetries },
      OR: orArray
    } as Prisma.BlockchainRetryQueueWhereInput;
  }