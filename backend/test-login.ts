import { prisma } from './src/db/prisma.js';
import { login } from './src/services/authService.js';

async function main() {
  try {
    const res = await login('donor@traceit.dev', 'donor-secret');
    console.log('Login success:', res.accessToken.substring(0, 20) + '...');
  } catch (e) {
    console.error('Login failed:', e);
    const u = await prisma.profile.findUnique({where: {email: 'donor@traceit.dev'}});
    console.log('User in DB:', u);
  } finally {
    await prisma.$disconnect();
  }
}
main();
