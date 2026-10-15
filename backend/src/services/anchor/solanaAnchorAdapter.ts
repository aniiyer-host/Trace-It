import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  type AccountInfo,
  type Commitment,
} from "@solana/web3.js";
import { encodeRecordAnchorInstruction } from "./anchorCodec.js";
import {
  AnchorAdapterError,
  type AnchorBatch,
} from "./anchorTypes.js";
import { waitForSignatureConfirmation } from "../solanaRpc.js";

export interface AnchorChainAdapter {
  getAccountInfo(address: PublicKey): Promise<AccountInfo<Buffer> | null>;
  submitRecordAnchor(input: {
    batch: AnchorBatch;
    programId: PublicKey;
    configPda: PublicKey;
    anchorPda: PublicKey;
    authority: PublicKey;
  }): Promise<string>;
}

export class SolanaAnchorAdapter implements AnchorChainAdapter {
  constructor(
    private readonly connection: Connection,
    private readonly authority: Keypair,
    private readonly commitment: Commitment = "confirmed",
    private readonly confirmationPollIntervalMs = 1_000,
    private readonly confirmationTimeoutMs = 60_000,
  ) {}

  getAccountInfo(address: PublicKey): Promise<AccountInfo<Buffer> | null> {
    return this.connection.getAccountInfo(address, this.commitment);
  }

  async submitRecordAnchor(input: {
    batch: AnchorBatch;
    programId: PublicKey;
    configPda: PublicKey;
    anchorPda: PublicKey;
    authority: PublicKey;
  }): Promise<string> {
    if (!input.authority.equals(this.authority.publicKey)) {
      throw new AnchorAdapterError(
        "UNAUTHORIZED",
        "configured authority does not match the transaction signer",
      );
    }

    let signature: string | undefined;
    try {
      const latest = await this.connection.getLatestBlockhash(this.commitment);
      const instruction = new TransactionInstruction({
        programId: input.programId,
        keys: [
          { pubkey: input.configPda, isSigner: false, isWritable: false },
          { pubkey: input.anchorPda, isSigner: false, isWritable: true },
          { pubkey: input.authority, isSigner: true, isWritable: true },
          {
            pubkey: SystemProgram.programId,
            isSigner: false,
            isWritable: false,
          },
        ],
        data: encodeRecordAnchorInstruction(input.batch),
      });
      const transaction = new Transaction({
        feePayer: this.authority.publicKey,
        blockhash: latest.blockhash,
        lastValidBlockHeight: latest.lastValidBlockHeight,
      }).add(instruction);
      transaction.sign(this.authority);

      const simulation = await this.connection.simulateTransaction(transaction);
      if (simulation.value.err) {
        const logs = simulation.value.logs?.join("\n") ?? "no program logs";
        const kind = /Unauthorized|custom program error: 0x1770|\b6000\b/.test(logs)
          ? "UNAUTHORIZED"
          : "SIMULATION";
        throw new AnchorAdapterError(
          kind,
          `anchor simulation failed: ${JSON.stringify(simulation.value.err)}; ${logs}`,
        );
      }

      signature = await this.connection.sendRawTransaction(
        transaction.serialize(),
        {
          skipPreflight: false,
          preflightCommitment: this.commitment,
          maxRetries: 0,
        },
      );
      const confirmation = await this.waitForConfirmation(signature);
      if (confirmation.err) {
        throw new AnchorAdapterError(
          "PROGRAM",
          `anchor transaction was rejected: ${JSON.stringify(confirmation.err)}`,
          undefined,
          signature,
        );
      }
      return signature;
    } catch (error) {
      if (error instanceof AnchorAdapterError) throw error;
      const message = error instanceof Error ? error.message : String(error);
      if (signature) {
        throw new AnchorAdapterError(
          "CONFIRMATION",
          `submission ${signature} has an ambiguous confirmation result: ${message}`,
          error,
          signature,
        );
      }
      if (/blockhash|block height|expired/i.test(message)) {
        throw new AnchorAdapterError("BLOCKHASH", message, error);
      }
      throw new AnchorAdapterError("RPC", message, error);
    }
  }

  private async waitForConfirmation(signature: string): Promise<{ err: unknown | null }> {
    try {
      return await waitForSignatureConfirmation(
        this.connection,
        signature,
        this.commitment,
        {
          pollIntervalMs: this.confirmationPollIntervalMs,
          timeoutMs: this.confirmationTimeoutMs,
        },
      );
    } catch (error) {
      throw new AnchorAdapterError(
        "CONFIRMATION",
        `submission ${signature} has an ambiguous confirmation result: ${error instanceof Error ? error.message : String(error)}`,
        error,
        signature,
      );
    }
  }
}
