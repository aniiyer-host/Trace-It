import { getBlockchainService } from './blockchainInstance';
import { writeAuditLog } from './auditLogService';
import { prisma } from '../db/prisma';

export class BlockchainRetryProcessor {
  private readonly batchSize = 10;
  private readonly delayMs = 30000; // 30 seconds between batches
  private readonly maxRetries = 5;
  private isRunning = false;

  async start(): Promise<void> {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    console.log('Blockchain retry processor started');

    while (this.isRunning) {
      try {
        await this.processRetryQueue();
        await new Promise(resolve => setTimeout(resolve, this.delayMs));
      } catch (error) {
        console.error('Error in blockchain retry processor:', error);
        await new Promise(resolve => setTimeout(resolve, this.delayMs * 2)); // Longer delay on error
      }
    }
  }

  stop(): void {
    this.isRunning = false;
    console.log('Blockchain retry processor stopped');
  }

  private async processRetryQueue(): Promise<void> {
    // Get failed attempts that are ready for retry (exponential backoff)
    const retryItems = await prisma.blockchainRetryQueue.findMany({
      where: {
        OR: [
          { retryCount: { lt: this.maxRetries } },
          { lastAttempt: { lt: new Date(Date.now() - (this.delayMs * Math.pow(2, 5))) } } // Give up after 5 attempts with backoff
        ]
      },
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

        // Skip if already has a transaction hash (successfully recorded elsewhere)
        if (donation.solanaTxHash) {
          await prisma.blockchainRetryQueue.delete({
            where: { donationId: item.donationId }
          });
          continue;
        }

        // Attempt to record on-chain
        const donationData = {
          donationId: donation.id,
          donorUserId: donation.donorId,
          ngoId: donation.ngoId,
          campaignId: donation.campaignId ?? '',
          amountInr: donation.amount.toNumber(),
          currency: 'INR',
          timestamp: new Date(donation.createdAt) // Use original donation timestamp
        };

        const result = await blockchainService.recordDonation(donationData);

        if (result.success) {
          // Success! Update donation and remove from queue
          await prisma.donation.update({
            where: { id: donation.id },
            data: { solanaTxHash: result.txHash }
          });

          await prisma.blockchainRetryQueue.delete({
            where: { donationId: item.donationId }
          });

          await writeAuditLog({
            actorType: 'SYSTEM',
            entityType: 'donation',
            entityId: donation.id,
            action: 'BLOCKCHAIN_RETRY_SUCCESS',
            metadata: {
              donationId: donation.id,
              transactionHash: result.txHash
            },
            ipAddress: 'system',
          });

          console.log(`Successfully recorded donation ${donation.id} on-chain via retry: ${result.txHash}`);
        } else {
          // Failed again, update retry count and error
          await prisma.blockchainRetryQueue.update({
            where: { donationId: item.donationId },
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
        // Handle unexpected errors
        const errorMessage = error instanceof Error ? error.message : String(error);
        await prisma.blockchainRetryQueue.update({
          where: { donationId: item.donationId },
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
}

// Start the processor when the module is imported in a long-running process
if (require.main === module) {
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