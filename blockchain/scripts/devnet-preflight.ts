import crypto from "crypto";
import { readFileSync, statSync } from "fs";
import path from "path";
import { Connection, PublicKey } from "@solana/web3.js";
import {
  DEFAULT_MINIMUM_OPERATING_LAMPORTS,
  DEVNET_GENESIS_HASH,
  deploymentAccountSizes,
  deploymentPeakLamports,
  redactRpcUrl,
  validatePhase5Identity,
} from "../operations/phase5";

const root = path.resolve(__dirname, "..");
const rpcUrl = process.env.ANCHOR_PROVIDER_URL ?? "https://api.devnet.solana.com";
const deploymentProgramId = required("TRACEIT_DEPLOYMENT_PROGRAM_ID");
const feePayer = required("TRACEIT_FEE_PAYER_PUBKEY");
const upgradeAuthority = required("TRACEIT_UPGRADE_AUTHORITY_PUBKEY");
const binaryPath = path.resolve(
  process.env.TRACEIT_ANCHOR_BINARY ??
    path.join(root, "target/deploy/traceit_anchor.so"),
);
const idlPath = path.resolve(
  process.env.TRACEIT_ANCHOR_IDL ?? path.join(root, "idl/traceit_anchor.json"),
);
const source = readFileSync(
  path.join(root, "programs/traceit_anchor/src/lib.rs"),
  "utf8",
);
const anchorToml = readFileSync(path.join(root, "Anchor.toml"), "utf8");
const declaredProgramId = matchRequired(
  source,
  /declare_id!\("([1-9A-HJ-NP-Za-km-z]+)"\)/,
  "declared program ID",
);
const bootstrapAuthority = matchRequired(
  source,
  /BOOTSTRAP_AUTHORITY[^=]*=.*pubkey!\("([1-9A-HJ-NP-Za-km-z]+)"\)/s,
  "bootstrap authority",
);
const configuredProgramId = sectionValue(
  anchorToml,
  "programs.devnet",
  "traceit_anchor",
);

async function main(): Promise<void> {
  const errors = validatePhase5Identity({
    declaredProgramId,
    configuredProgramId,
    deploymentProgramId,
    bootstrapAuthority,
    feePayer,
    upgradeAuthority,
  });
  const connection = new Connection(rpcUrl, "confirmed");
  const genesisHash = await connection.getGenesisHash();
  if (genesisHash !== DEVNET_GENESIS_HASH) {
    errors.push("RPC genesis hash is not Solana devnet");
  }

  const binaryBytes = statSync(binaryPath).size;
  const sizes = deploymentAccountSizes(binaryBytes);
  const [
    balanceLamports,
    programInfo,
    programRent,
    programDataRent,
    temporaryBufferRent,
    configRent,
    firstAnchorRent,
  ] = await Promise.all([
    connection.getBalance(new PublicKey(feePayer), "confirmed"),
    connection.getAccountInfo(new PublicKey(deploymentProgramId), "confirmed"),
    connection.getMinimumBalanceForRentExemption(sizes.program, "confirmed"),
    connection.getMinimumBalanceForRentExemption(sizes.programData, "confirmed"),
    connection.getMinimumBalanceForRentExemption(
      sizes.temporaryBuffer,
      "confirmed",
    ),
    connection.getMinimumBalanceForRentExemption(sizes.config, "confirmed"),
    connection.getMinimumBalanceForRentExemption(sizes.firstAnchor, "confirmed"),
  ]);
  const budget = {
    programAccountLamports: programRent,
    programDataLamports: programDataRent,
    temporaryBufferLamports: temporaryBufferRent,
    configAccountLamports: configRent,
    firstAnchorLamports: firstAnchorRent,
    feeReserveLamports: 50_000_000,
  };
  const requiredPeakLamports = deploymentPeakLamports(budget);
  const expectDeployed = process.env.TRACEIT_EXPECT_DEPLOYED === "true";
  if (expectDeployed && !programInfo) errors.push("anchor program is not deployed");
  if (programInfo && !programInfo.executable) {
    errors.push("deployed program account is not executable");
  }
  if (!programInfo && balanceLamports < requiredPeakLamports) {
    errors.push("fee payer cannot cover peak deployment rent and fee reserve");
  }
  if (
    programInfo &&
    balanceLamports < DEFAULT_MINIMUM_OPERATING_LAMPORTS
  ) {
    errors.push("authority balance is below the operating threshold");
  }

  const output = {
    ready: errors.length === 0,
    errors,
    cluster: "devnet",
    rpcUrl: redactRpcUrl(rpcUrl),
    genesisHash,
    identity: {
      declaredProgramId,
      configuredProgramId: configuredProgramId ?? null,
      deploymentProgramId,
      bootstrapAuthority,
      feePayer,
      upgradeAuthority,
    },
    artifacts: {
      binaryBytes,
      binarySha256: sha256(binaryPath),
      idlSha256: sha256(idlPath),
    },
    deployment: {
      exists: Boolean(programInfo),
      executable: programInfo?.executable ?? false,
      owner: programInfo?.owner.toBase58() ?? null,
      balanceLamports,
      requiredPeakLamports,
      postDeploymentOperatingMinimumLamports:
        DEFAULT_MINIMUM_OPERATING_LAMPORTS,
      rentBudgetLamports: budget,
    },
  };
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  if (errors.length > 0) process.exitCode = 1;
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function matchRequired(sourceText: string, pattern: RegExp, label: string): string {
  const match = sourceText.match(pattern);
  if (!match) throw new Error(`unable to read ${label}`);
  return match[1];
}

function sectionValue(sourceText: string, section: string, key: string): string | undefined {
  const lines = sourceText.split(/\r?\n/);
  let active = false;
  for (const line of lines) {
    const header = line.match(/^\s*\[([^\]]+)]\s*$/);
    if (header) {
      active = header[1] === section;
      continue;
    }
    if (!active) continue;
    const value = line.match(
      new RegExp(`^\\s*${key}\\s*=\\s*"([1-9A-HJ-NP-Za-km-z]+)"`),
    );
    if (value) return value[1];
  }
  return undefined;
}

function sha256(filePath: string): string {
  return crypto.createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

void main().catch((error) => {
  process.stderr.write(
    `${JSON.stringify({ ready: false, error: error instanceof Error ? error.message : String(error) })}\n`,
  );
  process.exitCode = 1;
});
