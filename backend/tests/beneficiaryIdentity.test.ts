import { HashService } from "../src/services/hashService.js";

describe("beneficiary IDs derived from PAN", () => {
  it("normalizes PAN and returns a stable keyed SHA-256 identifier", () => {
    const first = HashService.beneficiaryIdFromPan(" abcde1234f ", "test-secret", "campaign-1");
    const second = HashService.beneficiaryIdFromPan("ABCDE1234F", "test-secret", "campaign-1");

    expect(first).toBe(second);
    expect(first).toMatch(/^BEN-[a-f0-9]{64}$/);
    expect(first).not.toContain("ABCDE1234F");
  });

  it("changes with the secret and rejects invalid PAN formats", () => {
    expect(HashService.beneficiaryIdFromPan("ABCDE1234F", "one", "campaign-1"))
      .not.toBe(HashService.beneficiaryIdFromPan("ABCDE1234F", "two", "campaign-1"));
    expect(HashService.beneficiaryIdFromPan("ABCDE1234F", "test-secret", "campaign-1"))
      .not.toBe(HashService.beneficiaryIdFromPan("ABCDE1234F", "test-secret", "campaign-2"));
    expect(() => HashService.beneficiaryIdFromPan("not-a-pan", "secret", "campaign-1"))
      .toThrow("Invalid PAN format");
  });

  it("authenticates encrypted beneficiary values and detects tampering", () => {
    process.env.AES_BENEFICIARY_KEY = Buffer.alloc(32, 9).toString("hex");
    const encrypted = HashService.encryptSensitiveValue("private assistance reason");
    expect(encrypted).toMatch(/^v1:/);
    expect(HashService.decryptSensitiveValue(encrypted)).toBe("private assistance reason");
    const tampered = encrypted.slice(0, -1) + (encrypted.endsWith("A") ? "B" : "A");
    expect(() => HashService.decryptSensitiveValue(tampered)).toThrow();
  });
});
