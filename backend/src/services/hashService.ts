import crypto from 'crypto';

export class HashService {
  static normalizePan(pan: string): string {
    const normalizedPan = pan.trim().toUpperCase();
    if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(normalizedPan)) {
      throw new Error('Invalid PAN format');
    }
    return normalizedPan;
  }

  static beneficiaryIdFromPan(pan: string, key: string, campaignId: string): string {
    const normalizedPan = HashService.normalizePan(pan);
    return `BEN-${HashService.hmacSha256(`traceit:beneficiary-id:v1:${campaignId}:${normalizedPan}`, key)}`;
  }

  static beneficiaryIdVerifier(id: string, campaignId: string, key: string): string {
    return HashService.hmacSha256(`traceit:beneficiary:v1:${campaignId}:${id.trim()}`, key);
  }
  /**
   * Compute SHA-512 hash of a buffer.
   * @param data - The data to hash (Buffer or string)
   * @returns Hexadecimal string of the hash
   */
  static sha512(data: Buffer | string): string {
    const hash = crypto.createHash('sha512');
    hash.update(data);
    return hash.digest('hex');
  }

  /**
   * Compute HMAC-SHA512 of data using a key.
   * @param data - The data to hash (Buffer or string)
   * @param key - The secret key (Buffer or string)
   * @returns Hexadecimal string of the HMAC
   */
  static hmacSha512(data: Buffer | string, key: Buffer | string): string {
    const hmac = crypto.createHmac('sha512', key);
    hmac.update(data);
    return hmac.digest('hex');
  }

  static hmacSha256(data: Buffer | string, key: Buffer | string): string {
    return crypto.createHmac('sha256', key).update(data).digest('hex');
  }

  static encryptBeneficiaryId(id: string): string {
    return HashService.encryptSensitiveValue(id);
  }

  static decryptBeneficiaryId(encryptedBase64: string): string {
    return HashService.decryptSensitiveValue(encryptedBase64);
  }

  static encryptSensitiveValue(value: string): string {
    const keyString = process.env.AES_BENEFICIARY_KEY;
    if (!keyString) throw new Error('AES_BENEFICIARY_KEY is not defined in environment variables');
    const key = Buffer.from(keyString, 'hex');
    if (key.length !== 32) throw new Error('AES_BENEFICIARY_KEY must be a 64-character hex string (32 bytes)');

    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    return `v1:${Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64')}`;
  }

  static decryptSensitiveValue(encryptedValue: string): string {
    const keyString = process.env.AES_BENEFICIARY_KEY;
    if (!keyString) throw new Error('AES_BENEFICIARY_KEY is not defined in environment variables');
    const key = Buffer.from(keyString, 'hex');
    if (key.length !== 32) throw new Error('AES_BENEFICIARY_KEY must be a 64-character hex string (32 bytes)');

    if (encryptedValue.startsWith('v1:')) {
      const data = Buffer.from(encryptedValue.slice(3), 'base64');
      const iv = data.subarray(0, 12);
      const tag = data.subarray(12, 28);
      const ciphertext = data.subarray(28);
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
    }

    // Legacy CBC ciphertext compatibility for IDs created before v1.
    const data = Buffer.from(encryptedValue, 'base64');
    const iv = data.subarray(0, 16);
    const encrypted = data.subarray(16);
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString('utf8');
  }
}
