import { jest } from "@jest/globals";
import type { NextFunction, Request, Response } from "express";

import { prisma } from "../src/db/prisma.js";
import { getDonationAnchors } from "../src/routes/donor.js";
import { computeChainHashFromPayloadHash, hashProvenanceEvent, serializeProvenanceEvent } from "../src/utils/provenance.js";

function response() {
  const res = {
    status: jest.fn(),
    json: jest.fn(),
  };
  res.status.mockReturnValue(res as never);
  res.json.mockReturnValue(res as never);
  return res;
}

describe("getDonationAnchors", () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it("returns provenance and anchor status for the authenticated donor's donation", async () => {
    const occurredAt = new Date("2026-10-15T00:00:00.000Z");
    const eventInput = {
      eventType: "DONATION_SUCCESS",
      entityType: "Donation",
      entityId: "02468100-6f1a-44a1-b3b1-87ba538a00b8",
      amountInr: "250.00",
      ngoId: "12468100-6f1a-44a1-b3b1-87ba538a00b8",
      campaignId: null,
      occurredAt,
    };
    const payloadHash = hashProvenanceEvent(eventInput);
    const event = {
      id: 1n,
      ...eventInput,
      canonicalPayload: serializeProvenanceEvent(eventInput),
      payloadHash,
      previous_hash: null,
      chainHash: computeChainHashFromPayloadHash(payloadHash, null),
      anchorStatus: "ANCHORED",
      anchorBatchId: null,
      anchorBatch: null,
    };
    const donationLookup = jest
      .spyOn(prisma.donation, "findFirst")
      .mockResolvedValue({ id: "donation-1" } as never);
    const provenanceLookup = jest
      .spyOn(prisma.provenanceEvent, "findMany")
      .mockResolvedValue([event] as never);
    const req = {
      params: { id: "donation-1" },
      user: { id: "donor-1" },
    } as unknown as Request;
    const res = response();

    await getDonationAnchors(req, res as unknown as Response, jest.fn() as NextFunction);

    expect(donationLookup).toHaveBeenCalledWith({
      where: { id: "donation-1", donorId: "donor-1" },
      select: { id: true },
    });
    expect(provenanceLookup).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          entityType: "Donation",
          entityId: "donation-1",
        },
      }),
    );
    expect(res.json).toHaveBeenCalledWith({
      anchors: [
        expect.objectContaining({
          eventType: "DONATION_SUCCESS",
          payloadHash,
          chainHash: event.chainHash,
          status: "ANCHORED",
          batchStatus: null,
          transactionSignature: null,
          anchorPda: null,
          anchoredAt: null,
          verification: expect.objectContaining({
            provenance: { status: "PASSED" },
            batchRoot: { status: "NOT_APPLICABLE", reason: expect.any(String) },
            anchorStatus: "ANCHORED",
            attestationSignature: { status: "UNAVAILABLE", reason: expect.any(String) },
          }),
        }),
      ],
    });
  });

  it("does not reveal anchor records for another donor's donation", async () => {
    const donationLookup = jest
      .spyOn(prisma.donation, "findFirst")
      .mockResolvedValue(null as never);
    const provenanceLookup = jest.spyOn(prisma.provenanceEvent, "findMany");
    const req = {
      params: { id: "other-donation" },
      user: { id: "donor-1" },
    } as unknown as Request;
    const res = response();

    await getDonationAnchors(req, res as unknown as Response, jest.fn() as NextFunction);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(provenanceLookup).not.toHaveBeenCalled();
    expect(donationLookup).toHaveBeenCalledTimes(1);
  });
});
