import { Keypair } from "@solana/web3.js";
import { readFileSync } from "fs";
import path from "path";
import {
  BlockchainService,
  LEGACY_BLOCKCHAIN_WRITE_RETIRED,
  legacyBlockchainWritesAreRetired,
} from "../src/services/blockchainService.js";
import {
  getBlockchainService,
  getLegacyBlockchainReader,
} from "../src/services/blockchainInstance.js";
import BlockchainRetryProcessor from "../src/services/blockchainRetryProcessor.js";

describe("Phase 6 legacy blockchain cutover", () => {
  const service = new BlockchainService({
    programId: "EtEXYLyycGoLvBxP7eQPhaTTb75BFs2EfLdPHr9yk2sG",
    walletKeypairJson: Array.from(Keypair.generate().secretKey),
    hmacSecret: "test-only",
  });

  it("permanently closes the application legacy-write gateway", async () => {
    expect(legacyBlockchainWritesAreRetired()).toBe(true);
    await expect(getBlockchainService()).resolves.toBeNull();
  });

  it("retains a separate historical read factory", () => {
    expect(typeof getLegacyBlockchainReader).toBe("function");

    const idl = JSON.parse(
      readFileSync(
        path.resolve(__dirname, "../../blockchain/idl/traceit_legacy.json"),
        "utf8",
      ),
    );
    expect(idl).toMatchObject({ name: "traceit", version: "0.1.0" });
    expect(idl.accounts.map((account: { name: string }) => account.name)).toEqual(
      expect.arrayContaining([
        "DonationRecord",
        "NgoRecord",
        "CohortRecord",
        "DisbursementRecord",
        "AttestationAccount",
      ]),
    );
  });

  it.each([
    [
      "recordDonation",
      () =>
        service.recordDonation({
          donationId: "donation-1",
          donorUserId: "donor-1",
          ngoId: "ngo-1",
          campaignId: "campaign-1",
          amountInr: 100,
          currency: "INR",
          timestamp: new Date(0),
        }),
    ],
    ["updateDonationStatus", () => service.updateDonationStatus("donation-1", 2)],
    [
      "registerNgo",
      () => service.registerNgo({ ngoId: "ngo-1", metadataHash: "hash" }),
    ],
    [
      "registerCohort",
      () =>
        service.registerCohort({
          cohortId: "cohort-1",
          ngoId: "ngo-1",
          metadataHash: "hash",
        }),
    ],
    [
      "recordDisbursement",
      () =>
        service.recordDisbursement({
          disbursementId: "disbursement-1",
          ngoId: "ngo-1",
          cohortId: "cohort-1",
          amountInr: 100,
          currency: "INR",
          timestamp: new Date(0),
          transactionHash: "payment-reference",
        }),
    ],
    [
      "storeNgoAttestation",
      () =>
        service.storeNgoAttestation({
          donationId: "donation-1",
          ngoId: "ngo-1",
          attestationMessage: "receipt",
          attestationMessageHash: "hash",
          ngoPublicKey: "",
          signedAt: 1,
        }),
    ],
    [
      "storeNgpAttestation",
      () =>
        service.storeNgpAttestation({
          donationId: "donation-1",
          ngoId: "ngo-1",
          attestationMessage: "receipt",
          attestationMessageHash: "hash",
          ngoPublicKey: "",
          signedAt: 1,
        }),
    ],
    [
      "storeDeliveryAttestation",
      () =>
        service.storeDeliveryAttestation({
          donationId: "donation-1",
          ngoId: "ngo-1",
          beneficiaryIdHash: "beneficiary-hash",
          attestationMessage: "delivery",
          attestationMessageHash: "hash",
          ngoPublicKey: "",
          signedAt: 1,
        }),
    ],
  ])("fails %s closed without making an RPC call", async (operation, invoke) => {
    await expect(invoke()).resolves.toEqual({
      success: false,
      txHash: null,
      error: `${LEGACY_BLOCKCHAIN_WRITE_RETIRED}:${operation}`,
    });
  });

  it("turns the legacy retry processor into a transaction-free no-op", async () => {
    const warning = jest.spyOn(console, "warn").mockImplementation(() => {});
    const processor = new BlockchainRetryProcessor();

    await expect(processor.start()).resolves.toBeUndefined();
    processor.stop();

    expect(warning).toHaveBeenCalledWith(
      expect.stringContaining("legacy queue rows will not be executed"),
    );
    warning.mockRestore();
  });
});
