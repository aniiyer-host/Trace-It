import { HashService } from "../src/services/hashService.js";

describe("beneficiary IDs derived from PAN", () => {
  it("normalizes PAN and returns a stable keyed SHA-256 identifier", () => {
    const first = HashService.beneficiaryIdFromPan(" abcde1234f ", "test-secret");
    const second = HashService.beneficiaryIdFromPan("ABCDE1234F", "test-secret");

    expect(first).toBe(second);
    expect(first).toMatch(/^BEN-[a-f0-9]{64}$/);
    expect(first).not.toContain("ABCDE1234F");
  });

  it("changes with the secret and rejects invalid PAN formats", () => {
    expect(HashService.beneficiaryIdFromPan("ABCDE1234F", "one"))
      .not.toBe(HashService.beneficiaryIdFromPan("ABCDE1234F", "two"));
    expect(() => HashService.beneficiaryIdFromPan("not-a-pan", "secret"))
      .toThrow("Invalid PAN format");
  });
});
