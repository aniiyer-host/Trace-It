import { HashService } from '../src/services/hashService';
import { BlockchainService, OnChainStatus } from '../src/services/blockchainService';
import { PublicKey, Keypair } from '@solana/web3.js';
import fs from 'fs';
import path from 'path';

describe('BlockchainService & HashService Unit Tests', () => {
  const hmacSecret = 'test_hmac_secret_123';
  const dummyProgramId = 'EtEXYLyycGoLvBxP7eQPhaTTb75BFs2EfLdPHr9yk2sG';
  
  const testKeypairPath = path.join(__dirname, 'test_keypair.json');
  const validKeypair = Keypair.generate();
  const validKeypairBytes = Array.from(validKeypair.secretKey);

  beforeAll(() => {
    fs.writeFileSync(testKeypairPath, JSON.stringify(validKeypairBytes));
  });

  afterAll(() => {
    if (fs.existsSync(testKeypairPath)) {
      fs.unlinkSync(testKeypairPath);
    }
  });

  describe('HashService', () => {
    it('computes consistent SHA-512 hash', () => {
      const data = 'donationId_123|50000|1700000000|ngoId_456';
      const hash1 = HashService.sha512(data);
      const hash2 = HashService.sha512(data);

      expect(hash1).toHaveLength(128); // 128 hex chars = 512 bits
      expect(hash1).toEqual(hash2);
    });

    it('computes consistent HMAC-SHA-512 hash for donor ID', () => {
      const donorUserId = 'user_uuid_789';
      const hmac1 = HashService.hmacSha512(donorUserId, hmacSecret);
      const hmac2 = HashService.hmacSha512(donorUserId, hmacSecret);

      expect(hmac1).toHaveLength(128);
      expect(hmac1).toEqual(hmac2);
    });
  });

  describe('BlockchainService PDA & Helper Logic', () => {
    it('instantiates cleanly with keypair path', () => {
      const service = new BlockchainService({
        programId: dummyProgramId,
        walletKeypairPath: testKeypairPath,
        hmacSecret,
      });

      expect(service).toBeDefined();
    });

    it('instantiates cleanly with keypair bytes', () => {
      const service = new BlockchainService({
        programId: dummyProgramId,
        walletKeypairJson: validKeypairBytes,
        hmacSecret,
      });

      expect(service).toBeDefined();
    });

    it('generates correct explorer URLs', () => {
      const service = new BlockchainService({
        programId: dummyProgramId,
        walletKeypairJson: validKeypairBytes,
        hmacSecret,
      });

      const txHash = '5Kz3x1Abcdefghigklmnopqrstuvwxyz';
      const urlDevnet = service.getExplorerUrl(txHash, 'devnet');
      expect(urlDevnet).toBe(`https://explorer.solana.com/tx/${txHash}?cluster=devnet`);
    });

    it('correctly derives program address seeds for donation PDAs (<=32 bytes)', () => {
      const donationId = 'd1234567-89ab-cdef-0123-456789abcdef';
      const cleanId = donationId.replace(/-/g, '');
      const programIdPubkey = new PublicKey(dummyProgramId);

      const [pda1, bump1] = PublicKey.findProgramAddressSync(
        [Buffer.from('donation'), Buffer.from(cleanId)],
        programIdPubkey
      );

      const [pda2, bump2] = PublicKey.findProgramAddressSync(
        [Buffer.from('donation'), Buffer.from(cleanId)],
        programIdPubkey
      );

      expect(pda1.toBase58()).toEqual(pda2.toBase58());
      expect(bump1).toEqual(bump2);
    });

    it('verifies donation integrity hash matches off-chain computed hash', async () => {
      const service = new BlockchainService({
        programId: dummyProgramId,
        walletKeypairJson: validKeypairBytes,
        hmacSecret,
      });

      const donationId = 'd1234567-89ab-cdef-0123-456789abcdef';
      const donorUserId = 'donor_user_id_100';
      const amountInr = 500.0;
      const ngoId = 'ngo_profile_id_200';
      const timestamp = new Date(1700000000000);

      // Recompute hash directly
      const donorIdHash = HashService.hmacSha512(donorUserId, hmacSecret);
      const amountPaisa = 50000;
      const unixTimestamp = 1700000000;
      const expectedHash = HashService.sha512(
        `${donationId}|${amountPaisa}|${unixTimestamp}|${ngoId}|${donorIdHash}`
      );

      // mock getDonationRecord
      jest.spyOn(service, 'getDonationRecord').mockResolvedValue({
        donationId,
        donorIdHash,
        ngoId,
        campaignId: 'camp_300',
        amountPaisa,
        currency: 'INR',
        timestamp: unixTimestamp,
        status: OnChainStatus.SUCCESS,
        recordHash: expectedHash,
      });

      const result = await service.verifyDonationIntegrity(
        donationId,
        donorUserId,
        amountInr,
        ngoId,
        timestamp
      );

      expect(result.valid).toBe(true);
      expect(result.onChainHash).toEqual(expectedHash);
      expect(result.computedHash).toEqual(expectedHash);
    });
  });
});
