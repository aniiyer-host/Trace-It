import {
  Connection,
  Keypair,
  PublicKey,
  clusterApiUrl,
  Commitment,
} from '@solana/web3.js';
import * as anchor from '@coral-xyz/anchor';
import { HashService } from './hashService';
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
  private program: anchor.Program | null = null;
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
    } else if (config.walletKeypairPath) {
      const keyData = JSON.parse(
        fs.readFileSync(config.walletKeypairPath, 'utf-8')
      );
      this.wallet = Keypair.fromSecretKey(Uint8Array.from(keyData));
    } else {
      throw new Error('Either walletKeypairPath or walletKeypairJson must be provided');
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
  }

  /**
   * Initialize the program instance with the IDL.
   * Call this once after construction.
   */
  async init(idlPathOrObject: string | anchor.Idl): Promise<void> {
    let idl: anchor.Idl;
    if (typeof idlPathOrObject === 'string') {
      idl = JSON.parse(fs.readFileSync(idlPathOrObject, 'utf-8'));
    } else {
      idl = idlPathOrObject;
    }
    this.program = new anchor.Program(idl, this.provider);
  }

  /**
   * Record a confirmed donation on-chain.
   * Idempotent: If the donation already exists on-chain, returns success with existing PDA info.
   */
  async recordDonation(params: RecordDonationParams): Promise<BlockchainResult> {
    if (!this.program) {
      throw new Error('BlockchainService has not been initialized with IDL. Call init() first.');
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

      // 4. Derive the PDA - remove dashes to match on-chain program
      const cleanId = params.donationId.replace(/-/g, '');
      const [donationPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('donation'), Buffer.from(cleanId)],
        this.programId
      );

      // 5. Check if already exists (idempotency)
      const existingAccount = await this.connection.getAccountInfo(donationPda);
      if (existingAccount) {
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
      if (error.message?.includes('already in use')) {
        // Use cleanId (without dashes) to match on-chain program derivation
        const cleanId = params.donationId.replace(/-/g, '');
        const [donationPda] = PublicKey.findProgramAddressSync(
          [Buffer.from('donation'), Buffer.from(cleanId)],
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
      throw new Error('BlockchainService has not been initialized with IDL. Call init() first.');
    }

    try {
      // Remove dashes to match on-chain program PDA derivation
      const cleanId = donationId.replace(/-/g, '');
      const [donationPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('donation'), Buffer.from(cleanId)],
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
      throw new Error('BlockchainService has not been initialized with IDL. Call init() first.');
    }

    try {
      // Remove dashes to match on-chain program PDA derivation
      const cleanId = donationId.replace(/-/g, '');
      const [donationPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('donation'), Buffer.from(cleanId)],
        this.programId
      );

      const account = await (this.program.account as any)['donationRecord'].fetch(donationPda);
      return {
        donationId: account['donationId'] as string,
        donorIdHash: account['donorIdHash'] as string,
        ngoId: account['ngoId'] as string,
        campaignId: account['campaignId'] as string,
        amountPaisa: (account['amountPaisa'] as any).toNumber(),
        currency: account['currency'] as string,
        timestamp: (account['timestamp'] as any).toNumber(),
        status: account['status'] as number,
        recordHash: account['recordHash'] as string,
      };
    } catch {
      return null;
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
    return balance / 1e9;
  }
}
