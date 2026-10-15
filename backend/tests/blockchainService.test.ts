import { HashService } from '../src/services/hashService.js';
import { BlockchainService, OnChainStatus } from '../src/services/blockchainService.js';
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

    describe('recordDonation Idempotency & Signature Recovery', () => {
      let service: BlockchainService;
      let getAccountInfoMock: jest.SpyInstance;
      let getSignaturesMock: jest.SpyInstance;
      let consoleWarn: jest.SpyInstance;
      let consoleError: jest.SpyInstance;

      beforeEach(() => {
        consoleWarn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
        consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
        service = new BlockchainService({
          programId: dummyProgramId,
          walletKeypairJson: validKeypairBytes,
          hmacSecret,
        });

        // Mock connection methods safely
        // @ts-ignore
        getAccountInfoMock = jest.spyOn(service.connection, 'getAccountInfo').mockResolvedValue(null);
        // @ts-ignore
        getSignaturesMock = jest.spyOn(service.connection, 'getSignaturesForAddress').mockResolvedValue([]);

        // Mock program property to prevent throw
        (service as any).program = {
          methods: {
            recordDonation: jest.fn().mockReturnThis(),
            accounts: jest.fn().mockReturnThis(),
            rpc: jest.fn().mockResolvedValue('fresh_tx_hash'),
          }
        };
      });

      afterEach(() => {
        consoleWarn.mockRestore();
        consoleError.mockRestore();
      });

      it('recovers creation signature using pagination when account already exists', async () => {
        // Derive the expected PDA using the exact production seeds.
        // Production path: cleanDonationId = donationId.replace(/-/g, '')
        const donationId = '123e4567-e89b-12d3-a456-426614174000';
        const cleanDonationId = donationId.replace(/-/g, '');
        const [expectedPda] = PublicKey.findProgramAddressSync(
          [Buffer.from('donation'), Buffer.from(cleanDonationId, 'utf8')],
          new PublicKey(dummyProgramId)
        );

        // Force account to exist (idempotency trigger)
        getAccountInfoMock.mockResolvedValue({ data: Buffer.from([]) });

        // Page 1: full 1000 with a distinct last signature so the cursor is unambiguous.
        // Page 2: partial (< 1000) — signals end of history; loop exits after this page.
        const page1Sigs = [
          ...Array(999).fill({ signature: 'page1_earlier_sig' }),
          { signature: 'page1_last_sig' }
        ];
        getSignaturesMock
          .mockResolvedValueOnce(page1Sigs)
          .mockResolvedValueOnce([{ signature: 'page2_older' }, { signature: 'true_creation_signature' }]);

        // Stub getParsedTransaction to return a transaction that passes all four checks:
        //   1. meta.err === null  (transaction succeeded)
        //   2. programId matches  (correct program)
        //   3. accounts[0] equals the expected PDA  (correct account)
        //   4. coder.decode returns { name: 'recordDonation' }  (correct instruction)
        jest.spyOn((service as any).connection, 'getParsedTransaction').mockResolvedValue({
          meta: { err: null },
          transaction: {
            message: {
              instructions: [{
                programId: new PublicKey(dummyProgramId),
                accounts: [expectedPda],
                data: '1'  // valid bs58 (encodes [0x00]); decoded value is irrelevant — coder.decode is mocked
              }]
            }
          }
        } as any);

        // Stub the coder — anchor.utils.bytes.bs58.decode runs on the data string;
        // the coder.decode is intercepted before any real BorshCoder is needed.
        (service as any).program.coder = {
          instruction: {
            decode: jest.fn().mockReturnValue({ name: 'recordDonation' })
          }
        };

        const result = await service.recordDonation({
          donationId,
          donorUserId: 'user-1',
          ngoId: 'ngo-1',
          campaignId: '',
          amountInr: 100,
          currency: 'INR',
          timestamp: new Date()
        });

        expect(result.success).toBe(true);
        expect(result.txHash).toEqual('true_creation_signature');
        // Two getSignaturesForAddress calls: page 1 (no before), page 2 (before = last sig of page 1)
        expect(getSignaturesMock).toHaveBeenCalledTimes(2);
        expect(getSignaturesMock.mock.calls[0][1]).toEqual({ limit: 1000, before: undefined });
        expect(getSignaturesMock.mock.calls[1][1]).toEqual({ limit: 1000, before: 'page1_last_sig' });
      });

      it('returns null txHash safely when RPC signature fetch fails or verification fails', async () => {
        getAccountInfoMock.mockResolvedValue({ data: Buffer.from([]) });

        // Scenario 1: RPC Failure
        getSignaturesMock.mockRejectedValueOnce(new Error('RPC node timed out'));

        let result = await service.recordDonation({
          donationId: '123e4567-e89b-12d3-a456-426614174000',
          donorUserId: 'user-2',
          ngoId: 'ngo-2',
          campaignId: '',
          amountInr: 100,
          currency: 'INR',
          timestamp: new Date()
        });

        expect(result.success).toBe(true);
        expect(result.txHash).toBeNull();

        // Scenario 2: Verification fails (wrong instruction)
        getSignaturesMock.mockReset().mockResolvedValueOnce([{ signature: 'fake_creation' }]);
        const getParsedTransactionMock = jest.spyOn((service as any).connection, 'getParsedTransaction').mockResolvedValue({
          meta: { err: null },
          transaction: {
            message: {
              instructions: [{
                programId: new PublicKey(dummyProgramId),
                accounts: [],
                data: '1'  // valid bs58 (encodes [0x00]); coder.decode is mocked so decoded value is irrelevant
              }]
            }
          }
        } as any);

        (service as any).program.coder = {
        instruction: {
            decode: jest.fn().mockReturnValue({ name: 'updateStatus' })
          }
        };

        result = await service.recordDonation({
          donationId: '123e4567-e89b-12d3-a456-426614174001',
          donorUserId: 'user-3',
          ngoId: 'ngo-3',
          campaignId: '',
          amountInr: 100,
          currency: 'INR',
          timestamp: new Date()
        });

        expect(result.success).toBe(true);
        expect(result.txHash).toBeNull();
      });
    });
  });
});
