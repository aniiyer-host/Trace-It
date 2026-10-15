import fs from "node:fs";
import { Keypair } from "@solana/web3.js";

import { prisma } from "../../db/prisma.js";
import { AnchorBatchScheduler, AnchorBatchService } from "./anchorBatchService.js";
import { AnchorService } from "./anchorService.js";
import { AnchorWorker } from "./anchorWorker.js";
import {
  PrismaAnchorBatchRepository,
  assertAnchorSchemaReady,
} from "./prismaAnchorBatchRepository.js";
import { SolanaAnchorAdapter } from "./solanaAnchorAdapter.js";
import { createSolanaConnection } from "../solanaRpc.js";

export interface AnchorRuntime {
  start(): void;
  processOneBatch(batchId: string): Promise<"IDLE" | "HANDLED" | "FAILED">;
  stop(): Promise<void>;
}

type AnchorEnvironment = NodeJS.ProcessEnv & {
  TRACEIT_ANCHOR_RPC_URL?: string;
  TRACEIT_ANCHOR_WALLET_KEYPAIR_PATH?: string;
  TRACEIT_ANCHOR_PROGRAM_ID?: string;
  TRACEIT_ANCHOR_CLUSTER?: string;
};

const ANCHOR_CLUSTERS = [
  "localnet",
  "devnet",
  "testnet",
  "mainnet-beta",
  "custom",
] as const;

export async function createAnchorRuntimeFromEnvironment(
  environment: AnchorEnvironment = process.env,
  database: typeof prisma = prisma,
): Promise<AnchorRuntime | null> {
  const rpcUrl = environment.TRACEIT_ANCHOR_RPC_URL?.trim();
  const walletKeypairPath = environment.TRACEIT_ANCHOR_WALLET_KEYPAIR_PATH?.trim();
  const programId = environment.TRACEIT_ANCHOR_PROGRAM_ID?.trim();
  const cluster = environment.TRACEIT_ANCHOR_CLUSTER?.trim();

  if (!rpcUrl || !walletKeypairPath || !programId || !cluster) {
    if (rpcUrl || walletKeypairPath || programId || cluster) {
      console.warn(
        "[Blockchain] Anchoring disabled: set TRACEIT_ANCHOR_RPC_URL, TRACEIT_ANCHOR_WALLET_KEYPAIR_PATH, TRACEIT_ANCHOR_PROGRAM_ID, and TRACEIT_ANCHOR_CLUSTER together.",
      );
    } else {
      console.info("[Blockchain] Anchoring disabled: anchor configuration is not present.");
    }
    return null;
  }

  const anchorCluster = ANCHOR_CLUSTERS.find((candidate) => candidate === cluster);
  if (!anchorCluster) {
    console.error("[Blockchain] Anchoring disabled: TRACEIT_ANCHOR_CLUSTER is invalid.");
    return null;
  }
  if (!fs.existsSync(walletKeypairPath)) {
    console.error(
      "[Blockchain] Anchoring disabled: TRACEIT_ANCHOR_WALLET_KEYPAIR_PATH does not exist.",
    );
    return null;
  }

  try {
    await assertAnchorSchemaReady(database);
  } catch (error) {
    console.error(
      "[Blockchain] Anchoring disabled: the durable anchor migration is missing or unavailable.",
      error instanceof Error ? error.message : String(error),
    );
    return null;
  }

  try {
    const walletFile = fs.readFileSync(walletKeypairPath, "utf8");
    const walletJson = JSON.parse(walletFile) as number[] | { secretKey?: number[] };
    const secretKey = Array.isArray(walletJson) ? walletJson : walletJson.secretKey;
    if (!secretKey || !Array.isArray(secretKey)) {
      throw new Error("wallet file does not contain a secret key array");
    }

    const authority = Keypair.fromSecretKey(Uint8Array.from(secretKey));
    const connection = createSolanaConnection(rpcUrl, "confirmed");
    const adapter = new SolanaAnchorAdapter(connection, authority, "confirmed");
    const publisher = new AnchorService(adapter, {
      programId,
      authority: authority.publicKey,
      cluster: anchorCluster,
      rpcUrl,
    });
    const repository = new PrismaAnchorBatchRepository(database);
    const batches = new AnchorBatchService(database);
    const worker = new AnchorWorker("backend-main", repository, publisher);
    const scheduler = new AnchorBatchScheduler(batches);

    return {
      processOneBatch(batchId) {
        return worker.runOnce(batchId);
      },
      start() {
        scheduler.start();
        worker.start();
      },
      async stop() {
        await scheduler.stop();
        await worker.stop();
      },
    };
  } catch (error) {
    console.error(
      "[Blockchain] Anchoring disabled: invalid anchor configuration.",
      error instanceof Error ? error.message : String(error),
    );
    return null;
  }
}
