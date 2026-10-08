import {
  hashProvenanceEvent,
  normalizeAmountInr,
  serializeProvenanceEvent,
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
