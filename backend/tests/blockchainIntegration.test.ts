import { BlockchainService } from '../src/services/blockchainService.js';
import { HashService } from '../src/services/hashService.js';
import { PublicKey, Keypair } from '@solana/web3.js';
import * as anchor from '@coral-xyz/anchor';
import path from 'path';
import fs from 'fs';

describe('BlockchainService Integration Tests', () => {
  const hmacSecret = 'integration_test_hmac_secret_123';
  const testDonationId = 'integ-test-donation-' + Date.now();
  const testDonorUserId = 'test_user_' + Date.now();
  const testNgoId = 'ngo_integ_' + Date.now();
  const testCampaignId = 'camp_integ_' + Date.now();
  const testAmountInr = 100.50; // ₹100.50
  const testCurrency = 'INR';
  const testTimestamp = new Date();

  let service: BlockchainService;

  beforeAll(async () => {
    // Use the devnet wallet that was funded with airdrop
    service = new BlockchainService({
      rpcUrl: process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com',
      walletKeypairPath: process.env.SOLANA_WALLET_KEYPAIR_PATH || '/home/aaditya/.config/solana/devnet-traceit.json',
      programId: '5fj53usXqFvfah3x7rYo6BxQnrvBprBZsGU49XhQxzV3',
      hmacSecret,
      commitment: 'confirmed',
    });

    // Load the IDL from the blockchain build output
    const idlPath = path.resolve(
      __dirname, '..', '..', 'blockchain', 'target', 'idl', 'traceit.json'
    );
    await service.init(idlPath);
  }, 30000); // Increased timeout for initialization

  afterAll(async () => {
    // Clean up: we could optionally try to close the account to reclaim rent,
    // but for simplicity we'll leave it on devnet for inspection
    console.log(`Integration test completed. Check donation record for donationId: ${testDonationId}`);
  });

  it('should initialize successfully', () => {
    expect(service).toBeDefined();
    // Note: program property is private, but we can check if initialization worked
    // by verifying the service instance exists
    expect(service).toBeDefined();
  });

  it('should record a donation on-chain via BlockchainService', async () => {
    // Compute expected values
    const donorIdHash = HashService.hmacSha512(testDonorUserId, hmacSecret);
    const amountPaisa = Math.round(testAmountInr * 100);
    const unixTimestamp = Math.floor(testTimestamp.getTime() / 1000);
    const recordHash = HashService.sha512(
      `${testDonationId}|${amountPaisa}|${unixTimestamp}|${testNgoId}|${donorIdHash}`
    );

    // Record the donation
    const result = await service.recordDonation({
      donationId: testDonationId,
      donorUserId: testDonorUserId,
      ngoId: testNgoId,
      campaignId: testCampaignId,
      amountInr: testAmountInr,
      currency: testCurrency,
      timestamp: testTimestamp
    });

    expect(result.success).toBe(true);
    expect(result.txHash).not.toBeNull();
    expect(result.error).toBeUndefined();

    console.log(`Transaction signature: ${result.txHash}`);

    // Verify we can fetch the record back
    const onChainData = await service.getDonationRecord(testDonationId);
    expect(onChainData).not.toBeNull();

    if (onChainData) {
      expect(onChainData.donationId).toBe(testDonationId);
      expect(onChainData.donorIdHash).toBe(donorIdHash);
      expect(onChainData.ngoId).toBe(testNgoId);
      expect(onChainData.campaignId).toBe(testCampaignId);
      expect(onChainData.amountPaisa).toBe(amountPaisa);
      expect(onChainData.currency).toBe(testCurrency);
      expect(onChainData.timestamp).toBe(unixTimestamp);
      expect(onChainData.status).toBe(1); // SUCCESS
      expect(onChainData.recordHash).toBe(recordHash);
    }
  }, 30000); // Increased timeout for transaction confirmation

  it('should verify donation integrity', async () => {
    const verification = await service.verifyDonationIntegrity(
      testDonationId,
      testDonorUserId,
      testAmountInr,
      testNgoId,
      testTimestamp
    );

    expect(verification.valid).toBe(true);
    expect(verification.onChainHash).not.toBeNull();
    expect(verification.computedHash).toBeDefined();
    expect(verification.valid).toBe(true);
  }, 30000);

  it('should detect tampered data', async () => {
    const verification = await service.verifyDonationIntegrity(
      testDonationId,
      testDonorUserId + 'tampered', // Tampered donor ID
      testAmountInr,
      testNgoId,
      testTimestamp
    );

    expect(verification.valid).toBe(false);
    expect(verification.onChainHash).not.toBeNull();
    expect(verification.computedHash).toBeDefined();
    expect(verification.valid).toBe(false);
    // Hashes should be different
    expect(verification.onChainHash).not.toBe(verification.computedHash);
  }, 30000);

  it('should update donation status', async () => {
    // Update status from SUCCESS (1) to ALLOCATED (2)
    const result = await service.updateDonationStatus(testDonationId, 2);

    expect(result.success).toBe(true);
    expect(result.txHash).not.toBeNull();
    expect(result.error).toBeUndefined();

    console.log(`Status update transaction: ${result.txHash}`);

    // Verify the status was updated
    const onChainData = await service.getDonationRecord(testDonationId);
    expect(onChainData).not.toBeNull();
    expect(onChainData!.status).toBe(2); // ALLOCATED
  }, 30000);

  it('should reject invalid status transition', async () => {
    // Try to jump from ALLOCATED (2) to DELIVERED (4) - should fail
    const result = await service.updateDonationStatus(testDonationId, 4);

    expect(result.success).toBe(false);
    expect(result.txHash).toBeNull();
    expect(result.error).toContain('InvalidStatusTransition');
  }, 30000);

  it('should check wallet balance', async () => {
    const balance = await service.getWalletBalance();
    expect(typeof balance).toBe('number');
    expect(balance).toBeGreaterThanOrEqual(0);
    console.log(`Wallet balance: ${balance} SOL`);
  });
});