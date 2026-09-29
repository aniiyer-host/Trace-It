import * as anchor from "@coral-xyz/anchor";
import { expect } from "chai";
import crypto from "crypto";
import { anchorRecordMatches } from "../client/anchorRecord";
import {
  ANCHOR_PROGRAM_ID,
  BOOTSTRAP_AUTHORITY,
  getAnchorProgram,
} from "./support/anchorProgram";

const CONFIG_SEED = Buffer.from("anchor_config");
const ANCHOR_SEED = Buffer.from("anchor");

function bytes(length: number, label: string): number[] {
  return Array.from(
    crypto.createHash("sha512").update(label).digest().subarray(0, length),
  );
}

async function expectFailure(
  operation: () => Promise<unknown>,
  expected: string,
): Promise<void> {
  try {
    await operation();
    expect.fail(`Expected operation to fail with ${expected}`);
  } catch (error) {
    const structured = error as {
      message?: string;
      logs?: string[];
      error?: {
        errorCode?: { code?: string; number?: number };
        errorMessage?: string;
      };
      simulationResponse?: { logs?: string[]; err?: unknown };
    };
    const details = [
      String(error),
      structured.message,
      structured.logs?.join("\n"),
      structured.error?.errorCode?.code,
      structured.error?.errorCode?.number,
      structured.error?.errorMessage,
      structured.simulationResponse?.logs?.join("\n"),
      JSON.stringify(structured.simulationResponse?.err),
    ]
      .filter((value) => value !== undefined)
      .join("\n");
    expect(details).to.include(expected);
  }
}

describe("traceit_anchor", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = getAnchorProgram(provider);
  const bootstrap = provider.wallet.publicKey;
  const unauthorized = anchor.web3.Keypair.generate();
  const nextAuthority = anchor.web3.Keypair.generate();
  const wrongPendingAuthority = anchor.web3.Keypair.generate();
  const [configPda] = anchor.web3.PublicKey.findProgramAddressSync(
    [CONFIG_SEED],
    ANCHOR_PROGRAM_ID,
  );

  before(async () => {
    expect(bootstrap.equals(BOOTSTRAP_AUTHORITY)).to.equal(true);
    for (const keypair of [unauthorized, nextAuthority, wrongPendingAuthority]) {
      const signature = await provider.connection.requestAirdrop(
        keypair.publicKey,
        2 * anchor.web3.LAMPORTS_PER_SOL,
      );
      await provider.connection.confirmTransaction(signature, "confirmed");
    }
  });

  it("rejects initialization by a non-bootstrap signer", async () => {
    await expectFailure(
      () =>
        program.methods
          .initializeConfig()
          .accounts({
            config: configPda,
            authority: unauthorized.publicKey,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .signers([unauthorized])
          .rpc({ commitment: "confirmed" }),
      "Unauthorized",
    );
  });

  it("initializes the singleton config with the bootstrap authority", async () => {
    const request = program.methods.initializeConfig().accounts({
      config: configPda,
      authority: bootstrap,
      systemProgram: anchor.web3.SystemProgram.programId,
    });
    await request.simulate();
    await request.rpc({ commitment: "confirmed" });

    const config = await program.account.anchorConfig.fetch(configPda);
    expect(config.authority.equals(bootstrap)).to.equal(true);
    expect(config.pendingAuthority).to.equal(null);
    expect(config.version).to.equal(1);
    expect(config.paused).to.equal(false);
    const accountInfo = await provider.connection.getAccountInfo(configPda);
    expect(accountInfo?.owner.equals(ANCHOR_PROGRAM_ID)).to.equal(true);
    expect(accountInfo?.data.length).to.equal(77);
  });

  it("prevents config reinitialization", async () => {
    await expectFailure(
      () =>
        program.methods
          .initializeConfig()
          .accounts({
            config: configPda,
            authority: bootstrap,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .simulate(),
      "already in use",
    );
  });

  it("rejects unauthorized and invalid anchor submissions", async () => {
    const validRoot = bytes(64, "valid-root");
    const cases: Array<{
      label: string;
      batchKey: number[];
      root: number[];
      start: anchor.BN;
      end: anchor.BN;
      count: number;
      version: number;
      authority?: anchor.web3.Keypair;
      record?: anchor.web3.PublicKey;
      expected: string;
    }> = [
      {
        label: "unauthorized",
        batchKey: bytes(32, "unauthorized"),
        root: validRoot,
        start: new anchor.BN(1),
        end: new anchor.BN(1),
        count: 1,
        version: 1,
        authority: unauthorized,
        expected: "Unauthorized",
      },
      {
        label: "zero-root",
        batchKey: bytes(32, "zero-root"),
        root: Array(64).fill(0),
        start: new anchor.BN(1),
        end: new anchor.BN(1),
        count: 1,
        version: 1,
        expected: "ZeroRoot",
      },
      {
        label: "empty",
        batchKey: bytes(32, "empty"),
        root: validRoot,
        start: new anchor.BN(1),
        end: new anchor.BN(1),
        count: 0,
        version: 1,
        expected: "EmptyBatch",
      },
      {
        label: "range",
        batchKey: bytes(32, "range"),
        root: validRoot,
        start: new anchor.BN(2),
        end: new anchor.BN(1),
        count: 1,
        version: 1,
        expected: "InvalidRange",
      },
      {
        label: "count",
        batchKey: bytes(32, "count"),
        root: validRoot,
        start: new anchor.BN(1),
        end: new anchor.BN(2),
        count: 1,
        version: 1,
        expected: "CountMismatch",
      },
      {
        label: "schema",
        batchKey: bytes(32, "schema"),
        root: validRoot,
        start: new anchor.BN(1),
        end: new anchor.BN(1),
        count: 1,
        version: 2,
        expected: "UnsupportedSchemaVersion",
      },
      {
        label: "wrong-pda",
        batchKey: bytes(32, "wrong-pda"),
        root: validRoot,
        start: new anchor.BN(1),
        end: new anchor.BN(1),
        count: 1,
        version: 1,
        record: anchor.web3.Keypair.generate().publicKey,
        expected: "ConstraintSeeds",
      },
    ];

    for (const testCase of cases) {
      const authority = testCase.authority ?? null;
      const signer = authority?.publicKey ?? bootstrap;
      const [derivedRecord] = anchor.web3.PublicKey.findProgramAddressSync(
        [ANCHOR_SEED, Buffer.from(testCase.batchKey)],
        ANCHOR_PROGRAM_ID,
      );
      await expectFailure(
        () => {
          const request = program.methods
            .recordAnchor(
              testCase.batchKey,
              testCase.root,
              testCase.start,
              testCase.end,
              testCase.count,
              testCase.version,
            )
            .accounts({
              config: configPda,
              anchorRecord: testCase.record ?? derivedRecord,
              authority: signer,
              systemProgram: anchor.web3.SystemProgram.programId,
            });
          const signedRequest = authority ? request.signers([authority]) : request;
          return testCase.expected === "Unauthorized"
            ? signedRequest.rpc({ commitment: "confirmed" })
            : signedRequest.simulate();
        },
        testCase.expected,
      );
    }
  });

  it("records and reads back exact immutable bytes", async () => {
    const batchKey = bytes(32, "read-back-batch");
    const auditRoot = bytes(64, "read-back-root");
    const [recordPda, bump] = anchor.web3.PublicKey.findProgramAddressSync(
      [ANCHOR_SEED, Buffer.from(batchKey)],
      ANCHOR_PROGRAM_ID,
    );
    const request = program.methods
      .recordAnchor(
        batchKey,
        auditRoot,
        new anchor.BN(42),
        new anchor.BN(44),
        3,
        1,
      )
      .accounts({
        config: configPda,
        anchorRecord: recordPda,
        authority: bootstrap,
        systemProgram: anchor.web3.SystemProgram.programId,
      });
    await request.simulate();
    await request.rpc({ commitment: "confirmed" });

    const record = await program.account.anchorRecord.fetch(recordPda);
    expect(record.batchKey).to.deep.equal(batchKey);
    expect(record.auditRoot).to.deep.equal(auditRoot);
    expect(record.startSequence.toString()).to.equal("42");
    expect(record.endSequence.toString()).to.equal("44");
    expect(record.eventCount).to.equal(3);
    expect(record.schemaVersion).to.equal(1);
    expect(record.authority.equals(bootstrap)).to.equal(true);
    expect(record.anchoredAt.gt(new anchor.BN(0))).to.equal(true);
    expect(record.bump).to.equal(bump);
    const accountInfo = await provider.connection.getAccountInfo(recordPda);
    expect(accountInfo?.data.length).to.equal(167);

    await expectFailure(() => request.simulate(), "already in use");
    const unchanged = await program.account.anchorRecord.fetch(recordPda);
    expect(unchanged.auditRoot).to.deep.equal(auditRoot);
    expect(
      anchorRecordMatches(unchanged, {
        batchKey,
        auditRoot,
        startSequence: new anchor.BN(42),
        endSequence: new anchor.BN(44),
        eventCount: 3,
        schemaVersion: 1,
      }),
    ).to.equal(true);
    expect(
      anchorRecordMatches(unchanged, {
        batchKey,
        auditRoot: bytes(64, "conflicting-root"),
        startSequence: new anchor.BN(42),
        endSequence: new anchor.BN(44),
        eventCount: 3,
        schemaVersion: 1,
      }),
    ).to.equal(false);
  });

  it("supports the maximum u64 sequence without overflow", async () => {
    const batchKey = bytes(32, "max-sequence");
    const [recordPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [ANCHOR_SEED, Buffer.from(batchKey)],
      ANCHOR_PROGRAM_ID,
    );
    const maximum = new anchor.BN("18446744073709551615");
    const request = program.methods
      .recordAnchor(batchKey, bytes(64, "max-root"), maximum, maximum, 1, 1)
      .accounts({
        config: configPda,
        anchorRecord: recordPda,
        authority: bootstrap,
        systemProgram: anchor.web3.SystemProgram.programId,
      });
    await request.simulate();
    await request.rpc({ commitment: "confirmed" });
    const record = await program.account.anchorRecord.fetch(recordPda);
    expect(record.startSequence.toString()).to.equal(maximum.toString());
  });

  it("blocks anchor creation while paused", async () => {
    const pause = program.methods.setPaused(true).accounts({
      config: configPda,
      authority: bootstrap,
    });
    await pause.simulate();
    await pause.rpc({ commitment: "confirmed" });

    const batchKey = bytes(32, "paused-batch");
    const [recordPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [ANCHOR_SEED, Buffer.from(batchKey)],
      ANCHOR_PROGRAM_ID,
    );
    await expectFailure(
      () =>
        program.methods
          .recordAnchor(
            batchKey,
            bytes(64, "paused-root"),
            new anchor.BN(1),
            new anchor.BN(1),
            1,
            1,
          )
          .accounts({
            config: configPda,
            anchorRecord: recordPda,
            authority: bootstrap,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .simulate(),
      "ProgramPaused",
    );

    const unpause = program.methods.setPaused(false).accounts({
      config: configPda,
      authority: bootstrap,
    });
    await unpause.simulate();
    await unpause.rpc({ commitment: "confirmed" });
  });

  it("rotates authority through propose and accept", async () => {
    await expectFailure(
      () =>
        program.methods
          .proposeAuthority(anchor.web3.PublicKey.default)
          .accounts({ config: configPda, authority: bootstrap })
          .simulate(),
      "InvalidAuthority",
    );
    await expectFailure(
      () =>
        program.methods
          .proposeAuthority(bootstrap)
          .accounts({ config: configPda, authority: bootstrap })
          .simulate(),
      "AuthorityUnchanged",
    );

    const proposal = program.methods
      .proposeAuthority(nextAuthority.publicKey)
      .accounts({ config: configPda, authority: bootstrap });
    await proposal.simulate();
    await proposal.rpc({ commitment: "confirmed" });

    await expectFailure(
      () =>
        program.methods
          .acceptAuthority()
          .accounts({
            config: configPda,
            pendingAuthority: wrongPendingAuthority.publicKey,
          })
          .signers([wrongPendingAuthority])
          .rpc({ commitment: "confirmed" }),
      "Unauthorized",
    );

    const acceptance = program.methods
      .acceptAuthority()
      .accounts({
        config: configPda,
        pendingAuthority: nextAuthority.publicKey,
      })
      .signers([nextAuthority]);
    // Anchor 0.29 cannot directly simulate a valid non-provider signer under
    // Node 24; rpc() still performs the validator's mandatory preflight simulation.
    await acceptance.rpc({ commitment: "confirmed" });

    const config = await program.account.anchorConfig.fetch(configPda);
    expect(config.authority.equals(nextAuthority.publicKey)).to.equal(true);
    expect(config.pendingAuthority).to.equal(null);

    await expectFailure(
      () =>
        program.methods
          .setPaused(true)
          .accounts({ config: configPda, authority: bootstrap })
          .rpc({ commitment: "confirmed" }),
      "Unauthorized",
    );

    const batchKey = bytes(32, "new-authority-batch");
    const auditRoot = bytes(64, "new-authority-root");
    const [recordPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [ANCHOR_SEED, Buffer.from(batchKey)],
      ANCHOR_PROGRAM_ID,
    );
    const request = program.methods
      .recordAnchor(
        batchKey,
        auditRoot,
        new anchor.BN(100),
        new anchor.BN(100),
        1,
        1,
      )
      .accounts({
        config: configPda,
        anchorRecord: recordPda,
        authority: nextAuthority.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([nextAuthority]);
    // Uses RPC preflight simulation for the rotated non-provider signer.
    await request.rpc({ commitment: "confirmed" });
    const record = await program.account.anchorRecord.fetch(recordPda);
    expect(record.authority.equals(nextAuthority.publicKey)).to.equal(true);
  });
});
