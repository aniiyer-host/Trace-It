import { deriveAnchorBatch } from "../src/services/anchor/anchorProtocol.js";

describe("anchor protocol batch hashes", () => {
  it("matches the shared single-event protocol vector", () => {
    const batch = deriveAnchorBatch(1n, [
      "cab02d7ebb287e01583c599da145b22bba94659816d8817e05ff5951557aafa89efb8014b6b685a1b8a5b199fda12dcf9bdf2dc0e083c18ff8bd10dcf463212f",
    ]);

    expect(Buffer.from(batch.auditRoot).toString("hex")).toBe(
      "3df3dd9181cf62a3bf174b09b9fc643d6e663d1eab2e11bcad51999f5166a054c3dd0fb221bad583285aa20d7a731ef7f1c007d3158677224689f0a56169d2fc",
    );
    expect(Buffer.from(batch.batchKey).toString("hex")).toBe(
      "430fa57ce041dae314858d51f60d664548df2ae412ba56df5b8821f51b6cdc18",
    );
  });

  it("rejects empty batches and sequences that overflow u64", () => {
    expect(() => deriveAnchorBatch(1n, [])).toThrow("cannot be empty");
    expect(() =>
      deriveAnchorBatch((1n << 64n) - 1n, ["00".repeat(64), "11".repeat(64)]),
    ).toThrow("overflows u64");
  });
});
