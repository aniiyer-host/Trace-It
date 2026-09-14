import crypto from 'crypto';

export class HashService {
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

  /**
   * Encrypt the raw beneficiary ID using AES-256-CBC
   * @param id - The raw beneficiary ID string
   * @returns Base64 string of IV + Ciphertext
   */
  static encryptBeneficiaryId(id: string): string {
    const keyString = process.env.AES_BENEFICIARY_KEY;
    if (!keyString) throw new Error('AES_BENEFICIARY_KEY is not defined in environment variables');
    const key = Buffer.from(keyString, 'hex');
    if (key.length !== 32) throw new Error('AES_BENEFICIARY_KEY must be a 64-character hex string (32 bytes)');

    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    
    const encrypted = Buffer.concat([cipher.update(id, 'utf8'), cipher.final()]);
    return Buffer.concat([iv, encrypted]).toString('base64');
  }

  /**
   * Decrypt the beneficiary ID using AES-256-CBC
   * @param encryptedBase64 - The Base64 string (IV + Ciphertext)
   * @returns The decrypted raw beneficiary ID string
   */
  static decryptBeneficiaryId(encryptedBase64: string): string {
    const keyString = process.env.AES_BENEFICIARY_KEY;
    if (!keyString) throw new Error('AES_BENEFICIARY_KEY is not defined in environment variables');
    const key = Buffer.from(keyString, 'hex');
    if (key.length !== 32) throw new Error('AES_BENEFICIARY_KEY must be a 64-character hex string (32 bytes)');

    const data = Buffer.from(encryptedBase64, 'base64');
    const iv = data.subarray(0, 16);
    const encrypted = data.subarray(16);
    
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString('utf8');
  }
}