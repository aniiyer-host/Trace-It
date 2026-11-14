import { prisma } from '../src/db/prisma.js';
import { HashService } from '../src/services/hashService.js';
import { decryptBeneficiaryForMigration } from '../src/services/beneficiaryEncryptionMigration.js';

const execute = process.argv.includes('--execute');
const keyHex = process.env.AES_BENEFICIARY_KEY;

async function main() {
  const expectedName = process.env.BENEFICIARY_MIGRATION_DATABASE_NAME;
  const expectedHost = process.env.BENEFICIARY_MIGRATION_DATABASE_HOST;
  if (!expectedName || !expectedHost) {
    throw new Error('Set BENEFICIARY_MIGRATION_DATABASE_NAME and BENEFICIARY_MIGRATION_DATABASE_HOST to explicitly allow the target');
  }
  if (!keyHex || !/^[0-9a-fA-F]{64}$/.test(keyHex)) {
    throw new Error('AES_BENEFICIARY_KEY must be configured as 64 hex characters');
  }

  const identity = await prisma.$queryRaw<Array<{ database: string; host: string | null }>>`
    SELECT current_database() AS database, inet_server_addr()::text AS host
  `;
  const target = identity[0];
  if (!target || target.database !== expectedName || target.host !== expectedHost) {
    throw new Error(`Database identity check failed (database=${target?.database ?? 'unknown'}, host=${target?.host ?? 'unknown'})`);
  }

  const campaigns = await prisma.campaign.findMany({
    select: {
      id: true,
      beneficiaryIdEncrypted: true,
      beneficiaryName: true,
      beneficiaryDescription: true,
      beneficiaryNameEncrypted: true,
      beneficiaryDescriptionEncrypted: true,
    },
  });

  let idsToConvert = 0;
  let namesToConvert = 0;
  let descriptionsToConvert = 0;
  for (const campaign of campaigns) {
    if (campaign.beneficiaryIdEncrypted && !campaign.beneficiaryIdEncrypted.startsWith('v1:')) {
      decryptBeneficiaryForMigration(campaign.beneficiaryIdEncrypted);
      idsToConvert++;
    }
    namesToConvert += validateDetail(campaign.beneficiaryNameEncrypted, campaign.beneficiaryName) ? 1 : 0;
    descriptionsToConvert += validateDetail(campaign.beneficiaryDescriptionEncrypted, campaign.beneficiaryDescription) ? 1 : 0;
  }

  console.log(JSON.stringify({
    database: target.database,
    host: target.host,
    mode: execute ? 'execute' : 'dry-run',
    campaignsScanned: campaigns.length,
    beneficiaryIdsToConvert: idsToConvert,
    beneficiaryNamesToConvert: namesToConvert,
    beneficiaryDescriptionsToConvert: descriptionsToConvert,
  }));
  if (!execute) return;

  for (const candidate of campaigns) {
    await prisma.$transaction(async (tx) => {
      const row = await tx.campaign.findUniqueOrThrow({ where: { id: candidate.id } });
      const updates: Record<string, string | null> = {};

      if (row.beneficiaryIdEncrypted && !row.beneficiaryIdEncrypted.startsWith('v1:')) {
        updates.beneficiaryIdEncrypted = HashService.encryptBeneficiaryId(decryptBeneficiaryForMigration(row.beneficiaryIdEncrypted));
      }
      const migratedName = migrateDetail(row.beneficiaryNameEncrypted, row.beneficiaryName);
      const migratedDescription = migrateDetail(row.beneficiaryDescriptionEncrypted, row.beneficiaryDescription);
      if (migratedName !== undefined) updates.beneficiaryNameEncrypted = migratedName;
      if (migratedDescription !== undefined) updates.beneficiaryDescriptionEncrypted = migratedDescription;
      if (row.beneficiaryName !== null) updates.beneficiaryName = null;
      if (row.beneficiaryDescription !== null) updates.beneficiaryDescription = null;

      if (Object.keys(updates).length > 0) {
        const changed = await tx.campaign.updateMany({
          where: {
            id: row.id,
            beneficiaryIdEncrypted: row.beneficiaryIdEncrypted,
            beneficiaryName: row.beneficiaryName,
            beneficiaryDescription: row.beneficiaryDescription,
            beneficiaryNameEncrypted: row.beneficiaryNameEncrypted,
            beneficiaryDescriptionEncrypted: row.beneficiaryDescriptionEncrypted,
          },
          data: updates,
        });
        if (changed.count !== 1) throw new Error('campaign changed during migration; retry after reviewing the row');
      }
    });
  }
  console.log('Beneficiary encryption migration completed.');
}

function validateDetail(encrypted: string | null, plaintext: string | null): boolean {
  if (encrypted) {
    const decoded = decryptBeneficiaryForMigration(encrypted);
    if (plaintext !== null && decoded !== plaintext) {
      throw new Error('encrypted and plaintext beneficiary details conflict; refusing to overwrite');
    }
  }
  return Boolean((encrypted && !encrypted.startsWith('v1:')) || plaintext !== null);
}

function migrateDetail(encrypted: string | null, plaintext: string | null): string | null | undefined {
  if (encrypted) {
    const decoded = decryptBeneficiaryForMigration(encrypted);
    if (plaintext !== null && decoded !== plaintext) {
      throw new Error('encrypted and plaintext beneficiary details conflict; refusing to overwrite');
    }
    if (encrypted.startsWith('v1:')) return plaintext === null ? undefined : encrypted;
    return HashService.encryptSensitiveValue(decoded);
  }
  return plaintext === null ? undefined : HashService.encryptSensitiveValue(plaintext);
}

main().catch((error) => {
  console.error(`Beneficiary encryption migration stopped: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}).finally(async () => {
  await prisma.$disconnect();
});
