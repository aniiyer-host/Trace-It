import { PublicKey } from "@solana/web3.js";
import {
  AnchorAccountError,
  AnchorValidationError,
  anchorRecordMatches,
  decodeAnchorRecord,
  deriveAnchorPda as derivePda,
  deriveConfigPda,
  validateAnchorBatch,
} from "./anchorCodec.js";
import type { AnchorChainAdapter } from "./solanaAnchorAdapter.js";
import {
  AnchorAdapterError,
  type AnchorBatch,
  type AnchorCluster,
  type AnchorResult,
} from "./anchorTypes.js";

export interface AnchorServiceConfig {
  programId: PublicKey | string;
  authority: PublicKey | string;
  trustedAuthorities?: Array<PublicKey | string>;
  cluster: AnchorCluster;
  rpcUrl: string;
}

export class AnchorService {
  private readonly programId: PublicKey;
  private readonly authority: PublicKey;
  private readonly trustedAuthorities: PublicKey[];

  constructor(
    private readonly adapter: AnchorChainAdapter,
    private readonly config: AnchorServiceConfig,
  ) {
    this.programId = toPublicKey(config.programId);
    this.authority = toPublicKey(config.authority);
    this.trustedAuthorities = [
      this.authority,
      ...(config.trustedAuthorities ?? []).map(toPublicKey),
    ];
  }

  deriveAnchorPda(batchKey: Uint8Array): PublicKey {
    return derivePda(this.programId, batchKey);
  }

  getAnchorExplorerUrl(signature: string): string {
    const base = `https://explorer.solana.com/tx/${encodeURIComponent(signature)}`;
    if (this.config.cluster === "mainnet-beta") return base;
    if (this.config.cluster === "devnet" || this.config.cluster === "testnet") {
      return `${base}?cluster=${this.config.cluster}`;
    }
    return `${base}?cluster=custom&customUrl=${encodeURIComponent(this.config.rpcUrl)}`;
  }

  async fetchAnchorRecord(batchKey: Uint8Array): Promise<AnchorResult> {
    let pda: PublicKey;
    try {
      pda = this.deriveAnchorPda(batchKey);
    } catch (error) {
      return invalidInput(error);
    }

    try {
      const account = await this.adapter.getAccountInfo(pda);
      if (!account) return { status: "NOT_FOUND", pda: pda.toBase58() };
      const record = decodeAnchorRecord(
        pda,
        account,
        this.programId,
        this.trustedAuthorities,
      );
      return { status: "CONFIRMED", pda: pda.toBase58(), record };
    } catch (error) {
      if (error instanceof AnchorAccountError) {
        const status = error.message.includes("unsupported schemaVersion")
          ? "UNSUPPORTED_SCHEMA_VERSION"
          : "ACCOUNT_INVALID";
        return { status, pda: pda.toBase58(), error: error.message };
      }
      return classifyAdapterFailure(error, pda);
    }
  }

  async verifyAnchorRecord(batch: AnchorBatch): Promise<AnchorResult> {
    try {
      validateAnchorBatch(batch);
    } catch (error) {
      return invalidInput(error);
    }
    const fetched = await this.fetchAnchorRecord(batch.batchKey);
    if (fetched.status !== "CONFIRMED" || !fetched.record) return fetched;
    if (!anchorRecordMatches(fetched.record, batch)) {
      return {
        status: "INTEGRITY_CONFLICT",
        pda: fetched.pda,
        record: fetched.record,
        error: "existing anchor fields do not match the requested batch",
      };
    }
    return fetched;
  }

  async submitAnchorBatch(batch: AnchorBatch): Promise<AnchorResult> {
    try {
      validateAnchorBatch(batch);
    } catch (error) {
      return invalidInput(error);
    }

    const pda = this.deriveAnchorPda(batch.batchKey);
    const existing = await this.fetchAnchorRecord(batch.batchKey);
    if (existing.status === "CONFIRMED" && existing.record) {
      if (!anchorRecordMatches(existing.record, batch)) {
        return {
          status: "INTEGRITY_CONFLICT",
          pda: pda.toBase58(),
          record: existing.record,
          error: "existing anchor fields do not match the requested batch",
        };
      }
      return {
        ...existing,
        status: "ALREADY_CONFIRMED_MATCH",
      };
    }
    if (existing.status !== "NOT_FOUND") return existing;

    try {
      const signature = await this.adapter.submitRecordAnchor({
        batch,
        programId: this.programId,
        configPda: deriveConfigPda(this.programId),
        anchorPda: pda,
        authority: this.authority,
      });
      return {
        status: "CONFIRMED",
        pda: pda.toBase58(),
        signature,
        explorerUrl: this.getAnchorExplorerUrl(signature),
      };
    } catch (error) {
      return classifyAdapterFailure(error, pda);
    }
  }

  async reconcileAnchorSubmission(batch: AnchorBatch): Promise<AnchorResult> {
    const verified = await this.verifyAnchorRecord(batch);
    if (verified.status === "NOT_FOUND") {
      return {
        status: "PENDING_CONFIRMATION",
        pda: verified.pda,
        error: "anchor account is not visible yet; do not resubmit before retrying reconciliation",
      };
    }
    return verified;
  }
}

function toPublicKey(value: PublicKey | string): PublicKey {
  return value instanceof PublicKey ? value : new PublicKey(value);
}

function invalidInput(error: unknown): AnchorResult {
  const message = error instanceof Error ? error.message : String(error);
  return { status: "INVALID_INPUT", error: message };
}

function classifyAdapterFailure(
  error: unknown,
  pda?: PublicKey,
): AnchorResult {
  const pdaString = pda?.toBase58();
  if (error instanceof AnchorValidationError) return invalidInput(error);
  if (!(error instanceof AnchorAdapterError)) {
    return {
      status: "RETRYABLE_RPC_FAILURE",
      pda: pdaString,
      error: error instanceof Error ? error.message : String(error),
    };
  }
  const status = {
    RPC: "RETRYABLE_RPC_FAILURE",
    BLOCKHASH: "RETRYABLE_BLOCKHASH_FAILURE",
    SIMULATION: "PROGRAM_REJECTED",
    PROGRAM: "PROGRAM_REJECTED",
    UNAUTHORIZED: "UNAUTHORIZED",
    CONFIRMATION: "PENDING_CONFIRMATION",
  } as const;
  return {
    status: status[error.kind],
    pda: pdaString,
    signature: error.signature,
    error: error.message,
  };
}
