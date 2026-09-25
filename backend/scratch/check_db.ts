import { prisma } from '../src/db/prisma.js';

async function main() {
  const attestations = await prisma.attestation.findMany({
    where: {
      type: 'DELIVERY',
      status: 'PENDING',
    },
    include: {
      donation: true
    }
  });
  console.log(JSON.stringify(attestations, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
