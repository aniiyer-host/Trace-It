import { prisma } from '../src/db/prisma.js';

async function main() {
  const donations = await prisma.donation.findMany({
    select: { id: true, amount: true, allocatedAmount: true, status: true, donorId: true }
  });
  console.log(JSON.stringify(donations, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
