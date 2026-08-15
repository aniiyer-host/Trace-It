export default async () => {
  const { prisma } = await import("./src/db/prisma");
  await prisma.$disconnect();
};
