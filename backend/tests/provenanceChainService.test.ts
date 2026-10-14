import { Prisma } from "../generated/prisma/client.js";
import { ProvenanceEventType } from "../generated/prisma/enums.js";
import {
  appendProvenanceEvent,
  verifyProvenanceEvents,
  type ProvenanceEventForVerification,
} from "../src/services/provenanceChainService.js";
import {
  computeChainHash,
  hashProvenanceEvent,
  serializeProvenanceEvent,
  type ProvenanceEventInput,
} from "../src/utils/provenance.js";

const firstInput = {
  eventType: ProvenanceEventType.DONATION_SUCCESS,
  entityType: "Donation",
  entityId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  amountInr: "1250.50",
  ngoId: "123e4567-e89b-12d3-a456-426614174000",
  campaignId: "987e6543-e21b-12d3-a456-426614174111",
  occurredAt: new Date("2026-01-02T03:04:05.678Z"),
} satisfies ProvenanceEventInput;

const secondInput = {
  ...firstInput,
  entityId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  occurredAt: new Date("2026-01-02T03:05:05.678Z"),
} satisfies ProvenanceEventInput;

function makeEvent(
  id: bigint,
  input: ProvenanceEventInput,
  previousChainHash: string | null,
): ProvenanceEventForVerification {
  return {
    id,
    ...input,
    amountInr: "1250.50",
    canonicalPayload: serializeProvenanceEvent(input),
    payloadHash: hashProvenanceEvent(input),
    previous_hash: previousChainHash,
    chainHash: computeChainHash(input, previousChainHash),
  };
}

describe("appendProvenanceEvent", () => {
  it("locks before reading the latest chained event and links to its chainHash", async () => {
    const previousChainHash = computeChainHash(firstInput, null);
    const lock = jest.fn().mockResolvedValue([{ locked: 1 }]);
    const findFirst = jest.fn().mockResolvedValue({ chainHash: previousChainHash });
    const create = jest.fn().mockImplementation(({ data }) => data);
    const tx = {
      $queryRaw: lock,
      provenanceEvent: { findFirst, create },
    } as unknown as Prisma.TransactionClient;

    const result = await appendProvenanceEvent(
      tx,
      secondInput,
      "transition-2",
    );

    expect(lock.mock.invocationCallOrder[0]).toBeLessThan(
      findFirst.mock.invocationCallOrder[0],
    );
    expect(findFirst).toHaveBeenCalledWith({
      where: { chainHash: { not: null } },
      orderBy: { id: "desc" },
      select: { chainHash: true },
    });
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        canonicalPayload: serializeProvenanceEvent(secondInput),
        payloadHash: hashProvenanceEvent(secondInput),
        previous_hash: previousChainHash,
        chainHash: computeChainHash(secondInput, previousChainHash),
        transitionKey: "transition-2",
      }),
    });
    expect(result).toMatchObject({
      previous_hash: previousChainHash,
      chainHash: computeChainHash(secondInput, previousChainHash),
    });
  });

  it("starts a new chain independently of legacy events", async () => {
    const lock = jest.fn().mockResolvedValue([{ locked: 1 }]);
    const findFirst = jest.fn().mockResolvedValue(null);
    const create = jest.fn().mockImplementation(({ data }) => data);
    const tx = {
      $queryRaw: lock,
      provenanceEvent: { findFirst, create },
    } as unknown as Prisma.TransactionClient;

    const result = await appendProvenanceEvent(
      tx,
      firstInput,
      "transition-1",
    );

    expect(result.previous_hash).toBeNull();
    expect(result.chainHash).toBe(computeChainHash(firstInput, null));
  });
});

describe("verifyProvenanceEvents", () => {
  it("validates links while leaving legacy rows outside the new chain", () => {
    const first = makeEvent(2n, firstInput, null);
    const second = makeEvent(7n, secondInput, first.chainHash);
    const legacy: ProvenanceEventForVerification = {
      ...first,
      id: 1n,
      previous_hash: "legacy-payload-digest",
      chainHash: null,
    };

    expect(verifyProvenanceEvents([legacy, first, second])).toEqual({
      valid: true,
      checkedEvents: 2,
      legacyEvents: 1,
      errors: [],
    });
  });

  it("rejects non-NULL genesis links and missing intermediate events", () => {
    const first = makeEvent(1n, firstInput, null);
    const second = makeEvent(2n, secondInput, first.chainHash);
    const thirdInput = { ...firstInput, amountInr: "88.00" };
    const third = makeEvent(3n, thirdInput, second.chainHash);
    const withoutMiddle = verifyProvenanceEvents([first, third]);
    const invalidGenesis = verifyProvenanceEvents([
      { ...first, previous_hash: "f".repeat(128) },
    ]);

    expect(withoutMiddle.valid).toBe(false);
    expect(withoutMiddle.errors).toContainEqual({
      eventId: "3",
      reason: "previous_hash does not match the preceding chained event",
    });
    expect(invalidGenesis.errors).toContainEqual({
      eventId: "1",
      reason: "genesis previous_hash must be NULL",
    });
  });

  it("rejects payload, canonical data, predecessor, and chain hash tampering", () => {
    const first = makeEvent(1n, firstInput, null);
    const second = makeEvent(2n, secondInput, first.chainHash!);
    const tampered = verifyProvenanceEvents([
      first,
      {
        ...second,
        amountInr: "999.00",
        canonicalPayload: second.canonicalPayload.replace("1250.50", "999.00"),
        previous_hash: "f".repeat(128),
        chainHash: "e".repeat(128),
      },
    ]);

    expect(tampered.valid).toBe(false);
    expect(tampered.errors.map(({ reason }) => reason)).toEqual(
      expect.arrayContaining([
        "previous_hash does not match the preceding chained event",
        "payloadHash does not match the event",
        "chainHash does not match the event",
      ]),
    );
  });
});
