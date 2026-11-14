import crypto from 'node:crypto';
import { HashService } from './hashService.js';

/** Migration-only reader. Do not import this module from request handling code. */
export function decryptBeneficiaryForMigration(value: string): string {
  if (value.startsWith('v1:')) return HashService.decryptSensitiveValue(value);
  if (value.includes(':')) throw new Error('unsupported legacy encryption version');
  const keyHex = process.env.AES_BENEFICIARY_KEY;
  if (!keyHex || !/^[0-9a-fA-F]{64}$/.test(keyHex)) {
    throw new Error('AES_BENEFICIARY_KEY must be configured as 64 hex characters');
  }
  const bytes = Buffer.from(value, 'base64');
  if (!value || bytes.toString('base64') !== value || bytes.length < 32 || (bytes.length - 16) % 16 !== 0) {
    throw new Error('invalid legacy CBC ciphertext');
  }
  const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(keyHex, 'hex'), bytes.subarray(0, 16));
  return Buffer.concat([decipher.update(bytes.subarray(16)), decipher.final()]).toString('utf8');
}
