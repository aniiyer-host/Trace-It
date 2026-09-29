import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import {
  IDL,
  TraceitAnchor,
} from "../../client/traceit_anchor";

export const ANCHOR_PROGRAM_ID = new anchor.web3.PublicKey(
  "4qLwniS2NeDrqftgb83GbYVHWVbBBbUcjDR1Ncm5GCHX",
);

export const BOOTSTRAP_AUTHORITY = new anchor.web3.PublicKey(
  "Emi2GHuHM4UnY6TqcXio3Cbfe5H1E2uukL3QgBziQSrG",
);

export function getAnchorProgram(
  provider: anchor.AnchorProvider,
): Program<TraceitAnchor> {
  return new Program<TraceitAnchor>(IDL, ANCHOR_PROGRAM_ID, provider);
}
