import { prisma } from "../src/db/prisma.js";

async function main() {
  const [trigger] = await prisma.$queryRaw<Array<{ exists: boolean }>>`
    SELECT EXISTS (
      SELECT 1 FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      WHERE c.relname = 'donations'
        AND t.tgname = 'trg_sync_campaign_raised'
        AND NOT t.tgisinternal
    ) AS exists
  `;
  if (trigger?.exists) {
    throw new Error("trg_sync_campaign_raised must be absent; campaign balances are updated in application transactions");
  }
  console.log("Campaign raised-amount trigger is absent.");
}

main()
  .catch((error) => {
    console.error("Trigger removal check failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
