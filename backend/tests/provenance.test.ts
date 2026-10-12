import {
  hashProvenanceEvent,
  normalizeAmountInr,
  serializeProvenanceEvent,
  computeChainHash,
  computeChainHashFromPayloadHash,
} from "../src/utils/provenance.js";

const fixture = {
  eventType: "DONATION_SUCCESS",
  entityType: "Donation",
  entityId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  amountInr: "1250.5",
  ngoId: "123e4567-e89b-12d3-a456-426614174000",
  campaignId: "987e6543-e21b-12d3-a456-426614174111",
  occurredAt: new Date("2026-01-02T03:04:05.678Z"),
};

describe("provenance canonical serialization", () => {
  it("produces the exact canonical JSON string", () => {
    expect(serializeProvenanceEvent(fixture)).toBe(
      '{"schemaVersion":1,"eventType":"DONATION_SUCCESS","entityType":"Donation","entityId":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","amountInr":"1250.50","ngoId":"123e4567-e89b-12d3-a456-426614174000","campaignId":"987e6543-e21b-12d3-a456-426614174111","occurredAt":"2026-01-02T03:04:05.678Z"}',
    );
  });

  it("produces the exact SHA-512 digest for a deterministic fixture", () => {
    expect(hashProvenanceEvent(fixture)).toBe(
      "1168da37f25a7d5e50be5bc563419a45bee2827df4d2ab685928c81eaccc44fda1397c33ac528c28ae95f24f0c3a648293078ee27cdf09dc8f0a45b416349a1c",
    );
  });

  it("serializes optional identifiers as explicit nulls and preserves field order", () => {
    const serialized = serializeProvenanceEvent({
      ...fixture,
      ngoId: null,
      campaignId: null,
    });

    expect(serialized).toBe(
      '{"schemaVersion":1,"eventType":"DONATION_SUCCESS","entityType":"Donation","entityId":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","amountInr":"1250.50","ngoId":null,"campaignId":null,"occurredAt":"2026-01-02T03:04:05.678Z"}',
    );
    expect(serialized.indexOf('"ngoId"')).toBeLessThan(serialized.indexOf('"campaignId"'));
    expect(serialized.indexOf('"campaignId"')).toBeLessThan(serialized.indexOf('"occurredAt"'));
  });

  it("normalizes decimal strings without floating-point rounding", () => {
    expect(normalizeAmountInr("0")).toBe("0.00");
    expect(normalizeAmountInr("1250")).toBe("1250.00");
    expect(normalizeAmountInr("1250.5")).toBe("1250.50");
    expect(normalizeAmountInr("1250.50")).toBe("1250.50");
  });

  it("normalizes timestamps deterministically to UTC milliseconds", () => {
    expect(hashProvenanceEvent(fixture)).toBe(hashProvenanceEvent({
      ...fixture,
      occurredAt: new Date("2026-01-02T08:34:05.678+05:30"),
    }));
  });

  it("rejects invalid input", () => {
    expect(() => normalizeAmountInr(0.1 as unknown as string)).toThrow();
    expect(() => normalizeAmountInr("1.001")).toThrow();
    expect(() => normalizeAmountInr("01.00")).toThrow();
    expect(() => serializeProvenanceEvent({ ...fixture, entityId: "donation-123" })).toThrow();
    expect(() => serializeProvenanceEvent({ ...fixture, ngoId: "not-a-uuid" })).toThrow();
    expect(() => serializeProvenanceEvent({ ...fixture, occurredAt: new Date("invalid") })).toThrow();
    expect(() => serializeProvenanceEvent({ ...fixture, entityType: "" })).toThrow();
  });
});

describe("chain hash computation", () => {
  const baseInput = {
    eventType: "DONATION_SUCCESS",
    entityType: "Donation",
    entityId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    amountInr: "1250.5",
    ngoId: "123e4567-e89b-12d3-a456-426614174000",
    campaignId: "987e6543-e21b-12d3-a456-426614174111",
    occurredAt: new Date("2026-01-02T03:04:05.678Z"),
  };

  it("computes genesis chain hash correctly", () => {
    const chainHash = computeChainHash(baseInput, null);

  expect(chainHash).toBe(
    "9d13e277679d69ba0b0a8fd74e3f4c5c14c0c2d3fc46d5d196ad043eec10a283ad8da0d911b0f16820a314bca70d05113e994afefb2864ddcd623f7f1b7680d7",
  );
  expect(chainHash).toMatch(/^[0-9a-f]{128}$/);
  expect(computeChainHash(baseInput, null)).toBe(chainHash);
  });

  it("computes sequential chain links correctly", () => {
    const firstChainHash = computeChainHash(baseInput, null);
    const secondChainHash = computeChainHash(
      {
        ...baseInput,
        entityId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      },
      firstChainHash
    );
    expect(secondChainHash.length).toBe(128);
    expect(/^[0-9a-f]{128}$/.test(secondChainHash)).toBe(true);
    // Different inputs should produce different hashes
    expect(firstChainHash).not.toBe(secondChainHash);
    // Same inputs should produce same output
    expect(
      computeChainHash(
        {
          ...baseInput,
          entityId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        },
        firstChainHash
      )
    ).toBe(secondChainHash);
  });

  it("throws on invalid hex inputs", () => {
    expect(() =>
      computeChainHash(baseInput, "nothex")
    ).toThrow(/Invalid previousChainHash/);
    expect(() =>
      computeChainHash(baseInput, "0123456789abcdef".repeat(8) + "X")
    ).toThrow(/Invalid previousChainHash/);
    // Test with invalid previous hash length
    expect(() =>
      computeChainHash(baseInput, "0123456789abcdef".repeat(8) + "012") // 125 chars
    ).toThrow(/Invalid previousChainHash/);
  });

  it("is sensitive to payload tampering", () => {
    const chainHash1 = computeChainHash(baseInput, null);
    const chainHash2 = computeChainHash(
      {
        ...baseInput,
        amountInr: "1250.6" // Changed amount
      },
      null
    );
    expect(chainHash1).not.toBe(chainHash2);
  });

  it("is sensitive to link tampering", () => {
    const firstHash = computeChainHash(baseInput, null);
    const secondHash1 = computeChainHash(
      {
        ...baseInput,
        entityId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      },
      firstHash
    );
    // Tamper with the last character of the previous hash (keep it 128 chars)
    const tamperedHash = firstHash.slice(0, -1) + (firstHash.endsWith('a') ? 'b' : 'a');
    const secondHash2 = computeChainHash(
      {
        ...baseInput,
        entityId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      },
      tamperedHash
    );
    expect(secondHash1).not.toBe(secondHash2);
  });

  it("computes a chain hash from a validated stored payload hash", () => {
  const payloadHash = hashProvenanceEvent(baseInput);

  expect(computeChainHashFromPayloadHash(payloadHash, null)).toBe(
    computeChainHash(baseInput, null),
  );
});

it("rejects invalid payload hash encodings", () => {
  expect(() =>
    computeChainHashFromPayloadHash("nothex", null),
  ).toThrow(/payloadHash/);

  expect(() =>
    computeChainHashFromPayloadHash("A".repeat(128), null),
  ).toThrow(/payloadHash/);

  expect(() =>
    computeChainHashFromPayloadHash("a".repeat(127), null),
  ).toThrow(/payloadHash/);
});
});
