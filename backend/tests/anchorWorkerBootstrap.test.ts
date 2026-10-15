import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Keypair } from "@solana/web3.js";

import { createAnchorRuntimeFromEnvironment } from "../src/services/anchor/anchorWorkerBootstrap.js";

const anchorEnvironment = {
  TRACEIT_ANCHOR_RPC_URL: "http://127.0.0.1:8899",
  TRACEIT_ANCHOR_WALLET_KEYPAIR_PATH: "",
  TRACEIT_ANCHOR_PROGRAM_ID: "4qLwniS2NeDrqftgb83GbYVHWVbBBbUcjDR1Ncm5GCHX",
  TRACEIT_ANCHOR_CLUSTER: "localnet",
};

function databaseWithSchema(columns: Array<{ tableName: string; columnName: string }>) {
  return {
    $queryRaw: jest.fn().mockResolvedValue(columns),
  } as unknown as NonNullable<
    Parameters<typeof createAnchorRuntimeFromEnvironment>[1]
  >;
}

const requiredColumns = [
  "anchor_batches.id",
  "anchor_batches.batchKey",
  "anchor_batches.auditRoot",
  "anchor_batches.startSequence",
  "anchor_batches.endSequence",
  "anchor_batches.eventCount",
  "anchor_batches.status",
  "anchor_batches.attemptCount",
  "anchor_batches.reconciliationCount",
  "anchor_batches.nextAttemptAt",
  "anchor_batches.claimToken",
  "anchor_batches.claimExpiresAt",
  "anchor_batches.anchorPda",
  "anchor_batches.lastError",
  "anchor_batches.solanaTxSignature",
  "anchor_batches.anchoredAt",
  "provenance_events.chainHash",
  "provenance_events.anchorBatchId",
  "provenance_events.anchorStatus",
].map((column) => {
  const [tableName, columnName] = column.split(".");
  return { tableName, columnName };
});

describe("anchor runtime bootstrap", () => {
  let consoleWarn: jest.SpyInstance;
  let consoleError: jest.SpyInstance;

  beforeEach(() => {
    consoleWarn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    consoleError = jest.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleWarn.mockRestore();
    consoleError.mockRestore();
  });

  it("disables anchoring when configuration is incomplete", async () => {
    await expect(
      createAnchorRuntimeFromEnvironment({
        TRACEIT_ANCHOR_RPC_URL: "http://127.0.0.1:8899",
      }),
    ).resolves.toBeNull();
  });

  it("disables anchoring clearly when the durable migration is missing", async () => {
    const walletDir = fs.mkdtempSync(path.join(os.tmpdir(), "traceit-anchor-"));
    const walletPath = path.join(walletDir, "wallet.json");
    fs.writeFileSync(walletPath, JSON.stringify(Array.from(Keypair.generate().secretKey)));
    const database = databaseWithSchema([]);

    await expect(
      createAnchorRuntimeFromEnvironment(
        { ...anchorEnvironment, TRACEIT_ANCHOR_WALLET_KEYPAIR_PATH: walletPath },
        database,
      ),
    ).resolves.toBeNull();

    expect(database.$queryRaw).toHaveBeenCalledTimes(1);
    fs.rmSync(walletDir, { recursive: true, force: true });
  });

  it("creates the runtime only when configuration and schema are ready", async () => {
    const walletDir = fs.mkdtempSync(path.join(os.tmpdir(), "traceit-anchor-"));
    const walletPath = path.join(walletDir, "wallet.json");
    fs.writeFileSync(walletPath, JSON.stringify(Array.from(Keypair.generate().secretKey)));
    const database = databaseWithSchema(requiredColumns);

    const runtime = await createAnchorRuntimeFromEnvironment(
      { ...anchorEnvironment, TRACEIT_ANCHOR_WALLET_KEYPAIR_PATH: walletPath },
      database,
    );

    expect(runtime).not.toBeNull();
    await runtime?.stop();
    fs.rmSync(walletDir, { recursive: true, force: true });
  });
});
