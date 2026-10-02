import {
  BlockchainService,
  type AttestationOnChainData,
  type CohortOnChainData,
  type DisbursementOnChainData,
  type DonationOnChainData,
  type NgoOnChainData,
} from './blockchainService';
import path from 'path';

export const LEGACY_TRACEIT_PROGRAM_ID =
  '5fj53usXqFvfah3x7rYo6BxQnrvBprBZsGU49XhQxzV3';

export interface LegacyBlockchainReader {
  getDonationRecord(donationId: string): Promise<DonationOnChainData | null>;
  getNgoRecord(ngoId: string): Promise<NgoOnChainData | null>;
  getCohortRecord(cohortId: string): Promise<CohortOnChainData | null>;
  getDisbursementRecord(
    disbursementId: string,
  ): Promise<DisbursementOnChainData | null>;
  getAttestation(
    donationId: string,
    ngoId: string,
    attestationType?: 'receipt' | 'delivery',
  ): Promise<AttestationOnChainData | null>;
}

let readerInstance: LegacyBlockchainReader | null = null;
let writeRetirementWarningEmitted = false;

/**
 * @deprecated Phase 6 permanently closed the application legacy-write gateway.
 * Use the Phase 2 anchor service for new writes or getLegacyBlockchainReader()
 * for historical reads.
 */
export async function getBlockchainService(): Promise<BlockchainService | null> {
  if (!writeRetirementWarningEmitted) {
    console.warn(
      '[Blockchain] Legacy write service retired; individual business-event writes are disabled.',
    );
    writeRetirementWarningEmitted = true;
  }
  return null;
}

/**
 * Construct the read-only compatibility surface for historical legacy accounts.
 * The returned object intentionally exposes no write methods.
 */
export async function getLegacyBlockchainReader(): Promise<LegacyBlockchainReader | null> {
  if (readerInstance) return readerInstance;

  if (!process.env.SOLANA_RPC_URL) {
    console.warn(
      '[Blockchain] SOLANA_RPC_URL not configured — historical legacy reads are disabled.',
    );
    return null;
  }

  const service = new BlockchainService({
    rpcUrl: process.env.SOLANA_RPC_URL,
    walletKeypairJson: Array.from(
      (await import('@solana/web3.js')).Keypair.generate().secretKey,
    ),
    programId: LEGACY_TRACEIT_PROGRAM_ID,
    hmacSecret: '',
    commitment: 'confirmed',
  });

  // Load the IDL from the blockchain build output
  const idlPath = path.resolve(
    __dirname, '..', '..', '..', 'blockchain', 'idl', 'traceit_legacy.json'
  );
  await service.init(idlPath);

  readerInstance = {
    getDonationRecord: service.getDonationRecord.bind(service),
    getNgoRecord: service.getNgoRecord.bind(service),
    getCohortRecord: service.getCohortRecord.bind(service),
    getDisbursementRecord: service.getDisbursementRecord.bind(service),
    getAttestation: service.getAttestation.bind(service),
  };
  return readerInstance;
}
