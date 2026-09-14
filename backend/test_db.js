const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const attestations = await prisma.attestation.findMany({
    where: { 
      type: 'DELIVERY' 
    },
  });
  console.log(JSON.stringify(attestations, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
