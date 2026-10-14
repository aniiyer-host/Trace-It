import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import {
  IDL,
  TraceitAnchor,
} from "../../client/traceit_anchor";

export const ANCHOR_PROGRAM_ID = new anchor.web3.PublicKey(
  "3CLytt82BKNwqMQA7M9fqJrMAhgD5t9dpuDC4TwutVFa",
);

export const BOOTSTRAP_AUTHORITY = new anchor.web3.PublicKey(
  "5jV2gq2stVAbNnrHW8w55LyDWEhcAQPdZpWFwxpW9q7W",
);

export function getAnchorProgram(
  provider: anchor.AnchorProvider,
): Program<TraceitAnchor> {
  return new Program<TraceitAnchor>(IDL, ANCHOR_PROGRAM_ID, provider);
}
