import { prisma } from '../db/prisma';

/**
 * Add a failed blockchain operation to the retry queue.
 * @param data - The retry queue data
 */
export async function addToBlockchainRetryQueue(data: {
  donationId: string;
  error: string;
  retryCount: number;
  /** Optional: operation type for better tracking */
  operationType?: 'RECORD_DONATION' | 'UPDATE_STATUS' | 'NGO_REGISTRATION' | 'COHORT_REGISTRATION' | 'DISBURSEMENT_RECORDING';
  /** Optional: additional metadata */
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    // Create or update retry queue entry
    await prisma.blockchainRetryQueue.upsert({
      where: { donationId: data.donationId },
      update: {
        error: data.error,
        retryCount: data.retryCount + 1,
        lastAttempt: new Date(),
        operationType: data.operationType,
        metadata: data.metadata ? (data.metadata as any) : undefined,
        updatedAt: new Date()
      },
      create: {
        donationId: data.donationId,
        error: data.error,
        retryCount: data.retryCount + 1,
        lastAttempt: new Date(),
        operationType: data.operationType,
        metadata: data.metadata ? (data.metadata as any) : undefined,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    });

    console.info(`Added donation ${data.donationId} to blockchain retry queue (attempt ${data.retryCount + 1})`);
  } catch (queueError) {
    console.error(`Failed to add to retry queue:`, queueError);
    // Don't fail the webhook if queue fails - the operation is already recorded in DB
  }
}