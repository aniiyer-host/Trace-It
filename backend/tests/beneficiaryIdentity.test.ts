import { HashService } from "../src/services/hashService.js";
import { decryptBeneficiaryForMigration } from "../src/services/beneficiaryEncryptionMigration.js";
import crypto from "node:crypto";

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

  it("rejects unversioned CBC ciphertext at runtime while the migration-only reader can decode it", () => {
    const key = Buffer.alloc(32, 9);
    process.env.AES_BENEFICIARY_KEY = key.toString("hex");
    const iv = Buffer.alloc(16, 4);
    const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
    const legacy = Buffer.concat([iv, cipher.update("legacy beneficiary", "utf8"), cipher.final()]).toString("base64");

    expect(() => HashService.decryptSensitiveValue(legacy)).toThrow("must be migrated");
    expect(decryptBeneficiaryForMigration(legacy)).toBe("legacy beneficiary");
    expect(() => decryptBeneficiaryForMigration(`v2:${legacy}`)).toThrow("unsupported legacy encryption version");
  });
});
