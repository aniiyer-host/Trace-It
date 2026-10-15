import { prisma } from './src/db/prisma.js';
import { login } from './src/services/authService.js';

async function main() {
  try {
    const donorEmail = process.env.TRACEIT_TEST_DONOR_EMAIL?.trim() || 'donor@traceit.dev';
    const res = await login(donorEmail, 'donor-secret');
    console.log('Login success.');
  } catch (e) {
    console.error(`Login failed (${e instanceof Error ? e.name : 'UnknownError'}).`);
  } finally {
    await prisma.$disconnect();
  }
}
main();
