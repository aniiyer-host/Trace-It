const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const donations = await prisma.donation.findMany({
    select: { id: true, donorId: true, amount: true, allocatedAmount: true, status: true, campaignId: true }
  });
  console.log(donations);
}
main().catch(console.error).finally(() => prisma.$disconnect());
