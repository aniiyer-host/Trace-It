import { getBlockchainService } from '../src/services/blockchainInstance';
import { prisma } from '../src/db/prisma.js';

describe('NGO Integration', () => {
  let blockchainService: any;

  beforeAll(async () => {
    blockchainService = await getBlockchainService();
    await blockchainService.init(
      '/home/aaditya/projects/Trace-It/blockchain/target/idl/traceit.json'
    );
  });

  afterAll(async () => {
    // Cleanup would go here in a real test
  });

  it('should register an NGO on-chain', async () => {
    const ngoId = `test-ngo-${Date.now()}`;
    const metadataHash = 'test_metadata_hash_' + Date.now();

    const result = await blockchainService.registerNgo({
      ngoId,
      metadataHash
    });

    expect(result.success).toBe(true);
    expect(result.txHash).not.toBeNull();

    // Verify we can fetch the record (would need to implement getNgoRecord)
    // This is a placeholder for now
  });

  it('should handle duplicate NGO registration gracefully', async () => {
    const ngoId = `test-ngo-dup-${Date.now()}`;
    const metadataHash = 'test_metadata_hash_' + Date.now();

    // First registration
    await blockchainService.registerNgo({
      ngoId,
      metadataHash
    });

    // Second registration should still succeed (idempotent via PDA)
    const result = await blockchainService.registerNgo({
      ngoId,
      metadataHash: metadataHash + '_updated'
    });

    expect(result.success).toBe(true);
    // Note: In the case of duplicate registration, we don't get a new transaction hash
    // because the account already exists. This is expected behavior for idempotency.
  });
});