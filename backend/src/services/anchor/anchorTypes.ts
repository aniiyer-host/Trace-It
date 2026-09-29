import type { PublicKey } from "@solana/web3.js";

export const U64_MAX = (1n << 64n) - 1n;
export const U32_MAX = (1n << 32n) - 1n;
export const SUPPORTED_SCHEMA_VERSION = 1;
export const ANCHOR_RECORD_SIZE = 167;

export interface AnchorBatch {
  batchKey: Uint8Array;
  auditRoot: Uint8Array;
  startSequence: bigint;
  endSequence: bigint;
  eventCount: number;
  schemaVersion: number;
}

export interface AnchorRecord extends AnchorBatch {
  authority: PublicKey;
  anchoredAt: bigint;
  bump: number;
}

export type AnchorResultStatus =
  | "CONFIRMED"
  | "ALREADY_CONFIRMED_MATCH"
  | "PENDING_CONFIRMATION"
  | "NOT_FOUND"
  | "RETRYABLE_RPC_FAILURE"
  | "RETRYABLE_BLOCKHASH_FAILURE"
  | "PROGRAM_REJECTED"
  | "UNAUTHORIZED"
  | "INTEGRITY_CONFLICT"
  | "ACCOUNT_INVALID"
  | "UNSUPPORTED_SCHEMA_VERSION"
  | "INVALID_INPUT";

export interface AnchorResult {
  status: AnchorResultStatus;
  pda?: string;
  signature?: string;
  explorerUrl?: string;
  record?: AnchorRecord;
  error?: string;
}

export type AnchorCluster =
  | "localnet"
  | "devnet"
  | "testnet"
  | "mainnet-beta"
  | "custom";

export type AnchorAdapterErrorKind =
  | "RPC"
  | "BLOCKHASH"
  | "SIMULATION"
  | "PROGRAM"
  | "UNAUTHORIZED"
  | "CONFIRMATION";

export class AnchorAdapterError extends Error {
  constructor(
    public readonly kind: AnchorAdapterErrorKind,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "AnchorAdapterError";
  }
}
