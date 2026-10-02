import type { AccountInfo, PublicKey } from "@solana/web3.js";
import type { AnchorChainAdapter } from "./solanaAnchorAdapter.js";
import type {
  AnchorTransactionVerification,
  AnchorTransactionVerifier,
} from "./anchorVerification.js";

/**
 * Read calls may fail over across configured RPCs. Writes deliberately remain
 * on the primary adapter so an ambiguous send can only enter reconciliation,
 * never be blindly repeated through another endpoint.
 */
export class ReadFailoverAnchorChainAdapter implements AnchorChainAdapter {
  constructor(
    private readonly primary: AnchorChainAdapter,
    private readonly readFallbacks: readonly AnchorChainAdapter[] = [],
  ) {}

  async getAccountInfo(address: PublicKey): Promise<AccountInfo<Buffer> | null> {
    const errors: string[] = [];
    for (const adapter of [this.primary, ...this.readFallbacks]) {
      try {
        return await adapter.getAccountInfo(address);
      } catch (error) {
        errors.push(errorMessage(error));
      }
    }
    throw new Error(`all anchor read RPCs failed: ${errors.join(" | ")}`);
  }

  submitRecordAnchor(
    input: Parameters<AnchorChainAdapter["submitRecordAnchor"]>[0],
  ): Promise<string> {
    return this.primary.submitRecordAnchor(input);
  }
}

export class ReadFailoverAnchorTransactionVerifier
  implements AnchorTransactionVerifier
{
  constructor(
    private readonly verifiers: readonly AnchorTransactionVerifier[],
  ) {
    if (verifiers.length === 0) {
      throw new Error("at least one transaction verifier is required");
    }
  }

  async verifyTransaction(
    signature: string,
    anchorPda: PublicKey,
    authority: PublicKey,
  ): Promise<AnchorTransactionVerification> {
    const errors: string[] = [];
    for (const verifier of this.verifiers) {
      try {
        return await verifier.verifyTransaction(signature, anchorPda, authority);
      } catch (error) {
        errors.push(errorMessage(error));
      }
    }
    throw new Error(`all transaction metadata RPCs failed: ${errors.join(" | ")}`);
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
