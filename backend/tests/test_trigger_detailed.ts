import { prisma } from "../src/db/prisma";

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function main() {
  console.log("=== Testing Triggers ===\n");

  // Test 1: set_updated_at trigger (on profiles table)
  console.log("1. Testing set_updated_at trigger (profiles table)...");
  try {
    // Get an admin profile
    const admin = await prisma.profile.findFirst({
      where: { email: "admin@traceit.dev" },
    });
    if (!admin) {
      console.log("  ❌ Admin profile not found");
      return;
    }

    const originalUpdatedAt = admin.updatedAt;
    console.log(`  Original updatedAt: ${originalUpdatedAt}`);

    // Update a non-timestamp field (e.g., phone)
    await prisma.profile.update({
      where: { id: admin.id },
      data: { phone: "+1234567890" },
    });

    const updatedAdmin = await prisma.profile.findUnique({
      where: { id: admin.id },
    });
    const newUpdatedAt = updatedAdmin?.updatedAt;

    console.log(`  New updatedAt: ${newUpdatedAt}`);
    console.log(
      `  Trigger working: ${newUpdatedAt && newUpdatedAt > originalUpdatedAt ? "✅ YES" : "❌ NO"}`,
    );

    // Reset phone
    await prisma.profile.update({
      where: { id: admin.id },
      data: { phone: null },
    });
  } catch (error) {
    console.log(
      `  ❌ Error testing set_updated_at trigger: ${getErrorMessage(error)}`,
    );
  }
  console.log("");

  // Test 2: sync_campaign_raised trigger (on donations table)
  console.log("2. Testing sync_campaign_raised trigger (donations table)...");
  try {
    // Find a campaign to test with
    const campaign = await prisma.campaign.findFirst({
      where: { slug: "education-for-all" },
    });
    if (!campaign) {
      console.log("  ❌ Education for All campaign not found");
      return;
    }

    const originalRaisedAmount = Number(campaign.raisedAmount);
    console.log(`  Campaign: ${campaign.title}`);
    console.log(`  Original raised amount: ${originalRaisedAmount}`);

    // Create a new donation with status INITIATED (trigger won't fire on create)
    const newDonation = await prisma.donation.create({
      data: {
        id: `test-${Date.now()}`,
        publicId: `TEST${Date.now()}`,
        donorId: "33333333-3333-3333-3333-333333333333", // donor@traceit.dev
        ngoId: "22222222-2222-2222-2222-222222222222", // ngo@traceit.dev
        campaignId: campaign.id,
        amount: 1000,
        currencyCode: "INR",
        paymentMethod: "UPI",
        status: "INITIATED",
      },
    });
    console.log(`  Created test donation with status: INITIATED`);

    // Update the donation to SUCCESS (should trigger sync_campaign_raised)
    await prisma.donation.update({
      where: { id: newDonation.id },
      data: { status: "SUCCESS" },
    });
    console.log(`  Updated donation status to: SUCCESS`);

    // Check if campaign's raised amount increased
    const updatedCampaign = await prisma.campaign.findUnique({
      where: { id: campaign.id },
    });
    const newRaisedAmount = Number(updatedCampaign?.raisedAmount || 0);
    const expectedIncrease = 1000; // donation amount

    console.log(`  New raised amount: ${newRaisedAmount}`);
    console.log(`  Expected increase: ${expectedIncrease}`);
    console.log(`  Actual increase: ${newRaisedAmount - originalRaisedAmount}`);
    console.log(
      `  Trigger working: ${newRaisedAmount === originalRaisedAmount + expectedIncrease ? "✅ YES" : "❌ NO"}`,
    );

    // Clean up: delete the test donation
    await prisma.donation.delete({ where: { id: newDonation.id } });
  } catch (error) {
    console.log(
      `  ❌ Error testing sync_campaign_raised trigger: ${getErrorMessage(error)}`,
    );
  }
  console.log("");

  // Test 3: mark_tokens_redeemed trigger (on donations table)
  console.log("3. Testing mark_tokens_redeemed trigger (donations table)...");
  try {
    // Find or create a donation with impact tokens
    // First, check if there are any impact tokens
    const impactTokenCount = await prisma.impactToken.count();
    console.log(`  Total impact tokens in DB: ${impactTokenCount}`);

    if (impactTokenCount === 0) {
      console.log("  No impact tokens found. Creating a test scenario...");

      // Find a campaign
      const campaign = await prisma.campaign.findFirst({
        where: { slug: "clean-water-initiative" },
      });
      if (!campaign) {
        console.log("  ❌ Clean Water Initiative campaign not found");
        return;
      }

      // Create a donation
      const donation = await prisma.donation.create({
        data: {
          id: `test-tokens-${Date.now()}`,
          publicId: `TOKENSTEST${Date.now()}`,
          donorId: "33333333-3333-3333-3333-333333333333",
          ngoId: "22222222-2222-2222-2222-222222222222",
          campaignId: campaign.id,
          amount: 5000,
          currencyCode: "INR",
          paymentMethod: "UPI",
          status: "SUCCESS", // Start with SUCCESS so we can update to DELIVERED
        },
      });

      // Create an impact token for this donation
      await prisma.impactToken.create({
        data: {
          id: `token-${Date.now()}`,
          donationId: donation.id,
          donorId: "33333333-3333-3333-3333-333333333333",
          minted: false,
        },
      });

      console.log(`  Created donation ${donation.id} with 1 impact token`);

      // Verify impact token exists
      const donationWithToken = await prisma.donation.findUnique({
        where: { id: donation.id },
        include: { impactTokens: true },
      });
      console.log(
        `  Impact tokens before update: ${donationWithToken?.impactTokens.length}`,
      );

      // Update donation status to DELIVERED (should trigger mark_tokens_redeemed)
      await prisma.donation.update({
        where: { id: donation.id },
        data: { status: "DELIVERED" },
      });
      console.log(`  Updated donation status to: DELIVERED`);

      // Check if impact token was redeemed
      const updatedDonation = await prisma.donation.findUnique({
        where: { id: donation.id },
        include: { impactTokens: true },
      });
      const redeemedCount =
        updatedDonation?.impactTokens.filter((t) => t.redeemed).length || 0;
      console.log(
        `  Impact tokens after update: ${updatedDonation?.impactTokens.length}`,
      );
      console.log(`  Redeemed impact tokens: ${redeemedCount}`);
      console.log(
        `  Trigger working: ${redeemedCount > 0 ? "✅ YES" : "❌ NO"}`,
      );

      // Clean up
      await prisma.impactToken.deleteMany({
        where: { donationId: donation.id },
      });
      await prisma.donation.delete({ where: { id: donation.id } });
    } else {
      console.log("  Impact tokens already exist. Skipping detailed test.");
      console.log(
        "  To test mark_tokens_redeemed: update a donation status to DELIVERED",
      );
      console.log(
        "  and check if related impact tokens are marked as redeemed.",
      );
    }
  } catch (error) {
    console.log(
      `  ❌ Error testing mark_tokens_redeemed trigger: ${getErrorMessage(error)}`,
    );
  }
  console.log("");

  // Test 4: handle_legal_hold trigger (on documents table)
  console.log("4. Testing handle_legal_hold trigger (documents table)...");
  try {
    // Check if there are any documents
    const docCount = await prisma.document.count();
    console.log(`  Total documents in DB: ${docCount}`);

    if (docCount === 0) {
      console.log("  No documents found. Creating a test document...");
      // Find a profile to own the document
      const owner = await prisma.profile.findFirst({
        where: { email: "admin@traceit.dev" },
      });
      if (!owner) {
        console.log("  ❌ Admin profile not found");
        return;
      }

      // Create a document
      const document = await prisma.document.create({
        data: {
          id: `doc-test-${Date.now()}`,
          ownerId: owner.id,
          documentType: "NGO_CERT",
          status: "ACTIVE",
          storageBucket: "test-bucket",
          storagePath: `test/path/${Date.now()}.pdf`,
          originalFilename: "test.pdf",
          mimeType: "application/pdf",
          sizeBytes: 1024,
          sha512Hash: "a".repeat(128), // SHA-512 is 128 hex chars
          legalHold: false,
        },
      });
      console.log(`  Created document ${document.id} with legalHold: false`);

      // Update to set legalHold: true (should trigger handle_legal_hold)
      await prisma.document.update({
        where: { id: document.id },
        data: { legalHold: true },
      });
      console.log(`  Updated legalHold to: true`);

      // Check if status changed to LEGAL_HOLD
      const updatedDoc = await prisma.document.findUnique({
        where: { id: document.id },
      });
      console.log(
        `  Document status after legalHold=true: ${updatedDoc?.status}`,
      );
      console.log(
        `  Trigger working: ${updatedDoc?.status === "LEGAL_HOLD" ? "✅ YES" : "❌ NO"}`,
      );

      // Reset legalHold to false
      await prisma.document.update({
        where: { id: document.id },
        data: { legalHold: false },
      });
      const resetDoc = await prisma.document.findUnique({
        where: { id: document.id },
      });
      console.log(
        `  Document status after legalHold=false: ${resetDoc?.status} (should be ACTIVE)`,
      );
      console.log(
        `  Reset working: ${resetDoc?.status === "ACTIVE" ? "✅ YES" : "❌ NO"}`,
      );

      // Clean up
      await prisma.document.delete({ where: { id: document.id } });
    } else {
      console.log(
        "  Documents already exist. Testing with existing document...",
      );
      // Take the first document and test the trigger
      const doc = await prisma.document.findFirst();
      if (doc) {
        console.log(`  Testing with document ${doc.id}`);
        console.log(
          `  Current status: ${doc.status}, legalHold: ${doc.legalHold}`,
        );

        // Toggle legalHold
        await prisma.document.update({
          where: { id: doc.id },
          data: { legalHold: !doc.legalHold },
        });

        const updatedDoc = await prisma.document.findUnique({
          where: { id: doc.id },
        });
        const expectedStatus = !doc.legalHold ? "LEGAL_HOLD" : "ACTIVE";
        console.log(
          `  New status: ${updatedDoc?.status} (expected: ${expectedStatus})`,
        );
        console.log(
          `  Trigger working: ${updatedDoc?.status === expectedStatus ? "✅ YES" : "❌ NO"}`,
        );

        // Reset back
        await prisma.document.update({
          where: { id: doc.id },
          data: { legalHold: doc.legalHold },
        });
      }
    }
  } catch (error) {
    console.log(
      `  ❌ Error testing handle_legal_hold trigger: ${getErrorMessage(error)}`,
    );
  }
  console.log("");

  console.log("=== All Trigger Tests Completed ===");
}

main()
  .catch((e) => {
    console.error("❌ Test failed:", getErrorMessage(e));
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
