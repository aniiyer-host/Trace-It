import crypto from 'crypto';
import { prisma } from '../db/prisma';
import { StorageService } from './storageService';
import { HashService } from './hashService';
import { DocumentType } from '../../generated/prisma/enums';

// We use the proof-docs bucket for these uploads per the plan.
const storageService = new StorageService('proof-docs');

export interface UploadDocumentOpts {
  campaignId?: string;
  disbursementId?: string;
  ttlExpiry?: Date;
}

export class DocumentService {
  /**
   * Encrypt a buffer using AES-256-CBC.
   */
  private static encryptBuffer(buffer: Buffer): Buffer {
    const keyString = process.env.AES_DOCUMENT_KEY;
    if (!keyString) {
      throw new Error('AES_DOCUMENT_KEY is not defined in environment variables');
    }
    // Key must be 32 bytes (256 bits)
    const key = Buffer.from(keyString, 'hex');
    if (key.length !== 32) {
      throw new Error('AES_DOCUMENT_KEY must be a 64-character hex string (32 bytes)');
    }

    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    
    const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
    // Prepend the IV to the encrypted data for use during decryption
    return Buffer.concat([iv, encrypted]);
  }

  /**
   * Uploads a document, encrypts it, hashes it, and stores the metadata in the database.
   */
  static async uploadDocument(
    file: Express.Multer.File,
    ownerId: string,
    docType: DocumentType,
    opts?: UploadDocumentOpts
  ) {
    // 1. Hash the original buffer
    const sha512Hash = HashService.sha512(file.buffer);

    // 2. Encrypt the buffer
    const encryptedBuffer = this.encryptBuffer(file.buffer);

    // 3. Generate a unique storage path (e.g., ownerId/uuid.ext)
    const ext = file.originalname.split('.').pop() || 'bin';
    const uniqueId = crypto.randomUUID();
    const storagePath = `${ownerId}/${docType}/${uniqueId}.${ext}`;

    // 4. Upload to B2
    await storageService.uploadFile(encryptedBuffer, storagePath, file.mimetype);

    // 5. Save to Prisma
    const document = await prisma.document.create({
      data: {
        ownerId,
        campaignId: opts?.campaignId,
        disbursementId: opts?.disbursementId,
        documentType: docType,
        storageBucket: 'proof-docs',
        storagePath: storagePath,
        originalFilename: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        sha512Hash: sha512Hash,
        ttlExpiry: opts?.ttlExpiry,
      },
    });

    return document;
  }

  /**
   * Generates a signed URL for a document after checking ownership.
   */
  static async getDocumentUrl(documentId: string, requesterId: string, ttlSeconds: number = 900): Promise<string> {
    const document = await prisma.document.findUnique({
      where: { id: documentId },
    });

    if (!document) {
      throw new Error('Document not found');
    }

    // Basic ownership check. Admins might need bypass in the future.
    if (document.ownerId !== requesterId) {
      throw new Error('Unauthorized to access this document');
    }

    // In a full implementation we might need to route to the correct bucket based on document.storageBucket.
    // For now, we instantiate a new StorageService for the specific bucket.
    const specificStorageService = new StorageService(document.storageBucket);
    return specificStorageService.getSignedUrl(document.storagePath, ttlSeconds);
  }
}
