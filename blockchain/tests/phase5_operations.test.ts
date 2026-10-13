import { expect } from "chai";
import {
  deploymentAccountSizes,
  deploymentPeakLamports,
  evaluateOperationalSnapshot,
  redactRpcUrl,
  validatePhase5Identity,
} from "../operations/phase5";

const PROGRAM_ID = "4qLwniS2NeDrqftgb83GbYVHWVbBBbUcjDR1Ncm5GCHX";
const AUTHORITY = "Emi2GHuHM4UnY6TqcXio3Cbfe5H1E2uukL3QgBziQSrG";

describe("phase 5 operational controls", () => {
  it("accepts a consistent public deployment identity", () => {
    expect(
      validatePhase5Identity({
        declaredProgramId: PROGRAM_ID,
        configuredProgramId: PROGRAM_ID,
        deploymentProgramId: PROGRAM_ID,
        bootstrapAuthority: AUTHORITY,
        feePayer: AUTHORITY,
        upgradeAuthority: AUTHORITY,
      }),
    ).to.deep.equal([]);
  });

  it("rejects program-ID drift and malformed public keys", () => {
    const errors = validatePhase5Identity({
      declaredProgramId: PROGRAM_ID,
      configuredProgramId: "5fj53usXqFvfah3x7rYo6BxQnrvBprBZsGU49XhQxzV3",
      deploymentProgramId: "5s9AEJfEKfUrcCszpfdkZmka1XcX2XA7mbyDTmKmQywW",
      bootstrapAuthority: "not-a-key",
      feePayer: AUTHORITY,
      upgradeAuthority: AUTHORITY,
    });
    expect(errors).to.include(
      "declared program ID does not match the deployment keypair address",
    );
    expect(errors).to.include(
      "Anchor.toml devnet program ID does not match the declared program ID",
    );
    expect(errors).to.include(
      "bootstrapAuthority is not a valid Solana public key",
    );
  });

  it("budgets peak deployment rent including the temporary buffer", () => {
    expect(deploymentAccountSizes(232_136)).to.deep.equal({
      program: 36,
      programData: 464_317,
      temporaryBuffer: 232_173,
      config: 77,
      firstAnchor: 167,
    });
    expect(
      deploymentPeakLamports({
        programAccountLamports: 1,
        programDataLamports: 2,
        temporaryBufferLamports: 3,
        configAccountLamports: 4,
        firstAnchorLamports: 5,
        feeReserveLamports: 6,
      }),
    ).to.equal(21);
  });

  it("emits warning and critical operational alerts at documented thresholds", () => {
    const alerts = evaluateOperationalSnapshot({
      authorityBalanceLamports: 50,
      minimumAuthorityBalanceLamports: 100,
      oldestPendingAgeMs: 31 * 60_000,
      pendingCount: 4,
      retryingCount: 2,
      deadLetterCount: 1,
      integrityConflictCount: 1,
      rpcFailureRatio: 0.3,
    });
    expect(alerts.map((alert) => alert.code)).to.have.members([
      "AUTHORITY_BALANCE_LOW",
      "ANCHOR_BACKLOG_AGE_CRITICAL",
      "ANCHOR_DEAD_LETTER_PRESENT",
      "ANCHOR_INTEGRITY_CONFLICT",
      "ANCHOR_RPC_FAILURE_RATE",
    ]);
    expect(alerts.every((alert) => alert.severity === "critical")).to.equal(true);
  });

  it("redacts RPC credentials and query tokens", () => {
    expect(
      redactRpcUrl("https://user:secret@rpc.example.test/path?api-key=secret"),
    ).to.equal("https://rpc.example.test/path");
  });
});
