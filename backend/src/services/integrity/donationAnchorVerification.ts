import fs from "node:fs";
import { Keypair, PublicKey, SystemProgram, type Connection } from "@solana/web3.js";
import type { AnchorBatch as DbAnchorBatch } from "../../../generated/prisma/client.js";
import type { ProvenanceEventInput } from "../../utils/provenance.js";
import { verifyProvenanceEvents } from "../provenanceChainService.js";
import { AnchorService } from "../anchor/anchorService.js";
import { SolanaAnchorAdapter } from "../anchor/solanaAnchorAdapter.js";
import { deriveAnchorBatch } from "../anchor/anchorProtocol.js";
import { deriveAnchorPda, deriveConfigPda, encodeRecordAnchorInstruction } from "../anchor/anchorCodec.js";
import type { AnchorCluster, AnchorResultStatus } from "../anchor/anchorTypes.js";
import { createSolanaConnection } from "../solanaRpc.js";

export type IntegrityState = "PASSED" | "FAILED" | "PENDING" | "UNAVAILABLE" | "NOT_APPLICABLE";
export type IntegrityCheck = { status: IntegrityState; reason?: string };

type EventRow = ProvenanceEventInput & {
  id: bigint;
  canonicalPayload: string;
  payloadHash: string;
  previous_hash: string | null;
  chainHash: string | null;
  anchorBatchId?: string | null;
};

type BatchRow = Pick<DbAnchorBatch,
  "id" | "batchKey" | "auditRoot" | "startSequence" | "endSequence" |
  "eventCount" | "status" | "solanaTxSignature" | "anchorPda">;

export type DonationAnchorVerification = {
  provenance: IntegrityCheck;
  batchRoot: IntegrityCheck;
  anchorStatus: string;
  onChainRecord: IntegrityCheck;
  transaction: IntegrityCheck;
  attestationSignature: IntegrityCheck;
};

export function checkBatchRoot(batch: BatchRow, events: readonly Pick<EventRow, "id" | "payloadHash">[]): IntegrityCheck {
  if (events.length === 0) return { status: "FAILED", reason: "No provenance events are linked to this anchor batch." };
  const ordered = [...events].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  if (ordered.length !== batch.eventCount || ordered[0].id !== batch.startSequence || ordered.at(-1)?.id !== batch.endSequence) {
    return { status: "FAILED", reason: "The persisted event count or sequence range does not match the anchor batch." };
  }
  for (let index = 0; index < ordered.length; index += 1) {
    if (ordered[index].id !== batch.startSequence + BigInt(index)) {
      return { status: "FAILED", reason: "The persisted batch events are not a contiguous sequence." };
    }
  }

  try {
    const expected = deriveAnchorBatch(batch.startSequence, ordered.map((event) => event.payloadHash));
    const expectedKey = Buffer.from(expected.batchKey).toString("hex");
    const expectedRoot = Buffer.from(expected.auditRoot).toString("hex");
    if (expected.eventCount !== batch.eventCount || expected.endSequence !== batch.endSequence ||
      expectedKey !== batch.batchKey || expectedRoot !== batch.auditRoot) {
      return { status: "FAILED", reason: "The stored batch key or audit root does not match its provenance events." };
    }
    return { status: "PASSED" };
  } catch {
    return { status: "FAILED", reason: "The stored batch contains invalid provenance hashes." };
  }
}

export function createReadOnlyAnchorVerifier(environment: NodeJS.ProcessEnv = process.env) {
  const rpcUrl = environment.TRACEIT_ANCHOR_RPC_URL?.trim();
  const walletPath = environment.TRACEIT_ANCHOR_WALLET_KEYPAIR_PATH?.trim();
  const programId = environment.TRACEIT_ANCHOR_PROGRAM_ID?.trim();
  const cluster = environment.TRACEIT_ANCHOR_CLUSTER?.trim() as AnchorCluster | undefined;
  if (!rpcUrl || !walletPath || !programId || cluster !== "devnet" || !fs.existsSync(walletPath)) return null;
  try {
    const saved = JSON.parse(fs.readFileSync(walletPath, "utf8")) as number[] | { secretKey?: number[] };
    const secretKey = Array.isArray(saved) ? saved : saved.secretKey;
    if (!secretKey) return null;
    const authority = Keypair.fromSecretKey(Uint8Array.from(secretKey));
    const connection = createSolanaConnection(rpcUrl, "finalized");
    const adapter = new SolanaAnchorAdapter(connection, authority, "finalized");
    const service = new AnchorService(adapter, { programId, authority: authority.publicKey, cluster, rpcUrl });
    return { connection, authority: authority.publicKey, programId: new PublicKey(programId), service };
  } catch {
    return null;
  }
}

export async function verifyPersistedAnchor(
  batch: BatchRow,
  localEvents: readonly EventRow[],
  chain: ReturnType<typeof createReadOnlyAnchorVerifier>,
): Promise<Pick<DonationAnchorVerification, "batchRoot" | "onChainRecord" | "transaction">> {
  const batchRoot = checkBatchRoot(batch, localEvents);
  if (batchRoot.status !== "PASSED") {
    return { batchRoot, onChainRecord: { status: "NOT_APPLICABLE" }, transaction: { status: "NOT_APPLICABLE" } };
  }
  if (!chain) {
    return { batchRoot, onChainRecord: { status: "UNAVAILABLE", reason: "Blockchain RPC verification is not configured." }, transaction: { status: "UNAVAILABLE", reason: "Blockchain RPC verification is not configured." } };
  }

  const expectedBatch = deriveAnchorBatch(batch.startSequence, localEvents.slice().sort((a, b) => a.id < b.id ? -1 : 1).map((event) => event.payloadHash));
  const expectedPda = chain.service.deriveAnchorPda(expectedBatch.batchKey).toBase58();
  if ((batch.anchorPda && batch.anchorPda !== expectedPda) ||
    (batch.status === "CONFIRMED" && !batch.anchorPda)) {
    return {
      batchRoot,
      onChainRecord: { status: "FAILED", reason: "The persisted anchor account address does not match the batch key." },
      transaction: { status: "NOT_APPLICABLE", reason: "The persisted anchor account address is inconsistent." },
    };
  }
  const anchorResult = await chain.service.verifyAnchorRecord(expectedBatch);
  let onChainRecord = mapAnchorResult(anchorResult.status);
  if (anchorResult.status === "CONFIRMED" && anchorResult.pda !== expectedPda) {
    onChainRecord = { status: "FAILED", reason: "The returned on-chain account address does not match the derived batch PDA." };
  }
  if (anchorResult.status === "NOT_FOUND" && batch.status !== "CONFIRMED") {
    onChainRecord = batch.status === "TERMINAL_FAILURE" || batch.status === "DEAD_LETTER"
      ? { status: "FAILED", reason: "Trace-It recorded a terminal anchor failure and no on-chain anchor record was found." }
      : { status: "PENDING", reason: "No on-chain account is visible yet; Trace-It has not recorded the batch as confirmed." };
  }
  if (onChainRecord.status !== "PASSED") {
    return {
      batchRoot,
      onChainRecord: { ...onChainRecord, ...(anchorResult.error ? { reason: safeAnchorReason(anchorResult.status) } : {}) },
      transaction: { status: "NOT_APPLICABLE", reason: "The on-chain anchor record did not match the expected batch." },
    };
  }
  if (!batch.solanaTxSignature) {
    return { batchRoot, onChainRecord, transaction: { status: "UNAVAILABLE", reason: "Trace-It has no transaction signature recorded for this anchor batch." } };
  }
  return { batchRoot, onChainRecord, transaction: await verifyAnchorTransaction(chain.connection, batch.solanaTxSignature, expectedBatch, chain.programId, chain.authority) };
}

function mapAnchorResult(status: AnchorResultStatus): IntegrityCheck {
  if (status === "CONFIRMED" || status === "ALREADY_CONFIRMED_MATCH") return { status: "PASSED" };
  if (status === "NOT_FOUND" || status === "INTEGRITY_CONFLICT" || status === "ACCOUNT_INVALID" || status === "UNSUPPORTED_SCHEMA_VERSION") return { status: "FAILED", reason: "The on-chain anchor account is missing or does not match the stored batch." };
  if (status === "PENDING_CONFIRMATION") return { status: "PENDING", reason: "The anchor has not reached the configured confirmation state." };
  return { status: "UNAVAILABLE", reason: "The on-chain anchor account could not be checked." };
}

function safeAnchorReason(_status: AnchorResultStatus): string {
  return "The returned on-chain anchor data did not match the stored batch.";
}

async function verifyAnchorTransaction(
  connection: Connection,
  signature: string,
  batch: ReturnType<typeof deriveAnchorBatch>,
  programId: PublicKey,
  authority: PublicKey,
): Promise<IntegrityCheck> {
  try {
    if (decodeBase58(signature).length !== 64) {
      return { status: "FAILED", reason: "The stored transaction signature has an invalid encoding." };
    }
  } catch {
    return { status: "FAILED", reason: "The stored transaction signature has an invalid encoding." };
  }
  try {
    const status = (await connection.getSignatureStatuses([signature], { searchTransactionHistory: true })).value[0];
    if (!status) return { status: "UNAVAILABLE", reason: "The transaction was not returned by the configured RPC." };
    if (status.err) return { status: "FAILED", reason: "The recorded transaction failed on-chain." };
    if (status.confirmationStatus !== "finalized") return { status: "PENDING", reason: "The recorded transaction is not finalized." };

    const transaction = await connection.getTransaction(signature, { commitment: "finalized", maxSupportedTransactionVersion: 0 });
    if (!transaction) return { status: "UNAVAILABLE", reason: "The finalized transaction details are unavailable from the RPC." };
    if (!transaction.meta) return { status: "UNAVAILABLE", reason: "The finalized transaction metadata is unavailable from the RPC." };
    if (transaction.meta.err) return { status: "FAILED", reason: "The recorded transaction failed on-chain." };
    if (!hasMatchingAnchorInstruction(transaction, signature, batch, programId, authority)) {
      return { status: "FAILED", reason: "The finalized transaction does not contain the expected anchor instruction." };
    }
    return { status: "PASSED" };
  } catch {
    return { status: "UNAVAILABLE", reason: "The transaction could not be checked through the configured RPC." };
  }
}

function hasMatchingAnchorInstruction(
  transaction: NonNullable<Awaited<ReturnType<Connection["getTransaction"]>>>,
  signature: string,
  batch: ReturnType<typeof deriveAnchorBatch>,
  programId: PublicKey,
  authority: PublicKey,
): boolean {
  const item = transaction as unknown as {
    transaction: { signatures: string[]; message: {
      accountKeys?: PublicKey[]; staticAccountKeys?: PublicKey[];
      instructions?: Array<{ programIdIndex: number; accounts: number[]; data: string | Uint8Array }>;
      compiledInstructions?: Array<{ programIdIndex: number; accountKeyIndexes: number[]; data: string | Uint8Array }>;
      header?: { numRequiredSignatures: number };
    } }; meta?: { loadedAddresses?: { writable?: PublicKey[]; readonly?: PublicKey[] } };
  };
  const message = item.transaction.message;
  // Web3.js returns v0 compiled account indexes across static keys followed by
  // loaded writable and readonly addresses. Legacy getTransaction responses
  // expose both raw compiled bytes and the string-based instruction view.
  const keys = message.staticAccountKeys
    ? [...message.staticAccountKeys, ...(item.meta?.loadedAddresses?.writable ?? []), ...(item.meta?.loadedAddresses?.readonly ?? [])]
    : message.accountKeys ?? [];
  const instructions = message.compiledInstructions ?? message.instructions ?? [];
  const signatureList = item.transaction.signatures ?? [];
  if (!signatureList.includes(signature)) return false;
  const configPda = deriveConfigPda(programId);
  const anchorPda = deriveAnchorPda(programId, batch.batchKey);
  const expectedData = encodeRecordAnchorInstruction(batch);
  return instructions.some((instruction) => {
    const program = keys[instruction.programIdIndex];
    const indices = "accountKeyIndexes" in instruction ? instruction.accountKeyIndexes : instruction.accounts;
    if (!program?.equals(programId) || indices.length !== 4) return false;
    const accounts = indices.map((index) => keys[index]);
    const signerCount = message.header?.numRequiredSignatures ?? 0;
    const authorityIndex = keys.findIndex((key) => key?.equals(authority));
    if (authorityIndex < 0 || authorityIndex >= signerCount ||
      !accounts[0]?.equals(configPda) || !accounts[1]?.equals(anchorPda) ||
      !accounts[2]?.equals(authority) || !accounts[3]?.equals(SystemProgram.programId)) return false;
    try {
      const actualData = instruction.data instanceof Uint8Array
        ? Buffer.from(instruction.data)
        : decodeBase58(instruction.data);
      return actualData.equals(expectedData);
    } catch {
      return false;
    }
  });
}

function decodeBase58(value: string): Buffer {
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let number = 0n;
  for (const character of value) {
    const digit = alphabet.indexOf(character);
    if (digit < 0) throw new Error("invalid base58 instruction data");
    number = number * 58n + BigInt(digit);
  }
  const bytes: number[] = [];
  while (number > 0n) { bytes.unshift(Number(number & 255n)); number >>= 8n; }
  const leadingZeroes = value.match(/^1*/)?.[0].length ?? 0;
  return Buffer.from([...new Array(leadingZeroes).fill(0), ...bytes]);
}
