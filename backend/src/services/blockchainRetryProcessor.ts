import type { Prisma } from '../../generated/prisma/client';

/**
 * @deprecated Phase 6 retired donation/status legacy retries. This compatibility
 * shell intentionally performs no database reads and sends no transactions.
 */
export class BlockchainRetryProcessor {
  async start(): Promise<void> {
    console.warn(
      '[BlockchainRetryProcessor] Retired by Phase 6; legacy queue rows will not be executed.',
    );
  }

  stop(): void {
    // Compatibility no-op.
  }
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
