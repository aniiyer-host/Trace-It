import { PublicKey } from "@solana/web3.js";
import type { AnchorRecord } from "./anchorTypes.js";
import type { AnchorBatch, AnchorResult } from "./anchorTypes.js";

export type PublicAnchorVerificationStatus =
  | "VERIFIED"
  | "LOCAL_VALID_PENDING_ANCHOR"
  | "ANCHOR_NOT_FOUND"
  | "ANCHOR_MISMATCH"
  | "ANCHOR_ACCOUNT_INVALID"
  | "RPC_UNAVAILABLE"
  | "UNSUPPORTED_SCHEMA_VERSION";

export type PublicAnchorLifecycleState =
  | "PENDING"
  | "SUBMITTING"
  | "RETRYABLE"
  | "RECONCILIATION_REQUIRED"
  | "CONFIRMED"
  | "TERMINAL_FAILURE"
  | "DEAD_LETTER";

export interface LocallyVerifiedAnchorBatch {
  localVerification: "VERIFIED";
  batch: AnchorBatch;
  anchorState: PublicAnchorLifecycleState;
  transactionSignature?: string;
}

export interface PublicAnchorVerificationResult {
  status: PublicAnchorVerificationStatus;
  pda?: string;
  record?: PublicAnchorRecord;
  signature?: string;
  explorerUrl?: string;
  transactionSlot?: number;
  error?: string;
}

export interface PublicAnchorRecord {
  batchKeyHex: string;
  auditRootHex: string;
  startSequence: string;
  endSequence: string;
  eventCount: number;
  schemaVersion: number;
  authority: string;
  anchoredAt: string;
}

export type AnchorTransactionVerification =
  | { status: "CONFIRMED"; slot: number }
  | { status: "PENDING" }
  | { status: "NOT_FOUND" }
  | { status: "INVALID"; error: string };

export interface AnchorRecordVerifier {
  verifyAnchorRecord(batch: AnchorBatch): Promise<AnchorResult>;
  getAnchorExplorerUrl(signature: string): string;
}

export interface AnchorTransactionVerifier {
  verifyTransaction(
    signature: string,
    anchorPda: PublicKey,
    authority: PublicKey,
  ): Promise<AnchorTransactionVerification>;
}

export interface AnchorVerificationPolicy {
  requireTransactionMetadata: boolean;
}

const PENDING_STATES = new Set<PublicAnchorLifecycleState>([
  "PENDING",
  "SUBMITTING",
  "RETRYABLE",
  "RECONCILIATION_REQUIRED",
]);

export class AnchorVerificationService {
  private readonly policy: AnchorVerificationPolicy;

  constructor(
    private readonly records: AnchorRecordVerifier,
    private readonly transactions?: AnchorTransactionVerifier,
    policy: Partial<AnchorVerificationPolicy> = {},
  ) {
    this.policy = { requireTransactionMetadata: false, ...policy };
    if (this.policy.requireTransactionMetadata && !transactions) {
      throw new Error(
        "transaction metadata verification requires an AnchorTransactionVerifier",
      );
    }
  }

  async verify(
    input: LocallyVerifiedAnchorBatch,
  ): Promise<PublicAnchorVerificationResult> {
    if (input.localVerification !== "VERIFIED") {
      return {
        status: "ANCHOR_ACCOUNT_INVALID",
        error: "blockchain verification requires a locally verified batch",
      };
    }

    let result: AnchorResult;
    try {
      result = await this.records.verifyAnchorRecord(input.batch);
    } catch (error) {
      return {
        status: "RPC_UNAVAILABLE",
        error: errorMessage(error),
      };
    }

    if (result.status === "NOT_FOUND" || result.status === "PENDING_CONFIRMATION") {
      return {
        status: PENDING_STATES.has(input.anchorState)
          ? "LOCAL_VALID_PENDING_ANCHOR"
          : "ANCHOR_NOT_FOUND",
        pda: result.pda,
        error: result.error,
      };
    }
    if (result.status === "INTEGRITY_CONFLICT") {
      return {
        status: "ANCHOR_MISMATCH",
        pda: result.pda,
        record: result.record ? toPublicRecord(result.record) : undefined,
        error: result.error,
      };
    }
    if (
      result.status === "UNSUPPORTED_SCHEMA_VERSION" ||
      (result.status === "INVALID_INPUT" &&
        result.error?.includes("unsupported schemaVersion"))
    ) {
      return {
        status: "UNSUPPORTED_SCHEMA_VERSION",
        pda: result.pda,
        error: result.error,
      };
    }
    if (
      result.status === "RETRYABLE_RPC_FAILURE" ||
      result.status === "RETRYABLE_BLOCKHASH_FAILURE"
    ) {
      return {
        status: "RPC_UNAVAILABLE",
        pda: result.pda,
        error: result.error,
      };
    }
    if (result.status !== "CONFIRMED" && result.status !== "ALREADY_CONFIRMED_MATCH") {
      return {
        status: "ANCHOR_ACCOUNT_INVALID",
        pda: result.pda,
        error: result.error ?? `anchor verification failed with ${result.status}`,
      };
    }
    if (!result.record || !result.pda) {
      return {
        status: "ANCHOR_ACCOUNT_INVALID",
        pda: result.pda,
        error: "verified anchor result is missing its decoded record or PDA",
      };
    }

    const publicRecord = toPublicRecord(result.record);
    const verified: PublicAnchorVerificationResult = {
      status: "VERIFIED",
      pda: result.pda,
      record: publicRecord,
    };
    if (!input.transactionSignature) {
      if (this.policy.requireTransactionMetadata) {
        return {
          status: "ANCHOR_MISMATCH",
          pda: result.pda,
          record: publicRecord,
          error: "confirmed anchor is missing its transaction signature",
        };
      }
      return verified;
    }
    if (!this.transactions) return verified;

    let transaction: AnchorTransactionVerification;
    try {
      transaction = await this.transactions.verifyTransaction(
        input.transactionSignature,
        new PublicKey(result.pda),
        result.record.authority,
      );
    } catch (error) {
      return {
        status: "RPC_UNAVAILABLE",
        pda: result.pda,
        record: publicRecord,
        error: errorMessage(error),
      };
    }

    if (transaction.status === "PENDING") {
      return {
        status: "LOCAL_VALID_PENDING_ANCHOR",
        pda: result.pda,
        record: publicRecord,
      };
    }
    if (transaction.status === "NOT_FOUND") {
      return {
        status: "ANCHOR_MISMATCH",
        pda: result.pda,
        record: publicRecord,
        error: "the stored transaction signature was not found",
      };
    }
    if (transaction.status === "INVALID") {
      return {
        status: "ANCHOR_MISMATCH",
        pda: result.pda,
        record: publicRecord,
        error: transaction.error,
      };
    }
    return {
      ...verified,
      signature: input.transactionSignature,
      explorerUrl: this.records.getAnchorExplorerUrl(input.transactionSignature),
      transactionSlot: transaction.slot,
    };
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function toPublicRecord(record: AnchorRecord): PublicAnchorRecord {
  return {
    batchKeyHex: Buffer.from(record.batchKey).toString("hex"),
    auditRootHex: Buffer.from(record.auditRoot).toString("hex"),
    startSequence: record.startSequence.toString(),
    endSequence: record.endSequence.toString(),
    eventCount: record.eventCount,
    schemaVersion: record.schemaVersion,
    authority: record.authority.toBase58(),
    anchoredAt: record.anchoredAt.toString(),
  };
}
