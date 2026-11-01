import { prisma } from '../../src/db/prisma.js';

const DISPOSABLE_DATABASE_NAME_PATTERN = /^traceit_reliability_e2e_[a-z0-9_]+$/;

export async function requireDisposableIntegrationDatabase(): Promise<void> {
  const expectedDatabaseName = process.env.TRACEIT_INTEGRATION_TEST_DATABASE_NAME?.trim();
  const expectedHost = process.env.TRACEIT_INTEGRATION_TEST_DATABASE_HOST?.trim().toLowerCase();
  const databaseUrl = process.env.DATABASE_URL;

  if (process.env.TRACEIT_INTEGRATION_TEST_DATABASE_DISPOSABLE !== 'YES_I_CONFIRM') {
    throw new Error('PostgreSQL integration-test writes require TRACEIT_INTEGRATION_TEST_DATABASE_DISPOSABLE=YES_I_CONFIRM');
  }
  if (!expectedDatabaseName || !DISPOSABLE_DATABASE_NAME_PATTERN.test(expectedDatabaseName)) {
    throw new Error('TRACEIT_INTEGRATION_TEST_DATABASE_NAME must be a dedicated traceit_reliability_e2e_* database name');
  }
  if (!expectedHost || !databaseUrl) {
    throw new Error('TRACEIT_INTEGRATION_TEST_DATABASE_HOST and DATABASE_URL are required for PostgreSQL integration tests');
  }

  let configuredHost: string;
  try {
    configuredHost = new URL(databaseUrl).hostname.toLowerCase().replace(/\.$/, '');
  } catch {
    throw new Error('DATABASE_URL must be a valid PostgreSQL URL for integration tests');
  }
  if (configuredHost !== expectedHost.replace(/\.$/, '')) {
    throw new Error('DATABASE_URL host does not match TRACEIT_INTEGRATION_TEST_DATABASE_HOST');
  }

  const [identity] = await prisma.$queryRaw<Array<{ databaseName: string }>>`
    SELECT current_database() AS "databaseName"
  `;
  if (identity?.databaseName !== expectedDatabaseName) {
    throw new Error('Connected PostgreSQL database does not match TRACEIT_INTEGRATION_TEST_DATABASE_NAME');
  }
}
