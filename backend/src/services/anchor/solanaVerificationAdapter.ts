import {
  Connection,
  PublicKey,
  SystemProgram,
  type Finality,
  type ParsedInstruction,
  type PartiallyDecodedInstruction,
} from "@solana/web3.js";
import {
  RECORD_ANCHOR_DISCRIMINATOR,
  deriveConfigPda,
} from "./anchorCodec.js";
import type {
  AnchorTransactionVerification,
  AnchorTransactionVerifier,
} from "./anchorVerification.js";

export class SolanaAnchorTransactionVerifier
  implements AnchorTransactionVerifier
{
  constructor(
    private readonly connection: Connection,
    private readonly programId: PublicKey,
    private readonly commitment: Finality = "confirmed",
  ) {}

  async verifyTransaction(
    signature: string,
    anchorPda: PublicKey,
    authority: PublicKey,
  ): Promise<AnchorTransactionVerification> {
    let signatureBytes: Buffer;
    try {
      signatureBytes = decodeBase58(signature);
    } catch {
      return { status: "INVALID", error: "transaction signature is invalid" };
    }
    if (signatureBytes.length !== 64) {
      return { status: "INVALID", error: "transaction signature is invalid" };
    }

    const statuses = await this.connection.getSignatureStatuses([signature], {
      searchTransactionHistory: true,
    });
    const signatureStatus = statuses.value[0];
    if (!signatureStatus) return { status: "NOT_FOUND" };
    if (signatureStatus.err) {
      return {
        status: "INVALID",
        error: `anchor transaction failed: ${JSON.stringify(signatureStatus.err)}`,
      };
    }
    if (
      signatureStatus.confirmationStatus !== "confirmed" &&
      signatureStatus.confirmationStatus !== "finalized"
    ) {
      return { status: "PENDING" };
    }

    const transaction = await this.connection.getParsedTransaction(signature, {
      commitment: this.commitment,
      maxSupportedTransactionVersion: 0,
    });
    if (!transaction) return { status: "NOT_FOUND" };
    if (transaction.meta?.err) {
      return {
        status: "INVALID",
        error: `anchor transaction metadata contains an error: ${JSON.stringify(transaction.meta.err)}`,
      };
    }
    if (!Number.isSafeInteger(transaction.slot) || transaction.slot < 0) {
      return { status: "INVALID", error: "transaction slot is invalid" };
    }

    const authorityKey = transaction.transaction.message.accountKeys.find(
      (key) => key.pubkey.equals(authority),
    );
    if (!authorityKey?.signer) {
      return {
        status: "INVALID",
        error: "anchor authority is not a transaction signer",
      };
    }

    const invokesExpectedAnchor = transaction.transaction.message.instructions.some(
      (instruction) =>
        isExpectedAnchorInstruction(
          instruction,
          this.programId,
          anchorPda,
          authority,
        ),
    );
    if (!invokesExpectedAnchor) {
      return {
        status: "INVALID",
        error: "transaction does not invoke the configured program with the anchor PDA",
      };
    }
    return { status: "CONFIRMED", slot: transaction.slot };
  }
}

function isExpectedAnchorInstruction(
  instruction: ParsedInstruction | PartiallyDecodedInstruction,
  programId: PublicKey,
  anchorPda: PublicKey,
  authority: PublicKey,
): boolean {
  if (!instruction.programId.equals(programId) || !("accounts" in instruction)) {
    return false;
  }
  if (
    instruction.accounts.length < 4 ||
    !instruction.accounts[0].equals(deriveConfigPda(programId)) ||
    !instruction.accounts[1].equals(anchorPda) ||
    !instruction.accounts[2].equals(authority) ||
    !instruction.accounts[3].equals(SystemProgram.programId)
  ) {
    return false;
  }
  try {
    return decodeBase58(instruction.data)
      .subarray(0, RECORD_ANCHOR_DISCRIMINATOR.length)
      .equals(RECORD_ANCHOR_DISCRIMINATOR);
  } catch {
    return false;
  }
}

const BASE58_ALPHABET =
  "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function decodeBase58(value: string): Buffer {
  if (!value || value.length > 512) throw new Error("invalid base58 value");
  const bytes = [0];
  for (const character of value) {
    let carry = BASE58_ALPHABET.indexOf(character);
    if (carry < 0) throw new Error("invalid base58 character");
    for (let index = 0; index < bytes.length; index += 1) {
      carry += bytes[index] * 58;
      bytes[index] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  for (let index = 0; index < value.length - 1 && value[index] === "1"; index += 1) {
    bytes.push(0);
  }
  return Buffer.from(bytes.reverse());
}
