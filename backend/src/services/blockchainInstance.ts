import { BlockchainService } from './blockchainService';
import path from 'path';

let instance: BlockchainService | null = null;

export async function getBlockchainService(): Promise<BlockchainService> {
  if (instance) return instance;

  const service = new BlockchainService({
    rpcUrl: process.env.SOLANA_RPC_URL,
    walletKeypairPath: process.env.SOLANA_WALLET_KEYPAIR_PATH,
    programId: process.env.SOLANA_PROGRAM_ID!,
    hmacSecret: process.env.BLOCKCHAIN_HMAC_SECRET || 'default_blockchain_hmac_secret',
    commitment: 'confirmed',
  });

  const idlPath = path.resolve(
    __dirname, '..', '..', '..', 'blockchain', 'target', 'idl', 'traceit.json'
  );
  await service.init(idlPath);

  instance = service;
  return instance;
}
