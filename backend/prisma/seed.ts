// import { prisma } from "../src/db/prisma";
// import bcrypt from "bcryptjs";

// const TEST_NGO_EMAIL = process.env.TRACEIT_TEST_NGO_EMAIL?.trim() || "ngo@traceit.dev";
// const TEST_DONOR_EMAIL = process.env.TRACEIT_TEST_DONOR_EMAIL?.trim() || "donor@traceit.dev";

// const requireValidSeedEmail = (name: string, email: string): void => {
//   if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
//     throw new Error(`${name} must contain a valid email address`);
//   }
// };

// async function main() {
//   requireValidSeedEmail("TRACEIT_TEST_NGO_EMAIL", TEST_NGO_EMAIL);
//   requireValidSeedEmail("TRACEIT_TEST_DONOR_EMAIL", TEST_DONOR_EMAIL);

//   // ---------------------------------------------------------------------------
//   // Passwords
//   // ---------------------------------------------------------------------------
//   const adminPasswordHash = await bcrypt.hash("admin-secret", 12);
//   const ngoPasswordHash = await bcrypt.hash("ngo-secret", 12);
//   const donorPasswordHash = await bcrypt.hash("donor-secret", 12);

//   // ---------------------------------------------------------------------------
//   // Admin
//   // ---------------------------------------------------------------------------
//   const admin = await prisma.profile.upsert({
//     where: { email: "admin@traceit.dev" },
//     update: {
//       fullName: "TraceIt Admin",
//       role: "ADMIN",
//       isVerified: true,
//       ngoStatus: "ACTIVE",
//       passwordHash: adminPasswordHash,
//     },
//     create: {
//       id: "11111111-1111-1111-1111-111111111111",
//       email: "admin@traceit.dev",
//       fullName: "TraceIt Admin",
//       role: "ADMIN",
//       isVerified: true,
//       ngoStatus: "ACTIVE",
//       passwordHash: adminPasswordHash,
//     },
//   });

//   console.log("Upserted seeded admin account.");

//   // ---------------------------------------------------------------------------
//   // NGO
//   // ---------------------------------------------------------------------------
//   const ngo = await prisma.profile.upsert({
//     where: { id: "22222222-2222-2222-2222-222222222222" },
//     update: {
//       email: TEST_NGO_EMAIL,
//       fullName: "NGO Operator",
//       role: "CHARITY",
//       isVerified: true,
//       ngoStatus: "ACTIVE",
//       organisationName: "Hope Relief Foundation",
//       registrationNo: "REG-001",
//       passwordHash: ngoPasswordHash,
//     },
//     create: {
//       id: "22222222-2222-2222-2222-222222222222",
//       email: TEST_NGO_EMAIL,
//       fullName: "NGO Operator",
//       role: "CHARITY",
//       isVerified: true,
//       ngoStatus: "ACTIVE",
//       organisationName: "Hope Relief Foundation",
//       registrationNo: "REG-001",
//       passwordHash: ngoPasswordHash,
//     },
//   });


//   // ---------------------------------------------------------------------------
//   // Donor 1 - KYC APPROVED
//   // ---------------------------------------------------------------------------
//   const donor1 = await prisma.profile.upsert({
//     where: { id: "33333333-3333-3333-3333-333333333333" },
//     update: {
//       email: TEST_DONOR_EMAIL,
//       fullName: "Demo Donor",
//       role: "DONOR",
//       isVerified: true,
//       kycStatus: "APPROVED",
//       passwordHash: donorPasswordHash,
//     },
//     create: {
//       id: "33333333-3333-3333-3333-333333333333",
//       email: TEST_DONOR_EMAIL,
//       fullName: "Demo Donor",
//       role: "DONOR",
//       isVerified: true,
//       kycStatus: "APPROVED",
//       passwordHash: donorPasswordHash,
//     },
//   });


//   // ---------------------------------------------------------------------------

//   // ---------------------------------------------------------------------------
//   // Campaign 1 - ACTIVE
//   // ---------------------------------------------------------------------------
//   const campaign1 = await prisma.campaign.upsert({
//     where: { slug: "flood-relief-kerala" },
//     update: {
//       ngoId: ngo.id,
//       title: "Flood Relief Kerala",
//       description: "Emergency support for flood affected families.",
//       category: "Relief",
//       targetAmount: 500000.0,
//       raisedAmount: 25000.0,
//       currencyCode: "INR",
//       status: "ACTIVE",
//       sdgTags: ["SDG1", "SDG11"],
//     },
//     create: {
//       id: "55555555-5555-5555-5555-555555555555",
//       ngoId: ngo.id,
//       title: "Flood Relief Kerala",
//       slug: "flood-relief-kerala",
//       description: "Emergency support for flood affected families.",
//       category: "Relief",
//       targetAmount: 500000.0,
//       raisedAmount: 25000.0,
//       currencyCode: "INR",
//       status: "ACTIVE",
//       sdgTags: ["SDG1", "SDG11"],
//     },
//   });

//   console.log(`Created campaign: ${campaign1.title}`);

//   // ---------------------------------------------------------------------------
//   // Campaign 2 - DRAFT
//   // ---------------------------------------------------------------------------
//   // const campaign2 = await prisma.campaign.upsert({
//   //   where: { slug: "education-for-all" },
//   //   update: {
//   //     ngoId: ngo.id,
//   //     title: "Education for All",
//   //     description: "Providing school supplies to underprivileged children.",
//   //     category: "Education",
//   //     targetAmount: 300000.0,
//   //     raisedAmount: 0.0,
//   //     currencyCode: "INR",
//   //     status: "DRAFT",
//   //     sdgTags: ["SDG4"],
//   //   },
//   //   create: {
//   //     id: "66666666-6666-6666-6666-666666666666",
//   //     ngoId: ngo.id,
//   //     title: "Education for All",
//   //     slug: "education-for-all",
//   //     description: "Providing school supplies to underprivileged children.",
//   //     category: "Education",
//   //     targetAmount: 300000.0,
//   //     raisedAmount: 0.0,
//   //     currencyCode: "INR",
//   //     status: "DRAFT",
//   //     sdgTags: ["SDG4"],
//   //   },
//   // });

//   // console.log(`Created campaign: ${campaign2.title}`);

//   // ---------------------------------------------------------------------------
//   // Campaign 3 - PENDING APPROVAL
//   // ---------------------------------------------------------------------------
//   // const campaign3 = await prisma.campaign.upsert({
//   //   where: { slug: "clean-water-initiative" },
//   //   update: {
//   //     ngoId: ngo.id,
//   //     title: "Clean Water Initiative",
//   //     description: "Building wells in rural communities.",
//   //     category: "Health",
//   //     targetAmount: 200000.0,
//   //     raisedAmount: 0.0,
//   //     currencyCode: "INR",
//   //     status: "ACTIVE",
//   //     sdgTags: ["SDG6"],
//   //   },
//   //   create: {
//   //     id: "77777777-7777-7777-7777-777777777777",
//   //     ngoId: ngo.id,
//   //     title: "Clean Water Initiative",
//   //     slug: "clean-water-initiative",
//   //     description: "Building wells in rural communities.",
//   //     category: "Health",
//   //     targetAmount: 200000.0,
//   //     raisedAmount: 0.0,
//   //     currencyCode: "INR",
//   //     status: "ACTIVE",
//   //     sdgTags: ["SDG6"],
//   //   },
//   // });

//   // console.log(`Created campaign: ${campaign3.title}`);

//   // ---------------------------------------------------------------------------
//   // Donation
//   // ---------------------------------------------------------------------------
//   const donation1 = await prisma.donation.upsert({
//     where: { publicId: "demoabcd1234" },
//     update: {
//       donorId: donor1.id,
//       ngoId: ngo.id,
//       campaignId: campaign1.id,
//       amount: 5000.0,
//       currencyCode: "INR",
//       paymentMethod: "UPI",
//       status: "SUCCESS",
//       razorpayOrderId: "order_demo_001",
//       razorpayPaymentId: "pay_demo_001",
//     },
//     create: {
//       id: "88888888-8888-8888-8888-888888888888",
//       publicId: "demoabcd1234",
//       donorId: donor1.id,
//       ngoId: ngo.id,
//       campaignId: campaign1.id,
//       amount: 5000.0,
//       currencyCode: "INR",
//       paymentMethod: "UPI",
//       status: "SUCCESS",
//       razorpayOrderId: "order_demo_001",
//       razorpayPaymentId: "pay_demo_001",
//     },
//   });

//   console.log(`Created donation: ${donation1.publicId}`);

//   // ---------------------------------------------------------------------------
//   // Beneficiary Cohort
//   // ---------------------------------------------------------------------------
//   const cohort = await prisma.beneficiaryCohort.upsert({
//     where: {
//       id: "99999999-9999-9999-9999-999999999999",
//     },
//     update: {
//       campaignId: campaign1.id,
//       ngoId: ngo.id,
//       name: "Flood Relief Families - Demo Cohort",
//       beneficiaryCount: 25,
//       description: "Demo beneficiary cohort used for development and testing.",
//     },
//     create: {
//       id: "99999999-9999-9999-9999-999999999999",
//       campaignId: campaign1.id,
//       ngoId: ngo.id,
//       name: "Flood Relief Families - Demo Cohort",
//       beneficiaryCount: 25,
//       description: "Demo beneficiary cohort used for development and testing.",
//     },
//   });

//   console.log(`Created beneficiary cohort: ${cohort.name}`);

//   // ---------------------------------------------------------------------------
//   // Disbursement
//   // ---------------------------------------------------------------------------
//   const disbursement = await prisma.disbursement.upsert({
//     where: {
//       id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
//     },
//     update: {
//       campaignId: campaign1.id,
//       ngoId: ngo.id,
//       cohortId: cohort.id,
//       amountInr: 5000.0,
//       amountSol: null,
//       status: "APPROVED",
//       disbursementType: "PROOF_OF_NEED",
//       proofSubmittedAt: null,
//       rejectionReason: null,
//     },
//     create: {
//       id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
//       campaignId: campaign1.id,
//       ngoId: ngo.id,
//       cohortId: cohort.id,
//       amountInr: 5000.0,
//       disbursementType: "PROOF_OF_NEED",
//       status: "APPROVED",
//     },
//   });

//   console.log(`Created disbursement: ${disbursement.id}`);

//   // ---------------------------------------------------------------------------
//   // Donation Allocation
//   // ---------------------------------------------------------------------------
//   const existingAllocation = await prisma.donationAllocation.findFirst({
//     where: { donationId: donation1.id, disbursementId: disbursement.id },
//     select: { id: true },
//   });
//   if (existingAllocation) {
//     console.log("Demo donation allocation already exists.");
//   } else {
//     await prisma.donationAllocation.create({
//       data: {
//         donationId: donation1.id,
//         disbursementId: disbursement.id,
//         amount: 5000.0,
//       },
//     });
//     console.log("Created demo donation allocation.");
//   }

//   // ---------------------------------------------------------------------------
//   // Donation Attestations
//   // One RECEIPT and one DELIVERY per donation.
//   // ---------------------------------------------------------------------------
//   const receiptAttestation = await prisma.attestation.upsert({
//     where: {
//       donationId_disbursementId_type: {
//         donationId: donation1.id,
//         disbursementId: disbursement.id,
//         type: "RECEIPT",
//       },
//     },
//     update: {
//       requestedBy: donor1.id,
//       status: "PENDING",
//       ngoSignedBy: null,
//       ngoSignedAt: null,
//       approvedBy: null,
//       approvedAt: null,
//       rejectionReason: null,
//     },
//     create: {
//       donationId: donation1.id,
//       disbursementId: disbursement.id,
//       type: "RECEIPT",
//       status: "PENDING",
//       requestedBy: donor1.id,
//     },
//   });

//   console.log(`Created receipt attestation: ${receiptAttestation.id}`);

//   const deliveryAttestation = await prisma.attestation.upsert({
//     where: {
//       donationId_disbursementId_type: {
//         donationId: donation1.id,
//         disbursementId: disbursement.id,
//         type: "DELIVERY",
//       },
//     },
//     update: {
//       requestedBy: donor1.id,
//       status: "PENDING",
//       ngoSignedBy: null,
//       ngoSignedAt: null,
//       approvedBy: null,
//       approvedAt: null,
//       rejectionReason: null,
//     },
//     create: {
//       donationId: donation1.id,
//       disbursementId: disbursement.id,
//       type: "DELIVERY",
//       status: "PENDING",
//       requestedBy: donor1.id,
//     },
//   });

//   console.log(`Created delivery attestation: ${deliveryAttestation.id}`);

//   // ---------------------------------------------------------------------------
//   // Impact Token
//   // ---------------------------------------------------------------------------
//   const impactToken = await prisma.impactToken.upsert({
//     where: {
//       id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
//     },
//     update: {
//       donationId: donation1.id,
//       donorId: donor1.id,
//       minted: false,
//       mintedAt: null,
//       mintAddress: null,
//       metadataUri: null,
//       redeemed: false,
//       redeemedAt: null,
//     },
//     create: {
//       id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
//       donationId: donation1.id,
//       donorId: donor1.id,
//       minted: false,
//       redeemed: false,
//     },
//   });

//   console.log(`Created impact token record: ${impactToken.id}`);

//   // ---------------------------------------------------------------------------
//   // Government Request
//   // ---------------------------------------------------------------------------
//   const governmentRequest = await prisma.governmentRequest.upsert({
//     where: {
//       requestRef: "GOV-DEMO-001",
//     },
//     update: {
//       requestingBody: "Demo Government Authority",
//       legalBasis: "Development and compliance testing",
//       scope: {
//         purpose: "Demo request",
//         fields: ["donation", "donor"],
//       },
//       status: "OPEN",
//       createdBy: admin.id,
//       targetUserId: donor1.id,
//       targetDonationId: donation1.id,
//       processedByAdminId: null,
//       closedAt: null,
//     },
//     create: {
//       id: "cccccccc-cccc-cccc-cccc-cccccccccccc",
//       requestRef: "GOV-DEMO-001",
//       requestingBody: "Demo Government Authority",
//       legalBasis: "Development and compliance testing",
//       scope: {
//         purpose: "Demo request",
//         fields: ["donation", "donor"],
//       },
//       status: "OPEN",
//       createdBy: admin.id,
//       targetUserId: donor1.id,
//       targetDonationId: donation1.id,
//     },
//   });

//   console.log(`Created government request: ${governmentRequest.requestRef}`);

//   // ---------------------------------------------------------------------------
//   // Blockchain Retry Queue
//   //
//   // Keep this empty intentionally. The retry processor should only process
//   // real failed blockchain operations, not artificial seed records.
//   // ---------------------------------------------------------------------------

//   console.log("Blockchain retry queue left empty.");

//   // ---------------------------------------------------------------------------
//   // Final output
//   // ---------------------------------------------------------------------------
//   console.log("\nSeed completed successfully.");

//   console.log("\nSeeded demo accounts; login credentials are not printed.");

//   console.log("\nSeeded test data:");
//   console.log("  ✓ Admin");
//   console.log("  ✓ NGO");
//   console.log("  ✓ Donor with APPROVED KYC");
//   console.log("  ✓ Active campaign");
//   // console.log("  ✓ Draft campaign");
//   // console.log("  ✓ Pending-approval campaign");
//   console.log("  ✓ Successful donation");
//   console.log("  ✓ Beneficiary cohort");
//   // console.log("  ✓ Pending disbursement");
//   console.log("  ✓ Receipt attestation");
//   console.log("  ✓ Delivery attestation");
//   console.log("  ✓ Impact token record");
//   console.log("  ✓ Government request");
// }

// main()
//   .catch((e) => {
//     const errorName = e instanceof Error ? e.name : "UnknownError";
//     console.error(`Seed failed (${errorName}); details omitted to avoid exposing account data.`);
//     process.exit(1);
//   })
//   .finally(async () => {
//     await prisma.$disconnect();
//   });


import bcrypt from "bcryptjs";
import { Prisma } from "../generated/prisma/client.js";
import { prisma } from "../src/db/prisma.js";
import { verifyProvenanceChain } from "../src/services/provenanceChainService.js";
import { getEmailAddressIssue } from "../src/services/email/recipientValidation.js";

const TEST_NGO_EMAIL = process.env.TRACEIT_TEST_NGO_EMAIL?.trim() || "ngo@traceit.dev";
const TEST_DONOR_EMAIL = process.env.TRACEIT_TEST_DONOR_EMAIL?.trim() || "donor@traceit.dev";
const TEST_ADMIN_EMAIL = process.env.TRACEIT_TEST_ADMIN_EMAIL?.trim() || "admin@traceit.dev";
const DEMO_DATABASE_NAME = "traceit_demo";
const DEMO_DONATION_ID = "44444444-4444-4444-8444-444444444444";
const DEMO_ORDER_ID = "order_demo_traceit_flood_relief_v1";
const DEMO_DONATION_AMOUNT = new Prisma.Decimal("500.00");

class DemoSeedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DemoSeedError";
  }
}

function requireDemoDatabaseUrl(name: "DATABASE_URL" | "DIRECT_DATABASE_URL"): void {
  const value = process.env[name];
  if (!value) {
    if (name === "DIRECT_DATABASE_URL") return;
    throw new DemoSeedError(`${name} must target ${DEMO_DATABASE_NAME}`);
  }

  let target: URL;
  let databaseName: string;
  try {
    target = new URL(value);
    databaseName = decodeURIComponent(target.pathname.replace(/^\/+/, ""));
  } catch {
    throw new DemoSeedError(`${name} must be a valid PostgreSQL URL for ${DEMO_DATABASE_NAME}`);
  }
  if (databaseName !== DEMO_DATABASE_NAME) {
    throw new DemoSeedError(`Refusing to seed ${databaseName || "an unspecified database"}; expected ${DEMO_DATABASE_NAME}`);
  }

  const expectedHost = process.env.TRACEIT_DEMO_DATABASE_HOST?.trim().toLowerCase().replace(/\.$/, "");
  const configuredHost = target.hostname.toLowerCase().replace(/\.$/, "");
  if (!expectedHost || configuredHost !== expectedHost) {
    throw new DemoSeedError(`${name} host must match the explicitly configured TRACEIT_DEMO_DATABASE_HOST`);
  }
}

function validateSeedConfiguration(): void {
  requireDemoDatabaseUrl("DATABASE_URL");
  requireDemoDatabaseUrl("DIRECT_DATABASE_URL");

  for (const worker of [
    "TRACEIT_ANCHOR_WORKER_ENABLED",
    "TRACEIT_EMAIL_WORKER_ENABLED",
    "TRACEIT_REFUND_WORKER_ENABLED",
  ]) {
    if (process.env[worker] === "true") {
      throw new DemoSeedError(`${worker} must be disabled while seeding the demo database`);
    }
  }

  const emails = [
    ["TRACEIT_TEST_NGO_EMAIL", TEST_NGO_EMAIL],
    ["TRACEIT_TEST_DONOR_EMAIL", TEST_DONOR_EMAIL],
    ["TRACEIT_TEST_ADMIN_EMAIL", TEST_ADMIN_EMAIL],
  ] as const;
  for (const [name, email] of emails) {
    if (getEmailAddressIssue(email) !== "placeholder") {
      throw new DemoSeedError(`${name} must be a valid non-deliverable demo email address`);
    }
  }
  if (new Set(emails.map(([, email]) => email.toLowerCase())).size !== emails.length) {
    throw new DemoSeedError("Demo profile email addresses must be distinct");
  }
}

async function assertConnectedToDemoDatabase(): Promise<void> {
  const rows = await prisma.$queryRaw<Array<{ databaseName: string }>>`
    SELECT current_database() AS "databaseName"
  `;
  if (rows[0]?.databaseName !== DEMO_DATABASE_NAME) {
    throw new DemoSeedError(`Connected database is not ${DEMO_DATABASE_NAME}`);
  }
}

async function assertNoPriorSuccessArtifacts(donationId: string): Promise<void> {
  const [successEvents, receiptAttestations, retryQueueItem, emailOutboxEntries] =
    await Promise.all([
      prisma.provenanceEvent.count({
        where: { entityId: donationId, eventType: "DONATION_SUCCESS" },
      }),
      prisma.attestation.count({
        where: {
          donationId,
          disbursementId: null,
          type: "RECEIPT",
        },
      }),
      prisma.blockchainRetryQueue.findUnique({ where: { donationId } }),
      prisma.emailOutbox.count({ where: { donationId } }),
    ]);

  if (successEvents || receiptAttestations || retryQueueItem || emailOutboxEntries) {
    throw new DemoSeedError("An INITIATED demo donation has success artifacts; refusing to repair inconsistent history");
  }
}

async function main(): Promise<void> {
  validateSeedConfiguration();
  await assertConnectedToDemoDatabase();

  const [adminPasswordHash, ngoPasswordHash, donorPasswordHash] =
    await Promise.all([
      bcrypt.hash("admin-secret", 12),
      bcrypt.hash("ngo-secret", 12),
      bcrypt.hash("donor-secret", 12),
    ]);

  const admin = await prisma.profile.upsert({
    where: { id: "11111111-1111-1111-1111-111111111111" },
    update: {
      email: TEST_ADMIN_EMAIL,
      fullName: "TraceIt Admin",
      role: "ADMIN",
      isVerified: true,
      ngoStatus: "ACTIVE",
      passwordHash: adminPasswordHash,
    },
    create: {
      id: "11111111-1111-1111-1111-111111111111",
      email: TEST_ADMIN_EMAIL,
      fullName: "TraceIt Admin",
      role: "ADMIN",
      isVerified: true,
      ngoStatus: "ACTIVE",
      passwordHash: adminPasswordHash,
    },
  });

  const ngo = await prisma.profile.upsert({
    where: { id: "22222222-2222-2222-2222-222222222222" },
    update: {
      email: TEST_NGO_EMAIL,
      fullName: "NGO Operator",
      role: "CHARITY",
      isVerified: true,
      ngoStatus: "ACTIVE",
      organisationName: "Hope Relief Foundation",
      registrationNo: "REG-001",
      passwordHash: ngoPasswordHash,
    },
    create: {
      id: "22222222-2222-2222-2222-222222222222",
      email: TEST_NGO_EMAIL,
      fullName: "NGO Operator",
      role: "CHARITY",
      isVerified: true,
      ngoStatus: "ACTIVE",
      organisationName: "Hope Relief Foundation",
      registrationNo: "REG-001",
      passwordHash: ngoPasswordHash,
    },
  });

  const donor = await prisma.profile.upsert({
    where: { id: "33333333-3333-3333-3333-333333333333" },
    update: {
      email: TEST_DONOR_EMAIL,
      fullName: "Demo Donor",
      role: "DONOR",
      isVerified: true,
      kycStatus: "APPROVED",
      passwordHash: donorPasswordHash,
    },
    create: {
      id: "33333333-3333-3333-3333-333333333333",
      email: TEST_DONOR_EMAIL,
      fullName: "Demo Donor",
      role: "DONOR",
      isVerified: true,
      kycStatus: "APPROVED",
      passwordHash: donorPasswordHash,
    },
  });

  const campaign = await prisma.campaign.upsert({
    where: { slug: "flood-relief-kerala" },
    update: {
      ngoId: ngo.id,
      title: "Flood Relief Kerala",
      description: "Emergency support for flood affected families.",
      category: "Relief",
      targetAmount: 500000.0,
      currencyCode: "INR",
      status: "ACTIVE",
      sdgTags: ["SDG1", "SDG11"],
    },
    create: {
      id: "55555555-5555-5555-5555-555555555555",
      ngoId: ngo.id,
      title: "Flood Relief Kerala",
      slug: "flood-relief-kerala",
      description: "Emergency support for flood affected families.",
      category: "Relief",
      targetAmount: 500000.0,
      raisedAmount: 0,
      currencyCode: "INR",
      status: "ACTIVE",
      sdgTags: ["SDG1", "SDG11"],
    },
  });

  const existingOrder = await prisma.donation.findUnique({
    where: { razorpayOrderId: DEMO_ORDER_ID },
    select: { id: true },
  });
  if (existingOrder && existingOrder.id !== DEMO_DONATION_ID) {
    throw new DemoSeedError("The demo Razorpay order ID is already assigned to another donation");
  }

  let donation = await prisma.donation.findUnique({
    where: { id: DEMO_DONATION_ID },
  });
  if (!donation) {
    await assertNoPriorSuccessArtifacts(DEMO_DONATION_ID);
    donation = await prisma.donation.create({
      data: {
        id: DEMO_DONATION_ID,
        donorId: donor.id,
        ngoId: ngo.id,
        campaignId: campaign.id,
        amount: DEMO_DONATION_AMOUNT,
        currencyCode: "INR",
        paymentMethod: "UPI",
        status: "INITIATED",
        razorpayOrderId: DEMO_ORDER_ID,
      },
    });
  }

  if (
    donation.donorId !== donor.id ||
    donation.ngoId !== ngo.id ||
    donation.campaignId !== campaign.id ||
    !donation.amount.equals(DEMO_DONATION_AMOUNT) ||
    donation.currencyCode !== "INR" ||
    donation.paymentMethod !== "UPI" ||
    donation.razorpayOrderId !== DEMO_ORDER_ID
  ) {
    throw new DemoSeedError("The stable demo donation ID exists with unexpected fields");
  }
  if (donation.solanaTxHash !== null) {
    throw new DemoSeedError("The demo donation has a Solana transaction hash; refusing to treat it as a simulation");
  }

  let raisedAmountBeforeCompletion: Prisma.Decimal | undefined;
  if (donation.status === "INITIATED") {
    if (donation.razorpayPaymentId !== null) {
      throw new DemoSeedError("An INITIATED demo donation already has a payment ID");
    }
    await assertNoPriorSuccessArtifacts(donation.id);

    const campaignBefore = await prisma.campaign.findUnique({
      where: { id: campaign.id },
      select: {
        status: true,
        targetAmount: true,
        raisedAmount: true,
        allowOverfunding: true,
      },
    });
    if (!campaignBefore || campaignBefore.status !== "ACTIVE") {
      throw new DemoSeedError("The demo campaign must be active before completing its donation");
    }
    if (
      !campaignBefore.allowOverfunding &&
      campaignBefore.targetAmount.minus(campaignBefore.raisedAmount).lessThan(DEMO_DONATION_AMOUNT)
    ) {
      throw new DemoSeedError("The demo campaign does not have capacity for its intended donation");
    }
    raisedAmountBeforeCompletion = campaignBefore.raisedAmount;

    delete process.env.ELASTICSEARCH_URL;
    const { completeDonationSuccess } = await import("../src/services/donationService.js");
    await completeDonationSuccess(
      donation.id,
      { source: "simulation" },
      { skipPostCommitEffects: true },
    );
    donation = await prisma.donation.findUniqueOrThrow({
      where: { id: DEMO_DONATION_ID },
    });
  } else if (donation.status !== "SUCCESS") {
    throw new DemoSeedError(`The stable demo donation is ${donation.status}; refusing another transition`);
  }

  const expectedPaymentId = `pay_sim_${DEMO_DONATION_ID.replace(/-/g, "")}`;
  if (donation.status !== "SUCCESS" || donation.razorpayPaymentId !== expectedPaymentId) {
    throw new DemoSeedError("The demo donation did not reach its expected simulated SUCCESS state");
  }

  const [successEvents, receiptAttestations, retryQueueItem, emailOutboxEntries, finalCampaign] =
    await Promise.all([
      prisma.provenanceEvent.findMany({
        where: { entityId: donation.id, eventType: "DONATION_SUCCESS" },
        orderBy: { id: "asc" },
      }),
      prisma.attestation.count({
        where: {
          donationId: donation.id,
          disbursementId: null,
          type: "RECEIPT",
        },
      }),
      prisma.blockchainRetryQueue.findUnique({ where: { donationId: donation.id } }),
      prisma.emailOutbox.count({ where: { donationId: donation.id } }),
      prisma.campaign.findUnique({
        where: { id: campaign.id },
        select: { raisedAmount: true },
      }),
    ]);

  if (
    successEvents.length !== 1 ||
    successEvents[0].transitionKey !== expectedPaymentId ||
    successEvents[0].entityType !== "Donation" ||
    successEvents[0].amountInr !== DEMO_DONATION_AMOUNT.toFixed(2) ||
    successEvents[0].ngoId !== ngo.id ||
    successEvents[0].campaignId !== campaign.id
  ) {
    throw new DemoSeedError("The demo donation must have exactly one matching DONATION_SUCCESS event");
  }
  if (receiptAttestations !== 1) {
    throw new DemoSeedError("The demo donation must have exactly one receipt attestation");
  }
  if (
    !retryQueueItem ||
    retryQueueItem.operationType !== "RECORD_DONATION" ||
    emailOutboxEntries !== 0
  ) {
    throw new DemoSeedError("The demo donation has inconsistent or unexpected queued side effects");
  }
  if (!finalCampaign || finalCampaign.raisedAmount.lessThan(DEMO_DONATION_AMOUNT)) {
    throw new DemoSeedError("The campaign raised amount does not include the demo donation");
  }
  if (
    raisedAmountBeforeCompletion &&
    finalCampaign.raisedAmount.lessThan(raisedAmountBeforeCompletion.plus(DEMO_DONATION_AMOUNT))
  ) {
    throw new DemoSeedError("The successful transition did not add the demo donation to campaign accounting");
  }

  const provenanceVerification = await verifyProvenanceChain();
  if (!provenanceVerification.valid) {
    throw new DemoSeedError(
      `Provenance chain verification found ${provenanceVerification.errors.length} integrity error(s)`,
    );
  }

  console.log("Demo seed profiles and active campaign are ready; credentials are not printed.");
  console.log(`Demo donation: ${donation.status}, INR ${donation.amount.toFixed(2)}`);
  console.log(`Campaign raised amount: INR ${finalCampaign.raisedAmount.toFixed(2)}`);
  console.log(
    `Provenance chain verified: ${provenanceVerification.checkedEvents} chained events, 0 integrity errors.`,
  );
}

main()
  .catch((error: unknown) => {
    if (error instanceof DemoSeedError) {
      console.error(`Seed failed: ${error.message}`);
    } else {
      const errorName = error instanceof Error ? error.name : "UnknownError";
      const errorCode =
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        typeof error.code === "string"
          ? `/${error.code}`
          : "";
      console.error(`Seed failed (${errorName}${errorCode}); details omitted to avoid exposing account data.`);
    }
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
