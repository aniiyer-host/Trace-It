import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export class StorageService {
  private bucketName: string;
  private s3Client: S3Client;

  constructor(bucketName: string) {
    this.bucketName = bucketName;

    // Backblaze B2 specific config
    const endpoint = process.env.B2_ENDPOINT;
    const accessKeyId = process.env.B2_KEY_ID;
    const secretAccessKey = process.env.B2_APPLICATION_KEY;
    const region = process.env.B2_REGION || 'us-west-002';

    if (!endpoint || !accessKeyId || !secretAccessKey) {
      console.warn('Storage credentials missing. Ensure B2_ENDPOINT, B2_KEY_ID, and B2_APPLICATION_KEY are set.');
    }

    this.s3Client = new S3Client({
      endpoint: endpoint,
      region: region,
      credentials: {
        accessKeyId: accessKeyId || '',
        secretAccessKey: secretAccessKey || '',
      },
    });
  }

  /**
   * Upload a file to the bucket.
   * @param buffer - The file buffer to upload.
   * @param path - The path (key) in the bucket where the file will be stored.
   * @param mimeType - The MIME type of the file.
   * @returns Promise<void>
   */
  async uploadFile(buffer: Buffer, path: string, mimeType: string): Promise<void> {
    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: path,
      Body: buffer,
      ContentType: mimeType,
    });

    try {
      await this.s3Client.send(command);
      console.log(`Successfully uploaded file to ${this.bucketName}/${path}`);
    } catch (error) {
      console.error(`Error uploading file to ${this.bucketName}/${path}:`, error);
      throw error;
    }
  }

  /**
   * Get a signed URL for a file in the bucket.
   * @param path - The path (key) of the file in the bucket.
   * @param ttlSeconds - Time to live for the signed URL in seconds.
   * @returns Promise<string> - The signed URL.
   */
  async getSignedUrl(path: string, ttlSeconds: number): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: path,
    });

    try {
      const url = await getSignedUrl(this.s3Client, command, { expiresIn: ttlSeconds });
      return url;
    } catch (error) {
      console.error(`Error generating signed URL for ${this.bucketName}/${path}:`, error);
      throw error;
    }
  }

  /**
   * Delete a file from the bucket.
   * @param path - The path (key) of the file to delete.
   * @returns Promise<void>
   */
  async deleteFile(path: string): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: this.bucketName,
      Key: path,
    });

    try {
      await this.s3Client.send(command);
      console.log(`Successfully deleted file ${this.bucketName}/${path}`);
    } catch (error) {
      console.error(`Error deleting file ${this.bucketName}/${path}:`, error);
      throw error;
    }
  }
}