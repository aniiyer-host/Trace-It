import { PublicKey } from "@solana/web3.js";

export const DEVNET_GENESIS_HASH =
  "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG";
export const DEFAULT_MINIMUM_OPERATING_LAMPORTS = 1_000_000_000;
export const PROGRAM_ACCOUNT_BYTES = 36;
export const PROGRAM_DATA_OVERHEAD_BYTES = 45;
export const BUFFER_OVERHEAD_BYTES = 37;
export const CONFIG_ACCOUNT_BYTES = 77;
export const ANCHOR_RECORD_BYTES = 167;

export interface Phase5Identity {
  declaredProgramId: string;
  configuredProgramId?: string;
  deploymentProgramId: string;
  bootstrapAuthority: string;
  feePayer: string;
  upgradeAuthority: string;
}

export interface DeploymentRentBudget {
  programAccountLamports: number;
  programDataLamports: number;
  temporaryBufferLamports: number;
  configAccountLamports: number;
  firstAnchorLamports: number;
  feeReserveLamports: number;
}

export interface OperationalSnapshot {
  authorityBalanceLamports: number;
  minimumAuthorityBalanceLamports: number;
  oldestPendingAgeMs: number;
  pendingCount: number;
  retryingCount: number;
  deadLetterCount: number;
  integrityConflictCount: number;
  rpcFailureRatio: number;
}

export type OperationalSeverity = "warning" | "critical";

export interface OperationalAlert {
  code: string;
  severity: OperationalSeverity;
  value: number;
  threshold: number;
}

export function validatePhase5Identity(identity: Phase5Identity): string[] {
  const errors: string[] = [];
  for (const [field, value] of Object.entries(identity)) {
    if (field === "configuredProgramId" && !value) continue;
    try {
      new PublicKey(value);
    } catch {
      errors.push(`${field} is not a valid Solana public key`);
    }
  }
  if (identity.declaredProgramId !== identity.deploymentProgramId) {
    errors.push("declared program ID does not match the deployment keypair address");
  }
  if (
    identity.configuredProgramId &&
    identity.configuredProgramId !== identity.declaredProgramId
  ) {
    errors.push("Anchor.toml devnet program ID does not match the declared program ID");
  }
  return errors;
}

export function deploymentAccountSizes(binaryBytes: number): {
  program: number;
  programData: number;
  temporaryBuffer: number;
  config: number;
  firstAnchor: number;
} {
  if (!Number.isSafeInteger(binaryBytes) || binaryBytes <= 0) {
    throw new Error("program binary size must be a positive safe integer");
  }
  return {
    program: PROGRAM_ACCOUNT_BYTES,
    programData: binaryBytes * 2 + PROGRAM_DATA_OVERHEAD_BYTES,
    temporaryBuffer: binaryBytes + BUFFER_OVERHEAD_BYTES,
    config: CONFIG_ACCOUNT_BYTES,
    firstAnchor: ANCHOR_RECORD_BYTES,
  };
}

export function deploymentPeakLamports(budget: DeploymentRentBudget): number {
  return Object.values(budget).reduce((sum, value) => {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new Error("rent budget values must be nonnegative safe integers");
    }
    return sum + value;
  }, 0);
}

export function evaluateOperationalSnapshot(
  snapshot: OperationalSnapshot,
): OperationalAlert[] {
  const alerts: OperationalAlert[] = [];
  if (snapshot.authorityBalanceLamports < snapshot.minimumAuthorityBalanceLamports) {
    alerts.push({
      code: "AUTHORITY_BALANCE_LOW",
      severity: "critical",
      value: snapshot.authorityBalanceLamports,
      threshold: snapshot.minimumAuthorityBalanceLamports,
    });
  }
  if (snapshot.oldestPendingAgeMs >= 30 * 60_000) {
    alerts.push({
      code: "ANCHOR_BACKLOG_AGE_CRITICAL",
      severity: "critical",
      value: snapshot.oldestPendingAgeMs,
      threshold: 30 * 60_000,
    });
  } else if (snapshot.oldestPendingAgeMs >= 5 * 60_000) {
    alerts.push({
      code: "ANCHOR_BACKLOG_AGE_WARNING",
      severity: "warning",
      value: snapshot.oldestPendingAgeMs,
      threshold: 5 * 60_000,
    });
  }
  if (snapshot.deadLetterCount > 0) {
    alerts.push({
      code: "ANCHOR_DEAD_LETTER_PRESENT",
      severity: "critical",
      value: snapshot.deadLetterCount,
      threshold: 0,
    });
  }
  if (snapshot.integrityConflictCount > 0) {
    alerts.push({
      code: "ANCHOR_INTEGRITY_CONFLICT",
      severity: "critical",
      value: snapshot.integrityConflictCount,
      threshold: 0,
    });
  }
  if (snapshot.rpcFailureRatio >= 0.25) {
    alerts.push({
      code: "ANCHOR_RPC_FAILURE_RATE",
      severity: "critical",
      value: snapshot.rpcFailureRatio,
      threshold: 0.25,
    });
  } else if (snapshot.rpcFailureRatio >= 0.05) {
    alerts.push({
      code: "ANCHOR_RPC_FAILURE_RATE",
      severity: "warning",
      value: snapshot.rpcFailureRatio,
      threshold: 0.05,
    });
  }
  return alerts;
}

export function redactRpcUrl(value: string): string {
  const url = new URL(value);
  url.username = "";
  url.password = "";
  url.search = "";
  url.hash = "";
  return url.toString();
}
