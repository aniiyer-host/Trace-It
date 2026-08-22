export default async () => {
  const { prisma } = await import("./dist/src/db/prisma.js");
  await prisma.$disconnect();
};
