import { BlockchainService } from './blockchainService';
import path from 'path';
import { requireEnvironmentVariable } from '../utils/envValidator';

let instance: BlockchainService | null = null;

export async function getBlockchainService(): Promise<BlockchainService> {
  if (instance) return instance;

  // Validate and extract required environment variables
  const rpcUrl = process.env.SOLANA_RPC_URL;
  if (!rpcUrl) {
    throw new Error('Missing required environment variable: SOLANA_RPC_URL');
  }

  const walletKeypairPath = process.env.SOLANA_WALLET_KEYPAIR_PATH;
  if (!walletKeypairPath) {
    throw new Error('Missing required environment variable: SOLANA_WALLET_KEYPAIR_PATH');
  }

  const programId = process.env.SOLANA_PROGRAM_ID;
  if (!programId) {
    throw new Error('Missing required environment variable: SOLANA_PROGRAM_ID');
  }

  const service = new BlockchainService({
    rpcUrl,
    walletKeypairPath,
    programId,
    hmacSecret: requireEnvironmentVariable('BLOCKCHAIN_HMAC_SECRET'),
    commitment: 'confirmed',
  });

  const idlPath = path.resolve(
    __dirname, '..', '..', '..', 'blockchain', 'target', 'idl', 'traceit.json'
  );
  await service.init(idlPath);

  instance = service;
  return instance;
}
