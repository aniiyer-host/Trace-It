import { expect } from "chai";
import { readFileSync } from "fs";
import path from "path";
import { deriveAuditRoot, deriveBatchKey } from "./support/anchorProtocol";

type Vector = {
  name: string;
  schemaVersion: number;
  startSequence: string;
  endSequence: string;
  eventCount: number;
  eventHashesHex: string[];
  auditRootHex: string;
  batchKeyHex: string;
};

const fixture = JSON.parse(
  readFileSync(
    path.join(process.cwd(), "tests/fixtures/anchor-protocol-v1.json"),
    "utf8",
  ),
) as {
  valid: Vector[];
  invalid: Array<Record<string, string>>;
};

describe("anchor protocol v1 vectors", () => {
  for (const vector of fixture.valid) {
    it(`matches Rust-compatible bytes for ${vector.name}`, () => {
      const start = BigInt(vector.startSequence);
      const end = BigInt(vector.endSequence);
      const eventHashes = vector.eventHashesHex.map((value) =>
        Buffer.from(value, "hex"),
      );
      const root = deriveAuditRoot(
        vector.schemaVersion,
        start,
        end,
        eventHashes,
      );
      expect(root.toString("hex")).to.equal(vector.auditRootHex);
      expect(
        deriveBatchKey(
          vector.schemaVersion,
          start,
          end,
          vector.eventCount,
          root,
        ).toString("hex"),
      ).to.equal(vector.batchKeyHex);
    });
  }

  it("rejects empty, zero-root, invalid-range, and count-mismatch inputs", () => {
    expect(() => deriveAuditRoot(1, 1n, 1n, [])).to.throw("EMPTY_BATCH");
    expect(() => deriveBatchKey(1, 1n, 1n, 1, Buffer.alloc(64))).to.throw(
      "ZERO_ROOT",
    );
    expect(() => deriveBatchKey(1, 2n, 1n, 1, Buffer.alloc(64, 1))).to.throw(
      "INVALID_RANGE",
    );
    expect(() => deriveBatchKey(1, 1n, 2n, 1, Buffer.alloc(64, 1))).to.throw(
      "COUNT_MISMATCH",
    );
  });

  it("detects an altered audit root", () => {
    const source = fixture.valid.find((item) => item.name === "multiple_events")!;
    const altered = fixture.invalid.find((item) => item.name === "altered_root")!;
    const recomputed = deriveAuditRoot(
      source.schemaVersion,
      BigInt(source.startSequence),
      BigInt(source.endSequence),
      source.eventHashesHex.map((value) => Buffer.from(value, "hex")),
    );
    expect(recomputed.toString("hex")).not.to.equal(altered.auditRootHex);
  });
});
