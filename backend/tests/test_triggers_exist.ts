import { prisma } from "../src/db/prisma.js";

async function main() {
  console.log("=== Checking if Triggers and Functions Exist ===\\n");

  // Check for existence of functions
  const functionsToCheck = [
    "set_updated_at",
    "sync_campaign_raised",
    "mark_tokens_redeemed",
    "handle_legal_hold",
  ];

  for (const funcName of functionsToCheck) {
    try {
      // Try to call the function with dummy parameters to see if it exists
      // We'll use a query that checks if the function exists in pg_proc
      const result = await prisma.$queryRaw<any[]>`
        SELECT proname
        FROM pg_proc
        WHERE proname = ${funcName}
      `;

      const exists = result.length > 0;
      console.log(`${funcName}: ${exists ? "✅ EXISTS" : "❌ NOT FOUND"}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log(`  ❌ Error ...: ${message}`);
    }
  }
  console.log("");

  // Check for existence of triggers on specific tables
  const tablesAndTriggers = [
    { table: "profiles", trigger: "trg_profiles_updated_at" },
    { table: "campaigns", trigger: "trg_campaigns_updated_at" },
    { table: "donations", trigger: "trg_donations_updated_at" },
    { table: "donations", trigger: "trg_sync_campaign_raised" },
    { table: "donations", trigger: "trg_mark_tokens_redeemed" },
    {
      table: "beneficiary_cohorts",
      trigger: "trg_beneficiary_cohorts_updated_at",
    },
    { table: "disbursements", trigger: "trg_disbursements_updated_at" },
    { table: "documents", trigger: "trg_documents_updated_at" },
    { table: "documents", trigger: "trg_handle_legal_hold" },
    { table: "impact_tokens", trigger: "trg_impact_tokens_updated_at" },
  ];

  for (const { table, trigger } of tablesAndTriggers) {
    try {
      const result = await prisma.$queryRaw<any[]>`
        SELECT tgname
        FROM pg_trigger tg
        JOIN pg_class c ON tg.tgrelid = c.oid
        WHERE c.relname = ${table}
        AND tg.tgname = ${trigger}
      `;

      const exists = result.length > 0;
      console.log(
        `${table}.${trigger}: ${exists ? "✅ EXISTS" : "❌ NOT FOUND"}`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log(`  ❌ Error ...: ${message}`);
    }
  }
  console.log("");

  console.log("=== Check Complete ===");
}

main()
  .catch((e) => {
    console.error("❌ Test failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
