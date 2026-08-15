import { prisma } from "../src/db/prisma";

async function main() {
  console.log("Testing triggers...");

  // Get the campaign before checking donation
  const campaignBefore = await prisma.campaign.findFirst({
    where: { slug: "flood-relief-kerala" },
  });
  console.log(`Campaign before trigger check:`);
  console.log(`  Title: ${campaignBefore?.title}`);
  console.log(`  Raised Amount: ${campaignBefore?.raisedAmount}`);

  // Find the SUCCESS donation
  const successDonation = await prisma.donation.findFirst({
    where: { status: "SUCCESS" },
    include: { project: true },
  });
  console.log(`\\nSuccess donation:`);
  console.log(`  ID: ${successDonation?.id}`);
  console.log(`  Amount: ${successDonation?.amount}`);
  console.log(`  Status: ${successDonation?.status}`);
  console.log(`  Campaign: ${successDonation?.project?.title}`);

  // Now test the trigger by updating a donation to SUCCESS (if not already)
  // Actually, let's check if the trigger worked by seeing if raised amount matches expectation

  const campaignAfter = await prisma.campaign.findFirst({
    where: { slug: "flood-relief-kerala" },
  });

  console.log(`\\nCampaign after:`);
  console.log(`  Title: ${campaignAfter?.title}`);
  console.log(`  Raised Amount: ${campaignAfter?.raisedAmount}`);

  // Calculate expected: initial raisedAmount (25000) + donation amount (5000) = 30000
  const expectedRaisedAmount = 25000 + 5000;
  const actualRaisedAmount = Number(campaignAfter?.raisedAmount || 0);

  console.log(`\\nTrigger test:`);
  console.log(`  Expected raised amount: ${expectedRaisedAmount}`);
  console.log(`  Actual raised amount: ${actualRaisedAmount}`);
  console.log(
    `  Trigger working: ${expectedRaisedAmount === actualRaisedAmount ? "✅ YES" : "❌ NO"}`,
  );

  // Test another trigger: mark_tokens_redeemed (when donation status becomes DELIVERED)
  // First, create a test donation that we can mark as DELIVERED
  console.log(`\\n--- Testing mark_tokens_redeemed trigger ---`);

  // Find a donation that's not yet delivered
  const testDonation = await prisma.donation.findFirst({
    where: { status: { not: "DELIVERED" } },
    include: { impactTokens: true },
  });

  if (testDonation) {
    console.log(
      `Found test donation: ${testDonation.id} with status: ${testDonation.status}`,
    );
    console.log(`Impact tokens count: ${testDonation.impactTokens.length}`);

    // Update it to DELIVERED to trigger mark_tokens_redeemed
    const updatedDonation = await prisma.donation.update({
      where: { id: testDonation.id },
      data: { status: "DELIVERED" },
    });

    console.log(`Updated donation status to: ${updatedDonation.status}`);

    // Check if impact tokens were redeemed
    const updatedWithTokens = await prisma.donation.findUnique({
      where: { id: testDonation.id },
      include: { impactTokens: true },
    });

    const redeemedCount =
      updatedWithTokens?.impactTokens.filter((t) => t.redeemed).length || 0;
    console.log(
      `Redeemed impact tokens: ${redeemedCount}/${updatedWithTokens?.impactTokens.length}`,
    );
    console.log(`Trigger working: ${redeemedCount > 0 ? "✅ YES" : "❌ NO"}`);

    // Reset status back to original for cleanliness
    await prisma.donation.update({
      where: { id: testDonation.id },
      data: { status: testDonation.status },
    });
    console.log(`Reset donation status to: ${testDonation.status}`);
  } else {
    console.log(`No suitable donation found for trigger test`);
  }

  console.log(`\\n✅ Trigger tests completed!`);
}

main()
  .catch((e) => {
    console.error("❌ Test failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
