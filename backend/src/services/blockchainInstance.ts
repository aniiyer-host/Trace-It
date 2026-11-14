import type { BlockchainService } from './blockchainService';

/** Legacy Anchor writer retired. Durable AnchorBatch processing is the only write path. */
export async function getBlockchainService(): Promise<BlockchainService | null> {
  return null;
}
