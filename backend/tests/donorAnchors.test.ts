import { jest } from "@jest/globals";
import type { NextFunction, Request, Response } from "express";

import { prisma } from "../src/db/prisma.js";
import { getDonationAnchors } from "../src/routes/donor.js";

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
    const donationLookup = jest
      .spyOn(prisma.donation, "findFirst")
      .mockResolvedValue({ id: "donation-1" } as never);
    const provenanceLookup = jest
      .spyOn(prisma.provenanceEvent, "findMany")
      .mockResolvedValue([
      {
        eventType: "DONATION_SUCCESS",
        payloadHash: "a".repeat(128),
        chainHash: "c".repeat(128),
        anchorStatus: "ANCHORED",
        anchorBatchId: "batch-1",
        anchorBatch: {
          status: "CONFIRMED",
          auditRoot: "b".repeat(128),
          solanaTxSignature: "devnet-signature",
          anchorPda: "anchor-pda",
          anchoredAt: new Date("2026-10-15T00:00:00.000Z"),
        },
      },
      ] as never);
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
          payloadHash: "a".repeat(128),
          chainHash: "c".repeat(128),
          status: "ANCHORED",
          batchStatus: "CONFIRMED",
          transactionSignature: "devnet-signature",
          anchorPda: "anchor-pda",
          anchoredAt: "2026-10-15T00:00:00.000Z",
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
