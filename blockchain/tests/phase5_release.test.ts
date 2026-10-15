import crypto from "crypto";
import { expect } from "chai";
import { readFileSync } from "fs";
import path from "path";

const root = process.cwd();

describe("phase 5 release controls", () => {
  it("keeps the deployment manifest hashes aligned with reviewed artifacts", () => {
    const manifest = JSON.parse(
      readFileSync(path.join(root, "deployments/devnet-anchor.json"), "utf8"),
    ) as {
      status: string;
      blockers: string[];
      program: { binarySha256: string; idlSha256: string };
      deployment: { binarySha256OnChain: string };
      pendingUpgrade?: {
        status: string;
        binarySha256: string;
        binaryBytes: number;
        idlSha256: string;
        existingProgramDataCodeCapacityBytes: number;
        fitsExistingProgramDataCapacity: boolean;
        onChainUpgradeSubmitted: boolean;
      };
    };
    expect(manifest.program.binarySha256).to.equal(
      manifest.deployment.binarySha256OnChain,
    );
    const reviewedBinaryHash = sha256(
      path.join(root, "target/deploy/traceit_anchor.so"),
    );
    const reviewedIdlHash = sha256(path.join(root, "idl/traceit_anchor.json"));
    if (manifest.pendingUpgrade) {
      expect(manifest.pendingUpgrade.status).to.equal(
        "BUILT_AWAITING_REVIEW_AND_APPROVAL",
      );
      expect(manifest.pendingUpgrade.binarySha256).to.equal(reviewedBinaryHash);
      expect(manifest.pendingUpgrade.binaryBytes).to.equal(
        readFileSync(path.join(root, "target/deploy/traceit_anchor.so")).length,
      );
      expect(manifest.pendingUpgrade.idlSha256).to.equal(reviewedIdlHash);
      expect(manifest.pendingUpgrade.binaryBytes).to.be.lessThan(
        manifest.pendingUpgrade.existingProgramDataCodeCapacityBytes,
      );
      expect(manifest.pendingUpgrade.fitsExistingProgramDataCapacity).to.equal(
        true,
      );
      expect(manifest.pendingUpgrade.onChainUpgradeSubmitted).to.equal(false);
    } else {
      expect(manifest.program.binarySha256).to.equal(reviewedBinaryHash);
      expect(manifest.program.idlSha256).to.equal(reviewedIdlHash);
    }
    if (manifest.status !== "DEPLOYED") {
      expect(manifest.blockers).not.to.be.empty;
    }
  });

  it("requires an explicit consent guard in every devnet write entrypoint", () => {
    for (const file of [
      "scripts/deploy-devnet.sh",
      "scripts/devnet-smoke.ts",
    ]) {
      const source = readFileSync(path.join(root, file), "utf8");
      expect(source).to.include("TRACEIT_ALLOW_DEVNET_TRANSACTIONS");
      expect(source).to.include("I_ACKNOWLEDGE_DEVNET_FEES");
    }
  });

  it("keeps mainnet out of active Anchor configuration", () => {
    const anchorToml = readFileSync(path.join(root, "Anchor.toml"), "utf8");
    expect(anchorToml).not.to.match(/\[programs\.mainnet/);
    expect(anchorToml).not.to.match(/cluster\s*=\s*"mainnet/);
  });

  it("documents release, rollback, rotation, monitoring, and incident controls", () => {
    const runbook = readFileSync(
      path.join(root, "docs/phase5-operations-runbook.md"),
      "utf8",
    );
    for (const requirement of [
      "Deployment procedure",
      "Identities and custody",
      "Monitoring and alerts",
      "Pause, incident, and recovery",
      "Release checklist",
    ]) {
      expect(runbook).to.include(requirement);
    }
  });
});

function sha256(filePath: string): string {
  return crypto
    .createHash("sha256")
    .update(readFileSync(filePath))
    .digest("hex");
}
