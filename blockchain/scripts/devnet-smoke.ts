import * as anchor from "@coral-xyz/anchor";
import { readFileSync } from "fs";
import path from "path";
import { DEVNET_GENESIS_HASH } from "../operations/phase5";

const CONSENT = "I_ACKNOWLEDGE_DEVNET_FEES";
if (process.env.TRACEIT_ALLOW_DEVNET_TRANSACTIONS !== CONSENT) {
  throw new Error(
    `refusing to send: TRACEIT_ALLOW_DEVNET_TRANSACTIONS must equal ${CONSENT}`,
  );
}

const root = path.resolve(__dirname, "..");
const action = required("TRACEIT_SMOKE_ACTION");
if (action !== "initialize-config" && action !== "write-anchor") {
  throw new Error(
    "TRACEIT_SMOKE_ACTION must be initialize-config or write-anchor",
  );
}
const programId = new anchor.web3.PublicKey(
  required("TRACEIT_ANCHOR_PROGRAM_ID"),
);
const bootstrapAuthority = new anchor.web3.PublicKey(
  required("TRACEIT_BOOTSTRAP_AUTHORITY"),
);
const envProvider = anchor.AnchorProvider.env();
const provider = new anchor.AnchorProvider(
  new anchor.web3.Connection(required("ANCHOR_PROVIDER_URL"), "confirmed"),
  envProvider.wallet,
  { commitment: "confirmed", preflightCommitment: "confirmed" },
);
anchor.setProvider(provider);

async function main(): Promise<void> {
  const genesisHash = await provider.connection.getGenesisHash();
  if (genesisHash !== DEVNET_GENESIS_HASH) {
    throw new Error("refusing to send: RPC is not Solana devnet");
  }
  if (!provider.wallet.publicKey.equals(bootstrapAuthority)) {
    throw new Error("provider wallet is not the compiled bootstrap authority");
  }

  const idl = JSON.parse(
    readFileSync(path.join(root, "idl/traceit_anchor.json"), "utf8"),
  ) as anchor.Idl;
  const program = new anchor.Program(idl, programId, provider) as any;
  const [configPda] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("anchor_config")],
    programId,
  );

  let configInitializationSignature: string | null = null;
  const configInfo = await provider.connection.getAccountInfo(
    configPda,
    "confirmed",
  );
  if (!configInfo && action === "initialize-config") {
    const initialize = program.methods.initializeConfig().accounts({
      config: configPda,
      authority: provider.wallet.publicKey,
      systemProgram: anchor.web3.SystemProgram.programId,
    });
    configInitializationSignature = await submitGuarded(
      provider,
      await initialize.instruction(),
      "config initialization",
    );
  }
  if (!configInfo && action === "write-anchor") {
    throw new Error(
      "AnchorConfig is not initialized; approve and run initialize-config first",
    );
  }
  const config = await program.account.anchorConfig.fetch(configPda);
  if (
    !config.authority.equals(bootstrapAuthority) ||
    config.version !== 1 ||
    config.paused !== false
  ) {
    throw new Error("devnet AnchorConfig does not match the v1 deployment policy");
  }

  if (action === "initialize-config") {
    process.stdout.write(
      `${JSON.stringify(
        {
          cluster: "devnet",
          action,
          programId: programId.toBase58(),
          configPda: configPda.toBase58(),
          configInitializationSignature,
          verified: true,
        },
        null,
        2,
      )}\n`,
    );
    return;
  }

  const fixtures = JSON.parse(
    readFileSync(
      path.join(root, "tests/fixtures/anchor-protocol-v1.json"),
      "utf8",
    ),
  ) as {
    valid: Array<{
      name: string;
      batchKeyHex: string;
      auditRootHex: string;
      startSequence: string;
      endSequence: string;
      eventCount: number;
      schemaVersion: number;
    }>;
  };
  const fixture = fixtures.valid.find((entry) => entry.name === "multiple_events");
  if (!fixture) throw new Error("multiple_events protocol fixture is missing");
  const batchKey = Array.from(Buffer.from(fixture.batchKeyHex, "hex"));
  const auditRoot = Array.from(Buffer.from(fixture.auditRootHex, "hex"));
  const [anchorPda] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("anchor"), Buffer.from(batchKey)],
    programId,
  );
  const anchorInfo = await provider.connection.getAccountInfo(anchorPda, "confirmed");
  if (anchorInfo) {
    throw new Error("refusing smoke test because its AnchorRecord target already exists");
  }

  const recordRequest = program.methods
    .recordAnchor(
      batchKey,
      auditRoot,
      new anchor.BN(fixture.startSequence),
      new anchor.BN(fixture.endSequence),
      fixture.eventCount,
      fixture.schemaVersion,
    )
    .accounts({
      config: configPda,
      anchorRecord: anchorPda,
      authority: provider.wallet.publicKey,
      systemProgram: anchor.web3.SystemProgram.programId,
    });
  const anchorSignature = await submitGuarded(
    provider,
    await recordRequest.instruction(),
    "public synthetic-fixture anchor",
  );

  const record = await program.account.anchorRecord.fetch(anchorPda);
  const checks = [
    Buffer.from(record.batchKey).equals(Buffer.from(batchKey)),
    Buffer.from(record.auditRoot).equals(Buffer.from(auditRoot)),
    record.startSequence.toString() === fixture.startSequence,
    record.endSequence.toString() === fixture.endSequence,
    record.eventCount === fixture.eventCount,
    record.schemaVersion === fixture.schemaVersion,
    record.authority.equals(bootstrapAuthority),
    record.bump === anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("anchor"), Buffer.from(batchKey)],
      programId,
    )[1],
  ];
  if (checks.some((matches) => !matches)) {
    throw new Error("devnet anchor record does not match the public fixture");
  }
  process.stdout.write(
    `${JSON.stringify(
      {
        cluster: "devnet",
        programId: programId.toBase58(),
        configPda: configPda.toBase58(),
        anchorPda: anchorPda.toBase58(),
        action,
        fixture: fixture.name,
        fixtureIsSynthetic: true,
        onChainTestMarker: false,
        rpcUrl: redactRpcUrl(provider.connection.rpcEndpoint),
        commitment: provider.opts.commitment,
        configInitializationSignature,
        anchorSignature,
        explorerUrl: anchorSignature
          ? `https://explorer.solana.com/tx/${anchorSignature}?cluster=devnet`
          : null,
        verified: true,
      },
      null,
      2,
    )}\n`,
  );
}

function redactRpcUrl(value: string): string {
  const url = new URL(value);
  url.username = "";
  url.password = "";
  url.search = "";
  url.hash = "";
  return url.toString();
}

async function submitGuarded(
  provider: anchor.AnchorProvider,
  instruction: anchor.web3.TransactionInstruction,
  label: string,
): Promise<string> {
  const validity = await provider.connection.getLatestBlockhash("confirmed");
  const transaction = new anchor.web3.VersionedTransaction(
    new anchor.web3.TransactionMessage({
      payerKey: provider.wallet.publicKey,
      recentBlockhash: validity.blockhash,
      instructions: [instruction],
    }).compileToV0Message(),
  );
  const signed = await provider.wallet.signTransaction(transaction);
  const simulation = await provider.connection.simulateTransaction(signed, {
    commitment: "confirmed",
    sigVerify: true,
  });
  if (simulation.value.err) {
    throw new Error(
      `${label} simulation failed at slot ${simulation.context.slot}: ${JSON.stringify({
        err: simulation.value.err,
        logs: simulation.value.logs,
        unitsConsumed: simulation.value.unitsConsumed,
      })}`,
    );
  }
  const currentBlockHeight = await provider.connection.getBlockHeight("confirmed");
  if (currentBlockHeight > validity.lastValidBlockHeight) {
    throw new Error(
      `${label} blockhash expired before submission (height ${currentBlockHeight}, last valid ${validity.lastValidBlockHeight})`,
    );
  }
  const signature = await provider.connection.sendRawTransaction(
    signed.serialize(),
    {
      skipPreflight: false,
      maxRetries: 0,
      preflightCommitment: "confirmed",
    },
  );
  const confirmation = await provider.connection.confirmTransaction(
    { ...validity, signature },
    "confirmed",
  );
  if (confirmation.value.err) {
    throw new Error(
      `${label} transaction ${signature} failed at slot ${confirmation.context.slot}: ${JSON.stringify(confirmation.value.err)}`,
    );
  }
  return signature;
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

void main().catch((error) => {
  process.stderr.write(
    `${JSON.stringify({ verified: false, error: error instanceof Error ? error.message : String(error) })}\n`,
  );
  process.exitCode = 1;
});
