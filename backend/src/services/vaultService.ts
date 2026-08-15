// vaultService.ts
// Wrapper for HashiCorp Vault KV-v2 secrets engine.
// Note: This requires the 'node-vault' package or '@hashicorp/vault' to be installed.
// We'll use 'node-vault' as an example, but the actual implementation may vary.

import Vault from 'node-vault';

// Initialize Vault client.
// In a real implementation, we would read the Vault address and token from environment variables.
// For example:
//   const vault = Vault({
//     endpoint: process.env.VAULT_ADDR,
//     token: process.env.VAULT_TOKEN,
//   });

// We'll create a class that can be instantiated with the Vault client or initialize it internally.

export class VaultService {
  private vault: any; // Type would be the Vault client from 'node-vault'

  constructor(options: { endpoint: string; token: string }) {
    this.vault = Vault({
      endpoint: options.endpoint,
      token: options.token,
      // apiVersion: 'v1', // default
    });
  }

  /**
   * Get a secret from the Vault KV-v2 engine at the specified path.
   * @param path - The path in Vault (e.g., 'traceit/secrets')
   * @param key - The key of the secret to retrieve.
   * @returns Promise<string | undefined> - The secret value or undefined if not found.
   */
  async getSecret(path: string, key: string): Promise<string | undefined> {
    try {
      const data = await this.vault.read({ path: `${path}/data/${key}` });
      // Note: The response structure for KV-v2 is: { request_id, lease_id, renewable, data: { data: { ... } } }
      // We assume the secret is stored under the 'data' key in the response.
      return data.data.data[key];
    } catch (error) {
      console.error(`Error reading secret from Vault at path ${path}:${key}`, error);
      return undefined;
    }
  }

  /**
   * Set a secret in the Vault KV-v2 engine at the specified path.
   * @param path - The path in Vault (e.g., 'traceit/secrets')
   * @param key - The key of the secret to store.
   * @param value - The value to store.
   * @returns Promise<void>
   */
  async setSecret(path: string, key: string, value: string): Promise<void> {
    try {
      // For KV-v2, we write to the 'data' subdirectory.
      // We need to read the existing data, merge, and write back? Or we can just set the key.
      // The Vault KV-v2 API allows setting a key by writing to `data/<key>` with the value.
      // However, the 'write' method in node-vault for KV-v2 expects the data to be under the 'data' key in the request body.
      // We'll write an object with the key-value pair.
      await this.vault.write({ path: `${path}/data`, data: { [key]: value } });
    } catch (error) {
      console.error(`Error setting secret in Vault at path ${path}:${key}`, error);
      throw error;
    }
  }
}

// Example usage:
//   const vaultService = new VaultService({
//     endpoint: process.env.VAULT_ADDR!,
//     token: process.env.VAULT_TOKEN!
//   });
//   const secret = await vaultService.getSecret('traceit/secrets', 'JWT_SECRET');