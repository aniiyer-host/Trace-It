import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { IDL, Traceit } from "../../target/types/traceit";

export const LOCALNET_PROGRAM_ID = new anchor.web3.PublicKey(
  "5fj53usXqFvfah3x7rYo6BxQnrvBprBZsGU49XhQxzV3",
);

export function getTraceitProgram(
  provider: anchor.AnchorProvider,
): Program<Traceit> {
  return new Program<Traceit>(IDL, LOCALNET_PROGRAM_ID, provider);
}
