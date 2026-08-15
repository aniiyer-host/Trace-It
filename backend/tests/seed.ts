import { prisma } from "../src/db/prisma";
import bcrypt from "bcryptjs";

async function main() {
  console.log("Starting seed...");

  // Create admin user
  const admin = await prisma.profile.upsert({
    where: { email: "admin@traceit.dev" },
    update: {},
    create: {
      id: "11111111-1111-1111-1111-111111111111",
      email: "admin@traceit.dev",
      fullName: "TraceIt Admin",
      role: "ADMIN",
      isVerified: true,
      ngoStatus: "ACTIVE",
      organisationName: "TraceIt",
      // Note: We are not setting authUserId because we are not using Supabase auth in seed.
      // In a real scenario, authUserId would be set when the user signs up via Supabase.
      // For seed, we leave it as null (or undefined) and rely on email and password for auth.
      // However, note that the implementation plan uses email OTP for verification, not password login initially.
      // We are adding passwordHash for bcrypt, but we'll set a placeholder for the admin.
      passwordHash: await bcrypt.hash("admin-secret", 12), // We need to import bcrypt
    },
  });
  console.log(`Created admin: ${admin.email}`);

  // Create NGO
  const ngo = await prisma.profile.upsert({
    where: { email: "ngo@traceit.dev" },
    update: {},
    create: {
      id: "22222222-2222-2222-2222-222222222222",
      email: "ngo@traceit.dev",
      fullName: "NGO Operator",
      role: "CHARITY",
      isVerified: true,
      ngoStatus: "ACTIVE",
      organisationName: "Hope Relief Foundation",
      registrationNo: "REG-001",
      // passwordHash: await bcrypt.hash('ngo-secret', 12),
    },
  });
  console.log(`Created NGO: ${ngo.email}`);

  // Create donors
  const donor1 = await prisma.profile.upsert({
    where: { email: "donor@traceit.dev" },
    update: {},
    create: {
      id: "33333333-3333-3333-3333-333333333333",
      email: "donor@traceit.dev",
      fullName: "Demo Donor",
      role: "DONOR",
      isVerified: true,
      ngoStatus: "ACTIVE",
      kycStatus: "APPROVED",
      // passwordHash: await bcrypt.hash('donor-secret', 12),
    },
  });
  console.log(`Created donor: ${donor1.email}`);

  const donor2 = await prisma.profile.upsert({
    where: { email: "donor2@traceit.dev" },
    update: {},
    create: {
      id: "44444444-4444-4444-4444-444444444444",
      email: "donor2@traceit.dev",
      fullName: "Another Donor",
      role: "DONOR",
      isVerified: true,
      ngoStatus: "ACTIVE",
      kycStatus: "NOT_REQUIRED", // This donor hasn't done KYC yet
      // passwordHash: await bcrypt.hash('donor2-secret', 12),
    },
  });
  console.log(`Created donor2: ${donor2.email}`);

  // Create campaigns
  const campaign1 = await prisma.campaign.upsert({
    where: { slug: "flood-relief-kerala" },
    update: {},
    create: {
      id: "44444444-4444-4444-4444-444444444444",
      ngoId: ngo.id,
      title: "Flood Relief Kerala",
      slug: "flood-relief-kerala",
      description: "Emergency support for flood affected families.",
      category: "Relief",
      targetAmount: 500000.0,
      raisedAmount: 25000.0,
      currencyCode: "INR",
      status: "ACTIVE",
      sdgTags: ["SDG1", "SDG11"],
    },
  });
  console.log(`Created campaign: ${campaign1.title}`);

  // We can create two more campaigns if needed, but the seed says 3 campaigns.
  // Let's create two more.

  const campaign2 = await prisma.campaign.upsert({
    where: { slug: "education-for-all" },
    update: {},
    create: {
      id: "55555555-5555-5555-5555-555555555555",
      ngoId: ngo.id,
      title: "Education for All",
      slug: "education-for-all",
      description: "Providing school supplies to underprivileged children.",
      category: "Education",
      targetAmount: 300000.0,
      raisedAmount: 0.0,
      currencyCode: "INR",
      status: "DRAFT",
      sdgTags: ["SDG4"],
    },
  });
  console.log(`Created campaign: ${campaign2.title}`);

  const campaign3 = await prisma.campaign.upsert({
    where: { slug: "clean-water-initiative" },
    update: {},
    create: {
      id: "66666666-6666-6666-6666-666666666666",
      ngoId: ngo.id,
      title: "Clean Water Initiative",
      slug: "clean-water-initiative",
      description: "Building wells in rural communities.",
      category: "Health",
      targetAmount: 200000.0,
      raisedAmount: 0.0,
      currencyCode: "INR",
      status: "PENDING_APPROVAL",
      sdgTags: ["SDG6"],
    },
  });
  console.log(`Created campaign: ${campaign3.title}`);

  // Create donations (optional, but we can create one as in the SQL)
  const donation1 = await prisma.donation.upsert({
    where: { publicId: "demoabcd1234" },
    update: {},
    create: {
      id: "77777777-7777-7777-7777-777777777777",
      publicId: "demoabcd1234",
      donorId: donor1.id,
      ngoId: ngo.id,
      campaignId: campaign1.id,
      amount: 5000.0,
      currencyCode: "INR",
      paymentMethod: "UPI",
      status: "SUCCESS",
      razorpayOrderId: "order_demo_001",
      razorpayPaymentId: "pay_demo_001",
    },
  });
  console.log(`Created donation: ${donation1.publicId}`);

  console.log("Seed completed.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
