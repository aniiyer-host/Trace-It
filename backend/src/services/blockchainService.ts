import {
  Connection,
  Keypair,
  PublicKey,
  clusterApiUrl,
  Commitment,
} from '@solana/web3.js';
import * as anchor from '@coral-xyz/anchor';
import { HashService } from './hashService';
import path from 'path';
import fs from 'fs';

// ─── Types ───────────────────────────────────────────────────

export interface RecordDonationParams {
  donationId: string;       // UUID from Postgres
  donorUserId: string;      // Raw userId — will be hashed before sending on-chain
  ngoId: string;            // NGO profile ID
  campaignId: string;       // Campaign ID
  amountInr: number;        // Amount in INR (e.g., 500.00)
  currency: string;         // "INR"
  timestamp: Date;          // When the donation was confirmed
}

export interface BlockchainResult {
  success: boolean;
  txHash: string | null;
  error?: string;
}

export interface DonationOnChainData {
  donationId: string;
  donorIdHash: string;
  ngoId: string;
  campaignId: string;
  amountPaisa: number;
  currency: string;
  timestamp: number;
  status: number;
  recordHash: string;
}

// ─── Status Enum (mirrors on-chain u8 values) ───────────────

export const OnChainStatus = {
  INITIATED: 0,
  SUCCESS: 1,
  ALLOCATED: 2,
  DISBURSED: 3,
  DELIVERED: 4,
} as const;

// ─── Service Class ──────────────────────────────────────────

export class BlockchainService {
  private connection: Connection;
  private wallet: Keypair;
  private programId: PublicKey;
  private provider: anchor.AnchorProvider;
  private program: anchor.Program | null;
  private hmacSecret: string;

  constructor(config: {
    rpcUrl?: string;
    walletKeypairPath?: string;   // Path to JSON keypair file
    walletKeypairJson?: number[]; // Or raw keypair bytes
    programId: string;
    hmacSecret: string;           // For hashing donor IDs
    commitment?: Commitment;
  }) {
    // Connection
    this.connection = new Connection(
      config.rpcUrl || clusterApiUrl('devnet'),
      config.commitment || 'confirmed'
    );

    // Wallet
    if (config.walletKeypairJson) {
      this.wallet = Keypair.fromSecretKey(
        Uint8Array.from(config.walletKeypairJson)
      );
    } else {
      // Load from file — in production, use secrets manager
      const keyData = JSON.parse(
        fs.readFileSync(config.walletKeypairPath!, 'utf-8')
      );
      this.wallet = Keypair.fromSecretKey(Uint8Array.from(keyData));
    }

    // Program
    this.programId = new PublicKey(config.programId);
    this.hmacSecret = config.hmacSecret;

    // Anchor provider
    const walletAdapter = new anchor.Wallet(this.wallet);
    this.provider = new anchor.AnchorProvider(
      this.connection,
      walletAdapter,
      { commitment: config.commitment || 'confirmed' }
    );

    // Program will be set after init()
    this.program = null;
  }

  /**
   * Initialize the program instance with the IDL.
   * Call this once after construction.
   */
  async init(idlPath: string): Promise<void> {
    const idl = JSON.parse(fs.readFileSync(idlPath, 'utf-8'));
    this.program = new anchor.Program(idl, this.provider);
  }

  /**
   * Record a confirmed donation on-chain.
   * This is the primary integration point called after Razorpay webhook confirmation.
   *
   * Idempotent: If the donation already exists on-chain, returns success with the existing tx.
   */
  async recordDonation(params: RecordDonationParams): Promise<BlockchainResult> {
    if (!this.program) {
      throw new Error('BlockchainService not initialized. Call init() first.');
    }

    try {
      // 1. Hash the donor ID (never send raw userId on-chain)
      const donorIdHash = HashService.hmacSha512(
        params.donorUserId,
        this.hmacSecret
      );

      // 2. Convert amount to paisa (integer)
      const amountPaisa = Math.round(params.amountInr * 100);

      // 3. Compute the record hash for tamper detection
      const unixTimestamp = Math.floor(params.timestamp.getTime() / 1000);
      const recordHash = HashService.sha512(
        `${params.donationId}|${amountPaisa}|${unixTimestamp}|${params.ngoId}|${donorIdHash}`
      );

      // 4. Derive the PDA (remove dashes from donationId)
      const cleanDonationId = params.donationId.replace(/-/g, '');
      const [donationPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('donation'), Buffer.from(cleanDonationId, 'utf8')],
        this.programId
      );

      // 5. Check if already exists (idempotency)
      const existingAccount = await this.connection.getAccountInfo(donationPda);
      if (existingAccount) {
        // Already recorded — return success
        return {
          success: true,
          txHash: `already_recorded:${donationPda.toBase58()}`,
        };
      }

      // 6. Submit the transaction
      const tx = await this.program.methods
        .recordDonation(
          params.donationId,
          donorIdHash,
          params.ngoId,
          params.campaignId,
          new anchor.BN(amountPaisa),
          params.currency,
          new anchor.BN(unixTimestamp),
          recordHash
        )
        .accounts({
          donationRecord: donationPda,
          authority: this.wallet.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc({ commitment: 'confirmed' });

      return { success: true, txHash: tx };
    } catch (error: any) {
      // Handle "already in use" as idempotent success
      if (error.message?.includes('already in use')) {
        const [donationPda] = PublicKey.findProgramAddressSync(
          [Buffer.from('donation'), Buffer.from(params.donationId)],
          this.programId
        );
        return {
          success: true,
          txHash: `already_recorded:${donationPda.toBase58()}`,
        };
      }

      console.error('[BlockchainService] recordDonation failed:', error);
      return {
        success: false,
        txHash: null,
        error: error.message || 'Unknown blockchain error',
      };
    }
  }

  /**
   * Update the status of a donation on-chain.
   * Enforces valid transitions: SUCCESS→ALLOCATED→DISBURSED→DELIVERED
   */
  async updateDonationStatus(
    donationId: string,
    newStatus: number
  ): Promise<BlockchainResult> {
    if (!this.program) {
      throw new Error('BlockchainService not initialized. Call init() first.');
    }

    try {
      // 2. Derive the PDA (remove dashes from donationId)
      const cleanDonationId = donationId.replace(/-/g, '');
      const [donationPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('donation'), Buffer.from(cleanDonationId, 'utf8')],
        this.programId
      );

      const tx = await this.program.methods
        .updateDonationStatus(donationId, newStatus)
        .accounts({
          donationRecord: donationPda,
          authority: this.wallet.publicKey,
        })
        .rpc({ commitment: 'confirmed' });

      return { success: true, txHash: tx };
    } catch (error: any) {
      console.error('[BlockchainService] updateDonationStatus failed:', error);
      return {
        success: false,
        txHash: null,
        error: error.message || 'Unknown blockchain error',
      };
    }
  }

  /**
   * Fetch a donation record from the chain for verification.
   */
  async getDonationRecord(donationId: string): Promise<DonationOnChainData | null> {
    if (!this.program) {
      throw new Error('BlockchainService not initialized. Call init() first.');
    }

    try {
      // Remove dashes from donationId for PDA derivation (must match on-chain program)
      const cleanDonationId = donationId.replace(/-/g, '');
      const [donationPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('donation'), Buffer.from(cleanDonationId, 'utf8')],
        this.programId
      );

      // Fetch the account info
      const accountInfo = await this.connection.getAccountInfo(donationPda);
      if (!accountInfo) {
        return null; // Account doesn't exist
      }

      // Decode the account data using the program's coder
      const account = this.program.coder.accounts.decode('donationRecord', accountInfo.data);
      return {
        donationId: account.donationId,
        donorIdHash: account.donorIdHash,
        ngoId: account.ngoId,
        campaignId: account.campaignId,
        amountPaisa: (account.amountPaisa as anchor.BN).toNumber(),
        currency: account.currency,
        timestamp: (account.timestamp as anchor.BN).toNumber(),
        status: account.status,
        recordHash: account.recordHash,
      };
    } catch (error) {
      console.error('[BlockchainService] getDonationRecord failed:', error);
      return null; // Account doesn't exist or failed to decode
    }
  }

  /**
   * Verify a donation's integrity by recomputing the hash and comparing to on-chain.
   */
  async verifyDonationIntegrity(
    donationId: string,
    donorUserId: string,
    amountInr: number,
    ngoId: string,
    timestamp: Date
  ): Promise<{ valid: boolean; onChainHash: string | null; computedHash: string }> {
    const donorIdHash = HashService.hmacSha512(donorUserId, this.hmacSecret);
    const amountPaisa = Math.round(amountInr * 100);
    const unixTimestamp = Math.floor(timestamp.getTime() / 1000);
    const computedHash = HashService.sha512(
      `${donationId}|${amountPaisa}|${unixTimestamp}|${ngoId}|${donorIdHash}`
    );

    const onChainData = await this.getDonationRecord(donationId);
    if (!onChainData) {
      return { valid: false, onChainHash: null, computedHash };
    }

    return {
      valid: computedHash === onChainData.recordHash,
      onChainHash: onChainData.recordHash,
      computedHash,
    };
  }

  /**
   * Get the Solana Explorer URL for a transaction.
   */
  getExplorerUrl(txHash: string, cluster: string = 'devnet'): string {
    return `https://explorer.solana.com/tx/${txHash}?cluster=${cluster}`;
  }

  /**
   * Check the service wallet's SOL balance.
   */
  async getWalletBalance(): Promise<number> {
    const balance = await this.connection.getBalance(this.wallet.publicKey);
    return balance / 1e9; // Convert lamports to SOL
  }

  /**
   * Register an NGO on-chain.
   * Called after NGO approval in the backend.
   */
  async registerNgo(params: RegisterNgoParams): Promise<BlockchainResult> {
    if (!this.program) {
      throw new Error('BlockchainService not initialized. Call init() first.');
    }

    try {
      // Derive the PDA (remove dashes from ngoId)
      const cleanNgoId = params.ngoId.replace(/-/g, '');
      const [ngoPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('ngo'), Buffer.from(cleanNgoId, 'utf8')],
        this.programId
      );

      const tx = await this.program.methods
        .registerNgo(params.ngoId, params.metadataHash)
        .accounts({
          ngoRecord: ngoPda,
          authority: this.wallet.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc({ commitment: 'confirmed' });

      return { success: true, txHash: tx };
    } catch (error: any) {
      // Check if the error is due to account already existing (idempotency case)
      if (error instanceof anchor.errors.SendTransactionError &&
          error.logs?.some(log => log.includes('already in use'))) {
        console.log('[BlockchainService] registerNgo: Account already exists, treating as success (idempotent)');
        return { success: true, txHash: null };
      }

      console.error('[BlockchainService] registerNgo failed:', error);
      return {
        success: false,
        txHash: null,
        error: error.message || 'Unknown blockchain error',
      };
    }
  }

  /**
   * Register a cohort on-chain.
   * Called after NGO uploads proof documents.
   */
  async registerCohort(params: RegisterCohortParams): Promise<BlockchainResult> {
    if (!this.program) {
      throw new Error('BlockchainService not initialized. Call init() first.');
    }

    try {
      // Derive the PDA (remove dashes from cohortId)
      const cleanCohortId = params.cohortId.replace(/-/g, '');
      const [cohortPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('cohort'), Buffer.from(cleanCohortId, 'utf8')],
        this.programId
      );

      const tx = await this.program.methods
        .registerCohort(params.cohortId, params.ngoId, params.metadataHash)
        .accounts({
          cohortRecord: cohortPda,
          ngoRecord: await this.getNgoPda(params.ngoId), // Derive NGO PDA for constraint checking
          authority: this.wallet.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc({ commitment: 'confirmed' });

      return { success: true, txHash: tx };
    } catch (error: any) {
      console.error('[BlockchainService] registerCohort failed:', error);
      return {
        success: false,
        txHash: null,
        error: error.message || 'Unknown blockchain error',
      };
    }
  }

  /**
   * Record a disbursement on-chain.
   * Called after platform sends funds to an NGO.
   */
  async recordDisbursement(params: RecordDisbursementParams): Promise<BlockchainResult> {
    if (!this.program) {
      throw new Error('BlockchainService not initialized. Call init() first.');
    }

    try {
      // Derive the PDA (remove dashes from disbursementId)
      const cleanDisbursementId = params.disbursementId.replace(/-/g, '');
      const [disbursementPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('disbursement'), Buffer.from(cleanDisbursementId, 'utf8')],
        this.programId
      );

      const tx = await this.program.methods
        .recordDisbursement(
          params.disbursementId,
          params.ngoId,
          params.cohortId,
          new anchor.BN(params.amountInr * 100), // Convert to paisa
          params.currency,
          new anchor.BN(Math.floor(params.timestamp.getTime() / 1000)),
          params.transactionHash
        )
        .accounts({
          disbursementRecord: disbursementPda,
          ngoRecord: await this.getNgoPda(params.ngoId), // Derive NGO PDA for constraint checking
          authority: this.wallet.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc({ commitment: 'confirmed' });

      return { success: true, txHash: tx };
    } catch (error: any) {
      console.error('[BlockchainService] recordDisbursement failed:', error);
      return {
        success: false,
        txHash: null,
        error: error.message || 'Unknown blockchain error',
      };
    }
  }

  /**
   * Helper method to derive NGO PDA for constraint checking in transactions.
   * Not exposed publicly as it's used internally for account derivation.
   */
  private async getNgoPda(ngoId: string): Promise<PublicKey> {
    const cleanNgoId = ngoId.replace(/-/g, '');
    const [ngoPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('ngo'), Buffer.from(cleanNgoId, 'utf8')],
      this.programId
    );
    return ngoPda;
  }
}

// ─── New Parameter Interfaces ─────────────────────────────────────

export interface RegisterNgoParams {
  ngoId: string;           // NGO profile ID (UUID format)
  metadataHash: string;    // SHA-512 hash of NGO verification documents
}

export interface RegisterCohortParams {
  cohortId: string;        // Cohort ID (UUID format)
  ngoId: string;           // Associated NGO ID
  metadataHash: string;    // SHA-512 hash of cohort proof document bundle
}

export interface RecordDisbursementParams {
  disbursementId: string;  // Disbursement ID (UUID format)
  ngoId: string;           // Recipient NGO ID
  cohortId: string;        // Associated cohort ID
  amountInr: number;       // Amount in INR
  currency: string;        // Currency code (typically "INR")
  timestamp: Date;         // When disbursement was made
  transactionHash: string; // Transaction hash of the actual funds transfer
}