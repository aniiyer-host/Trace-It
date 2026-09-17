import request from "supertest";
import jwt from "jsonwebtoken";
import crypto from "crypto";

import app from "../src/index";

import { prisma } from "../src/db/prisma";
import { UserRole, KycStatus } from "../generated/prisma/enums";

const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || "access_secret";

describe("Donor KYC", () => {
  let donorId: string;
  let donorToken: string;

  beforeAll(async () => {
    const donor = await prisma.profile.create({
      data: {
        email: `kyc-donor-${crypto.randomUUID()}@test.com`,
        role: UserRole.DONOR,
        kycStatus: KycStatus.NOT_REQUIRED,
        isVerified: true,
      },
    });

    donorId = donor.id;

    donorToken = jwt.sign({ userId: donor.id }, JWT_ACCESS_SECRET, {
      expiresIn: "1h",
    });
  });

  afterAll(async () => {
    await prisma.profile.deleteMany({
      where: { id: donorId },
    });

    await prisma.$disconnect();
  });

  it("approves KYC for a valid PAN", async () => {
    const response = await request(app)
      .post("/api/donor/kyc")
      .set("Authorization", `Bearer ${donorToken}`)
      .send({ pan: "ABCDE1234F" });

    expect(response.status).toBe(200);

    expect(response.body).toEqual({
      message: "KYC approved successfully",
      kycStatus: "APPROVED",
    });

    const profile = await prisma.profile.findUnique({
      where: { id: donorId },
      select: {
        kycStatus: true,
        panHash: true,
      },
    });

    expect(profile?.kycStatus).toBe(KycStatus.APPROVED);

    expect(profile?.panHash).toBeDefined();
    expect(profile?.panHash).not.toBe("ABCDE1234F");
    expect(profile?.panHash).toHaveLength(128);
  });

  it("rejects an invalid PAN format", async () => {
    const response = await request(app)
      .post("/api/donor/kyc")
      .set("Authorization", `Bearer ${donorToken}`)
      .send({ pan: "INVALID123" });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain("Invalid PAN format");
  });

  it("rejects a PAN with the wrong length", async () => {
    const response = await request(app)
      .post("/api/donor/kyc")
      .set("Authorization", `Bearer ${donorToken}`)
      .send({ pan: "ABCDE1234" });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("PAN must be exactly 10 characters");
  });

  it("rejects a missing PAN", async () => {
    const response = await request(app)
      .post("/api/donor/kyc")
      .set("Authorization", `Bearer ${donorToken}`)
      .send({});

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("PAN is required");
  });

  it("prevents KYC re-submission after approval", async () => {
    const response = await request(app)
      .post("/api/donor/kyc")
      .set("Authorization", `Bearer ${donorToken}`)
      .send({ pan: "FGHIJ5678K" });

    expect(response.status).toBe(409);
    expect(response.body.error).toBe("KYC already approved");
  });

  it("requires authentication", async () => {
    const response = await request(app)
      .post("/api/donor/kyc")
      .send({ pan: "ABCDE1234F" });

    expect(response.status).toBe(401);
  });
});
