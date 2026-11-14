import type { Prisma } from '../../generated/prisma/client';

/** Historical compatibility value. Legacy queue rows remain archived and inert. */
export const MAX_BLOCKCHAIN_RETRIES = 5;

/** Starting this compatibility shell never reads or mutates legacy queue rows. */
export class BlockchainRetryProcessor {
  async start(): Promise<void> {
    console.warn('[BlockchainRetryProcessor] retired; legacy queue entries are inert');
  }

  stop(): void {
    // There is no worker loop to stop.
  }
}

export default BlockchainRetryProcessor;

/** Kept only for callers/tests that inspect historical retry eligibility. */
export function getRetryEligibilityFilter(
  now: Date,
  maxRetries: number,
  baseDelayMs: number,
): Prisma.BlockchainRetryQueueWhereInput {
  const orArray: Prisma.BlockchainRetryQueueWhereInput['OR'] = [];
  for (let retryCount = 0; retryCount < maxRetries; retryCount++) {
    orArray.push({
      retryCount,
      lastAttempt: { lte: new Date(now.getTime() - baseDelayMs * 2 ** retryCount) },
    });
  }
  return { retryCount: { lt: maxRetries }, OR: orArray } as Prisma.BlockchainRetryQueueWhereInput;
}
