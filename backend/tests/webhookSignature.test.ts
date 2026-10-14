import crypto from "node:crypto";
import { verifyHexSignature } from "../src/utils/webhookSignature.js";

describe("verifyHexSignature", () => {
  const expected = crypto.createHash("sha256").update("traceit").digest("hex");

  it("accepts an equal SHA-256 signature", () => {
    expect(verifyHexSignature(expected, expected)).toBe(true);
  });

  it("rejects a different signature", () => {
    const different = crypto.createHash("sha256").update("other").digest("hex");
    expect(verifyHexSignature(expected, different)).toBe(false);
  });

  it("rejects malformed signatures without comparing unequal buffer lengths", () => {
    expect(verifyHexSignature(expected, "not-a-signature")).toBe(false);
  });
});
