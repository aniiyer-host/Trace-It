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
}