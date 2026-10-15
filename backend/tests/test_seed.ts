import { prisma } from "../src/db/prisma.js";

async function main() {
  console.log("Testing seeded data...");

  // Test 1: Count profiles
  const [adminCount, ngoCount, donorCount, donor2Count] = await Promise.all([
    prisma.profile.count({ where: { id: "11111111-1111-1111-1111-111111111111" } }),
    prisma.profile.count({ where: { id: "22222222-2222-2222-2222-222222222222" } }),
    prisma.profile.count({ where: { id: "33333333-3333-3333-3333-333333333333" } }),
    prisma.profile.count({ where: { id: "44444444-4444-4444-4444-444444444444" } }),
  ]);

  console.log(`Admin profile exists: ${adminCount > 0}`);
  console.log(`NGO profile exists: ${ngoCount > 0}`);
  console.log(`Donor 1 profile exists: ${donorCount > 0}`);
  console.log(`Donor 2 profile exists: ${donor2Count > 0}`);

  // Test 2: Count campaigns
  const campaignCount = await prisma.campaign.count();
  console.log(`Total campaigns: ${campaignCount}`);

  // Test 3: Count donations
  const donationCount = await prisma.donation.count();
  console.log(`Total donations: ${donationCount}`);

  // Test 4: Check specific campaign
  const floodCampaign = await prisma.campaign.findFirst({
    where: { slug: "flood-relief-kerala" },
  });
  console.log(`Flood Relief Kerala campaign exists: ${!!floodCampaign}`);
  if (floodCampaign) {
    console.log(`  Title: ${floodCampaign.title}`);
    console.log(`  Goal Amount: ${floodCampaign.targetAmount}`);
    console.log(`  Raised Amount: ${floodCampaign.raisedAmount}`);
    console.log(`  Status: ${floodCampaign.status}`);
  }

  // Test 5: Check donation with campaign
  const donationWithCampaign = await prisma.donation.findFirst({
    where: { publicId: "demoabcd1234" },
    include: { project: true, ngo: true, donor: true },
  });
  console.log(`Donation demoabcd1234 exists: ${!!donationWithCampaign}`);
  if (donationWithCampaign) {
    console.log(`  Amount: ${donationWithCampaign.amount}`);
    console.log(`  Status: ${donationWithCampaign.status}`);
    console.log(`  Campaign: ${donationWithCampaign.project?.title}`);
    console.log(`  NGO: ${donationWithCampaign.ngo?.fullName}`);
    console.log(`  Donor: ${donationWithCampaign.donor?.fullName}`);
  }

  // Test 6: List all profiles with roles
  const allProfiles = await prisma.profile.findMany({
    select: {
      id: true,
      role: true,
      isVerified: true,
      ngoStatus: true,
    },
  });
  console.log(`\\nAll profiles (${allProfiles.length}):`);
  for (const profile of allProfiles) {
    console.log(
      `  - ${profile.role} profile verified: ${profile.isVerified}, NGO status: ${profile.ngoStatus}`,
    );
  }

  console.log("\\n✅ All tests completed successfully!");
}

main()
  .catch((e) => {
    console.error("❌ Test failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
